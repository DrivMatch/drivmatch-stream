"""Check whether the official Pages login can move to the existing account Worker."""
from datetime import datetime, timezone
from hashlib import sha256
import json
import os
import re
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def project_url():
    raw = os.environ["STREAM_SUPABASE_URL"].strip().rstrip("/").removesuffix("/rest/v1")
    if not re.fullmatch(r"https://[a-z0-9]+\.supabase\.co", raw):
        raise RuntimeError("Invalid Supabase project URL")
    return raw


def read_json(url, *, headers, body=None, provider):
    request = Request(
        url,
        headers={"Content-Type": "application/json", "Accept": "application/json", **headers},
        data=json.dumps(body).encode() if body is not None else None,
    )
    try:
        with urlopen(request, timeout=25) as response:
            return json.load(response)
    except HTTPError as error:
        raise RuntimeError(f"{provider} returned HTTP {error.code}") from None


def confirmed_supabase_users(base):
    headers = {"apikey": os.environ["STREAM_SUPABASE_SECRET_KEY"]}
    confirmed = set()
    page, per_page = 1, 100
    current = datetime.now(timezone.utc)
    while True:
        result = read_json(
            f"{base}/auth/v1/admin/users?page={page}&per_page={per_page}",
            headers=headers,
            provider="Supabase",
        )
        users = result["users"]
        for user in users:
            banned_until = user.get("banned_until")
            if user.get("email_confirmed_at") and not user.get("deleted_at") and (
                not banned_until or datetime.fromisoformat(banned_until) < current
            ):
                confirmed.add(user["id"])
        if len(users) < per_page:
            return confirmed
        page += 1


def existing_accounts():
    account_id = os.environ["CLOUDFLARE_ACCOUNT_ID"]
    if not re.fullmatch(r"[0-9a-fA-F]{32}", account_id):
        raise RuntimeError("Invalid Cloudflare account ID")
    root = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database"
    headers = {"Authorization": "Bearer " + os.environ["CLOUDFLARE_API_TOKEN"]}
    listed = read_json(root + "?per_page=100", headers=headers, provider="Cloudflare")
    matches = [item for item in listed["result"] if item["name"] == "drivmatch-stream-users-test"]
    if len(matches) != 1 or not re.fullmatch(r"[0-9a-fA-F-]{36}", matches[0]["uuid"]):
        raise RuntimeError("Existing Stream Now D1 database was not identified")
    url = root + "/" + matches[0]["uuid"] + "/query"
    accounts = {}
    cursor = ""
    while True:
        result = read_json(
            url,
            headers=headers,
            body={
                "sql": "SELECT user_id,status,role FROM stream_users WHERE user_id > ? ORDER BY user_id LIMIT 100",
                "params": [cursor],
            },
            provider="Cloudflare D1",
        )
        if not result["success"] or not result["result"][0]["success"]:
            raise RuntimeError("Cloudflare D1 rejected the read-only account query")
        records = result["result"][0]["results"]
        accounts.update((entry["user_id"], entry) for entry in records)
        if len(records) < 100:
            return accounts
        cursor = records[-1]["user_id"]


def summarize(confirmed, accounts):
    active = {uid for uid, entry in accounts.items() if entry["status"] == "active"}
    return {
        "confirmed_supabase": len(confirmed),
        "active_d1": len(active),
        "active_admins_d1": sum(accounts[uid]["role"] == "admin" for uid in active),
        "confirmed_without_d1_record": len(confirmed - accounts.keys()),
        "confirmed_with_nonactive_d1_record": len((confirmed & accounts.keys()) - active),
        "active_d1_without_confirmed_supabase": len(active - confirmed),
    }


def main():
    base = project_url()
    identity = sha256(base.encode()).hexdigest()
    if identity != os.environ["STREAMNOW_PAGES_PROJECT_SHA256"]:
        raise RuntimeError("Pages and the existing account Worker use different Supabase projects")
    result = summarize(confirmed_supabase_users(base), existing_accounts())
    print(json.dumps(result, sort_keys=True))
    print("Conta Supabase do Pages corresponde à da homologação. O relatório contém somente totais.")
    if (
        result["confirmed_without_d1_record"]
        or result["confirmed_with_nonactive_d1_record"]
        or result["active_d1_without_confirmed_supabase"]
        or result["active_admins_d1"] != 1
    ):
        print("A mudança de login exige reconciliação antes da publicação.")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
