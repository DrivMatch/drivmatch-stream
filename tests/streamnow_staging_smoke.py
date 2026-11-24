"""Check the existing staging Worker with disposable users and no email delivery."""
from http.cookiejar import CookieJar
import json
import os
import re
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, HTTPCookieProcessor, Request, build_opener, urlopen
from uuid import uuid4

DEFAULT_ORIGIN = "https://drivmatch-stream-v2-test.drivmatch.workers.dev"
ORIGIN = os.environ.get("STREAMNOW_SMOKE_ORIGIN", DEFAULT_ORIGIN)
if ORIGIN not in {
    DEFAULT_ORIGIN, "https://streamnow-2o1.pages.dev",
    "https://contas-compartilhadas.streamnow-2o1.pages.dev",
}:
    raise RuntimeError("Unexpected Stream Now smoke-test origin")


def send(url, *, method="GET", body=None, headers=None, open_url=urlopen):
    request = Request(url, data=body, headers=headers or {}, method=method)
    try:
        with open_url(request, timeout=25) as response:
            return response.status, response.read()
    except HTTPError as error:
        raise RuntimeError(f"{method} {urlsplit(url).path} returned HTTP {error.code}") from None


def api(url, *, method="GET", data=None, headers=None):
    status, payload = send(
        url, method=method, headers={"Content-Type": "application/json", **(headers or {})},
        body=json.dumps(data).encode() if data is not None else None,
    )
    return json.loads(payload) if payload and status != 204 else {}


def sign_in(email, password, user_id, user_agent):
    browser = build_opener(HTTPCookieProcessor(CookieJar()))
    browser.addheaders = [("User-Agent", user_agent)]
    _, page = send(ORIGIN + "/stream/login", open_url=browser.open)
    token = re.search(rb"name='_csrf' value='([^']+)'", page)
    assert token, "Missing signed login form token"
    send(
        ORIGIN + "/stream/login", method="POST", open_url=browser.open,
        headers={"Content-Type": "application/x-www-form-urlencoded", "Origin": ORIGIN},
        body=urlencode({"email": email, "password": password, "_csrf": token[1].decode()}).encode(),
    )
    _, session = send(ORIGIN + "/stream/session", open_url=browser.open)
    identity = json.loads(session)
    assert identity["user_id"] == user_id and identity["role"] == "viewer"
    return browser


def favorites(browser):
    _, result = send(ORIGIN + "/stream/favorites", open_url=browser.open)
    return json.loads(result)["favorites"]


def favorite_change(browser, key, operation):
    _, result = send(
        ORIGIN + "/stream/favorites", method="POST", open_url=browser.open,
        headers={"Content-Type": "application/json", "Origin": ORIGIN},
        body=json.dumps({"key": key, "operation": operation}).encode(),
    )
    assert json.loads(result)["ok"]


class StopRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, handle, code, message, headers, target):
        return None


def verify_recovery(base, auth_headers, email, user_id, old_session):
    callback = DEFAULT_ORIGIN + "/stream/activate"
    link = api(base + "/auth/v1/admin/generate_link", method="POST", headers=auth_headers,
               data={"type": "recovery", "email": email, "redirect_to": callback})
    action = link.get("properties", link).get("action_link", "")
    parts = urlsplit(action)
    assert parts.scheme + "://" + parts.netloc == base and parts.path == "/auth/v1/verify"
    assert parse_qs(parts.query).get("redirect_to") == [callback]
    try:
        with build_opener(StopRedirect()).open(action, timeout=25):
            raise RuntimeError("Supabase did not redirect after verifying recovery")
    except HTTPError as error:
        if error.code not in (302, 303):
            raise RuntimeError(f"Supabase recovery verification returned HTTP {error.code}") from None
        destination = urlsplit(error.headers.get("Location", ""))
    assert destination.scheme + "://" + destination.netloc + destination.path == callback
    fragment = parse_qs(destination.fragment)
    assert fragment.get("type") == ["recovery"] and len(fragment.get("access_token", [])) == 1
    _, page = send(callback)
    assert b"https://streamnow-2o1.pages.dev/stream/login" in page
    new_password = uuid4().hex + "Q@9"
    response = api(callback, method="POST", headers={"Origin": DEFAULT_ORIGIN}, data={
        "access_token": fragment["access_token"][0], "password": new_password,
    })
    assert response["ok"]
    try:
        send(ORIGIN + "/stream/session", open_url=old_session.open)
    except RuntimeError as error:
        if str(error) != "GET /stream/session returned HTTP 401":
            raise
    else:
        raise RuntimeError("Password recovery left a prior session active")
    sign_in(email, new_password, user_id, "StreamNow-QA Recovered Account")
    print("PASS: Supabase recovery callback reset a disposable password and revoked the old login.")


def main():
    base = os.environ["STREAM_SUPABASE_URL"].strip().rstrip("/").removesuffix("/rest/v1")
    assert re.fullmatch(r"https://[a-z0-9]+\.supabase\.co", base), "Expected the dedicated Supabase URL"
    auth_key = os.environ["STREAM_SUPABASE_SECRET_KEY"]
    cf_account = os.environ["CLOUDFLARE_ACCOUNT_ID"]
    cf_token = os.environ["CLOUDFLARE_API_TOKEN"]
    assert auth_key and cf_token and re.fullmatch(r"[a-fA-F0-9]{32}", cf_account)
    cf_root = f"https://api.cloudflare.com/client/v4/accounts/{cf_account}/d1/database"
    cf_headers = {"Authorization": "Bearer " + cf_token}
    databases = api(cf_root + "?per_page=100", headers=cf_headers)
    matches = [db for db in databases["result"] if db["name"] == "drivmatch-stream-users-test"]
    assert len(matches) == 1, "Existing staging database was not uniquely identified"
    cf_query = cf_root + "/" + matches[0]["uuid"] + "/query"
    auth_users = base + "/auth/v1/admin/users"
    auth_headers = {"apikey": auth_key}

    def query(sql, *params):
        result = api(cf_query, method="POST", data={"sql": sql, "params": list(params)}, headers=cf_headers)
        assert result["success"] and all(row["success"] for row in result["result"])
        return result["result"][0]

    created = []
    test_password = uuid4().hex + "Q@9"
    try:
        for _ in range(2):
            email = "streamnow-qa-" + uuid4().hex + "@example.com"
            user = api(auth_users, method="POST", headers=auth_headers, data={
                "email": email, "password": test_password, "email_confirm": True,
            })
            user_id = user.get("id")
            assert user["email"] == email and re.fullmatch(r"[0-9a-f-]{36}", user_id or "")
            created.append((user_id, email))
            query(
                "INSERT INTO stream_users(user_id,email,role,status) VALUES(?,?,'viewer','active')",
                user_id, email,
            )
        first_id, first_email = created[0]
        second_id, second_email = created[1]
        desktop = sign_in(first_email, test_password, first_id, "StreamNow-QA Desktop")
        mobile = sign_in(first_email, test_password, first_id, "StreamNow-QA Android Mobile")
        other = sign_in(second_email, test_password, second_id, "StreamNow-QA Independent Account")
        _, guide = send(ORIGIN + "/stream/tv/", open_url=desktop.open)
        assert b"streamnow-wordmark" in guide and b"favorite-items" in guide
        _, catalog = send(ORIGIN + "/stream/catalog?list=lista-12", open_url=mobile.open)
        assert catalog.startswith(b"#EXTM3U") and b"#EXTINF:" in catalog
        key = "BR:streamnow-qa-" + uuid4().hex
        assert favorites(desktop) == favorites(mobile) == favorites(other) == []
        favorite_change(desktop, key, "add")
        assert favorites(mobile) == [key] and favorites(other) == []
        favorite_change(mobile, key, "remove")
        assert favorites(desktop) == []
        if ORIGIN != DEFAULT_ORIGIN:
            browser_key = "BR:streamnow-import-" + uuid4().hex
            _, imported = send(
                ORIGIN + "/stream/favorites", method="POST", open_url=desktop.open,
                headers={"Content-Type": "application/json", "Origin": ORIGIN,
                         "X-Stream-Account": first_id},
                body=json.dumps({"operation": "import", "keys": [browser_key]}).encode(),
            )
            assert json.loads(imported)["ok"] and favorites(mobile) == [browser_key]
            assert favorites(other) == []
            favorite_change(mobile, browser_key, "remove")
            assert favorites(desktop) == []
        verify_recovery(base, auth_headers, first_email, first_id, desktop)
        print("PASS: Supabase sessions, authenticated catalog and D1 favorites isolation in staging.")
    finally:
        cleanup_failed = False
        for user_id, email in created:
            try:
                query("DELETE FROM stream_users WHERE user_id=? AND email=? AND role='viewer'", user_id, email)
            except Exception:
                cleanup_failed = True
            try:
                api(auth_users + "/" + user_id, method="DELETE", headers=auth_headers)
            except Exception:
                cleanup_failed = True
        if cleanup_failed:
            raise RuntimeError("Staging QA fixture cleanup failed") from None
        if created:
            print("Staging QA fixtures removed.")


if __name__ == "__main__":
    main()
