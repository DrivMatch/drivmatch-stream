#!/usr/bin/env python3
"""Global research extension for the existing DrivMatch 02:00 channel autopilot.

Research candidates are NEVER published to the player. The legacy vetted HLS
sampler remains the sole automatic publisher. Uses public HTTPS-only sources,
country rotation, local-language queries and durable multilingual identities.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import ipaddress
import json
import os
import re
import socket
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / "site" / "global-discovery-state.json"
REPORT = ROOT / "site" / "global-discovery-report.json"
KNOWN_SOURCES = ROOT / "site" / "playlist-sources.json"
COUNTRY_API = "https://iptv-org.github.io/api/countries.json"
USER_AGENT = "DrivMatch-Global-Channel-Discovery/1.0 (+https://drivmatch.com/stream/)"
COUNTRIES_BY_REGION = {
    "north_central_america_caribbean": ("US", "CA", "MX", "CR", "PA", "DO", "GT", "CU", "JM"),
    "south_america": ("BR", "AR", "CL", "CO", "PE", "UY", "EC", "BO", "VE", "PY"),
    "western_europe": ("GB", "FR", "DE", "ES", "PT", "IT", "NL", "BE", "IE", "CH"),
    "eastern_europe_caucasus": ("RU", "UA", "PL", "RO", "CZ", "RS", "BG", "HU", "EE", "LT", "LV", "GE", "AM", "GR", "TR"),
    "africa_middle_east": ("ZA", "NG", "KE", "EG", "MA", "GH", "SA", "AE", "IL", "QA", "TN"),
    "asia": ("CN", "IN", "JP", "KR", "ID", "PH", "TH", "VN", "MY", "TW", "PK", "BD"),
    "oceania": ("AU", "NZ", "FJ", "PG"),
}
LANGUAGE_QUERIES = (
    ("ru", "бесплатное IPTV телеканалы m3u"),
    ("pl", "darmowe kanały telewizyjne IPTV m3u"),
    ("es", "listas IPTV canales abiertos gratis"),
    ("zh", "免费 IPTV 直播源 m3u"),
    ("ja", "無料 テレビ ライブ IPTV プレイリスト"),
    ("id", "playlist IPTV gratis siaran langsung"),
    ("ar", "قنوات تلفزيونية مجانية بث مباشر IPTV"),
    ("uk", "безкоштовні телеканали IPTV m3u"),
    ("fr", "chaînes télévision gratuites direct m3u"),
    ("de", "freie Fernsehsender IPTV m3u"),
    ("pt", "canais de televisão abertos IPTV m3u"),
    ("en", "official free live television playlist m3u"),
)
COUNTRY_NAMES_PT = {
    "BR": "Brasil", "US": "Estados Unidos", "PT": "Portugal",
    "RU": "Rússia", "UA": "Ucrânia", "PL": "Polônia",
    "CN": "China", "JP": "Japão", "KR": "Coreia do Sul",
    "IN": "Índia", "ID": "Indonésia", "AU": "Austrália",
    "NZ": "Nova Zelândia", "EG": "Egito", "ZA": "África do Sul",
}
CURATED_IDENTITIES = {
    "россия 24": ("Rossiya 24", "Rossiya 24 — Notícias da Rússia"),
    "первый канал": ("Pervy Kanal", "Pervy Kanal — Rússia"),
    "日本テレビ": ("Nippon TV", "Nippon TV — Japão"),
    "中央电视台": ("CCTV", "CCTV — China"),
    "الجزيرة": ("Al Jazeera", "Al Jazeera — Catar"),
}
CYRILLIC = dict(zip(
    "абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
    ("a", "b", "v", "g", "d", "e", "yo", "zh", "z", "i", "y",
     "k", "l", "m", "n", "o", "p", "r", "s", "t", "u", "f", "kh",
     "ts", "ch", "sh", "shch", "", "y", "", "e", "yu", "ya")
))
PRIVATE_HOST = re.compile(r"(?:^localhost$|\.local$|\.internal$)", re.I)
SECRET = re.compile(r"(?:token|auth|signature|secret|session|key|jwt|access_token)=", re.I)
MEDIA = re.compile(r"\.(?:m3u8|mp4)(?:[?#]|$)", re.I)
CODE = re.compile(r"^[A-Z]{2}$")

def canonical(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", str(value).casefold())
                   if not unicodedata.combining(c)).strip()

def script_of(name: str) -> str:
    for char in name:
        n = ord(char)
        if 0x0400 <= n <= 0x052f: return "Cyrillic"
        if 0x4e00 <= n <= 0x9fff: return "Han"
        if 0x3040 <= n <= 0x30ff: return "Japanese"
        if 0xac00 <= n <= 0xd7af: return "Hangul"
        if 0x0600 <= n <= 0x06ff: return "Arabic"
        if 0x0370 <= n <= 0x03ff: return "Greek"
    return "Latin/Other"

def romanize(name: str) -> str:
    out = []
    for ch in name:
        latin = CYRILLIC.get(ch.lower())
        if latin is None: out.append(ch)
        elif ch.isupper() and latin: out.append(latin[0].upper() + latin[1:])
        else: out.append(latin)
    return "".join(out)

def describe_channel(name: str, country: str) -> dict:
    original = str(name).strip()[:120]
    code = str(country).upper() if CODE.fullmatch(str(country).upper()) else "OTHER"
    known = CURATED_IDENTITIES.get(original.casefold())
    script = script_of(original)
    international = known[0] if known else romanize(original)
    # Never pretend a guessed translation is an official broadcaster name.
    display = known[1] if known else international
    aliases = list(dict.fromkeys(x for x in (original, international, display)
                                 if x))
    return {
        "original_name": original, "official_name": "",
        "international_name": international, "display_name_pt": display,
        "aliases": aliases, "original_script": script,
        "country_code": code,
        "language_codes": [],
        "name_provenance": "curated_reference" if known else (
            "transliteration_only" if international != original else "original")
    }

def safe_url(url: str, *, resolve: bool = False) -> bool:
    if not isinstance(url, str) or len(url) > 1900 or not url.isascii(): return False
    p = urllib.parse.urlsplit(url)
    if p.scheme != "https" or not p.hostname or p.username or p.password: return False
    try: port = p.port
    except ValueError: return False
    if port not in (None, 443) or PRIVATE_HOST.search(p.hostname) or SECRET.search(p.query):
        return False
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", p.hostname): return False
    if not resolve: return True
    try:
        addrs = [x[4][0] for x in socket.getaddrinfo(p.hostname, 443, type=socket.SOCK_STREAM)]
        return bool(addrs) and all(ipaddress.ip_address(v).is_global for v in addrs)
    except (socket.gaierror, ValueError, OSError): return False

class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not safe_url(newurl, resolve=True):
            raise urllib.error.URLError("Untrusted redirect")
        return super().redirect_request(req, fp, code, msg, headers, newurl)

OPENER = urllib.request.build_opener(SafeRedirect())

def fetch_bytes(url: str, limit: int = 1_500_000) -> bytes:
    if not safe_url(url, resolve=True): raise ValueError("Unsafe source URL")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json,text/plain,*/*"})
    with OPENER.open(req, timeout=12) as resp:
        if int(resp.status) != 200: raise OSError("HTTP source failure")
        data = resp.read(limit + 1)
        if len(data) > limit: raise ValueError("Response too large")
        return data

def country_rotation(day: int, available: list[str] | None = None) -> dict[str, str]:
    selected = {region: codes[day % len(codes)]
                for region, codes in COUNTRIES_BY_REGION.items()}
    known = {x for codes in COUNTRIES_BY_REGION.values() for x in codes}
    if available:
        rest = sorted({x for x in available if CODE.fullmatch(x)} - known)
        if rest: selected["additional_world_country"] = rest[day % len(rest)]
    return selected

def parse_public_feed(raw: str, code: str, source_url: str, max_rows: int = 550) -> list[dict]:
    """Discovery metadata only. Does not put any discovered stream on the air."""
    if not raw.lstrip().startswith("#EXTM3U"): raise ValueError("Not a valid M3U playlist")
    result, info = [], ""
    for rawline in raw.splitlines():
        line = rawline.strip()
        if line.startswith("#EXTINF:"):
            info = line
            continue
        if not info or not line or line.startswith("#"): continue
        header, info = info, ""
        if not safe_url(line) or not MEDIA.search(line): continue
        original = header.rsplit(",", 1)[-1].strip()[:120]
        if not original: continue
        m = re.search(r'\btvg-id="([^"]+)"', header, re.I)
        tvgid = m.group(1)[:120] if m else ""
        profile = describe_channel(original, code)
        # Prefer an established channel identifier, else country + romanized name.
        identity = (code + "|" + (tvgid.casefold() if tvgid else
                     canonical(profile["international_name"])))
        channel_id = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:24]
        result.append({"channel_id": channel_id, "tvg_id": tvgid,
                       "name": profile, "source": source_url, "stream_url": line})
        if len(result) >= max_rows: break
    return result

def read_json(path: Path, default):
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, type(default)) else default
    except (OSError, ValueError): return default

def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
                    encoding="utf-8")

def research_queries(day: int) -> list[tuple[str, str]]:
    languages = [LANGUAGE_QUERIES[(day * 3 + i) % len(LANGUAGE_QUERIES)]
                 for i in range(3)]
    targets = []
    for code, query in languages:
        url = "https://api.github.com/search/repositories?q=" + urllib.parse.quote(query) + "&sort=updated&per_page=10"
        targets.append(("github:" + code, url))
    targets.append(("gitlab", "https://gitlab.com/api/v4/projects?search=iptv&per_page=12"))
    targets.append(("codeberg", "https://codeberg.org/api/v1/repos/search?q=iptv&limit=10"))
    targets.append(("gitee", "https://gitee.com/api/v5/search/repositories?q=iptv&per_page=10"))
    return targets

def extract_repository_links(raw: bytes, provider: str) -> list[str]:
    try: payload = json.loads(raw)
    except ValueError: return []
    if provider.startswith("github"): collection = payload.get("items", [])
    elif provider == "gitlab": collection = payload if isinstance(payload, list) else []
    elif provider == "codeberg": collection = payload.get("data", [])
    else: collection = payload if isinstance(payload, list) else []
    if not isinstance(collection, list): return []
    hosts = {"github": "github.com", "gitlab": "gitlab.com",
             "codeberg": "codeberg.org", "gitee": "gitee.com"}
    host = hosts[provider.split(":")[0]]
    found = []
    for item in collection[:20]:
        if not isinstance(item, dict): continue
        link = item.get("web_url") if provider == "gitlab" else item.get("html_url")
        if link and safe_url(link) and urllib.parse.urlsplit(link).hostname == host:
            found.append(link)
    return list(dict.fromkeys(found))

def run(now: dt.datetime | None = None, fetcher=fetch_bytes) -> dict:
    now = now or dt.datetime.now(dt.timezone.utc)
    day = now.date().toordinal()
    date = now.date().isoformat()
    old = read_json(STATE, {"schema": 1, "channels": {}, "sources": {}})
    channels = old.get("channels") if isinstance(old.get("channels"), dict) else {}
    sources = old.get("sources") if isinstance(old.get("sources"), dict) else {}
    channels = dict(channels)
    sources = dict(sources)
    errors: dict[str, str] = {}
    available: list[str] = []
    try:
        country_rows = json.loads(fetcher(COUNTRY_API, 600_000))
        if isinstance(country_rows, list):
            available = [str(x.get("code", "")).upper() for x in country_rows
                         if isinstance(x, dict)]
    except (OSError, ValueError, TimeoutError, urllib.error.URLError) as exc:
        errors["country_index"] = type(exc).__name__
    selected = country_rotation(day, available)
    visited, examined, new_records, new_alternatives = [], 0, 0, 0
    for region, code in selected.items():
        url = "https://iptv-org.github.io/iptv/countries/" + code.lower() + ".m3u"
        try:
            rows = parse_public_feed(fetcher(url, 2_500_000).decode("utf-8", "replace"), code, url)
            visited.append({"region": region, "country": code, "entries": len(rows)})
            examined += len(rows)
            sources[url] = {"type": "country_playlist", "country": code,
                            "last_checked": date, "entries": len(rows),
                            "state": "RESEARCH_ONLY"}
            for item in rows:
                key = item["channel_id"]
                existing = channels.get(key)
                if existing is None:
                    if len(channels) >= 40_000: continue
                    new_records += 1
                    profile = item["name"]
                    existing = {"channel_id": key, **profile, "tvg_id": item["tvg_id"],
                                "genre": "", "access_state": "REVIEW_REQUIRED_NOT_PLAYABLE",
                                "first_seen": date, "source_urls": [], "stream_candidates": []}
                    channels[key] = existing
                existing["last_seen"] = date
                for alias in item["name"]["aliases"]:
                    if alias not in existing["aliases"]:
                        existing["aliases"].append(alias)
                if item["source"] not in existing["source_urls"]:
                    existing["source_urls"].append(item["source"])
                if item["stream_url"] not in existing["stream_candidates"]:
                    if len(existing["stream_candidates"]) < 5:
                        existing["stream_candidates"].append(item["stream_url"])
                        if existing["first_seen"] != date: new_alternatives += 1
        except (OSError, ValueError, TimeoutError, urllib.error.URLError) as exc:
            errors[region + ":" + code] = type(exc).__name__
    queries, new_sources = [], 0
    for provider, url in research_queries(day):
        try:
            links = extract_repository_links(fetcher(url, 550_000), provider)
            queries.append({"provider": provider, "status": "OK", "found": len(links)})
            for link in links:
                if link not in sources and len(sources) < 10_000:
                    sources[link] = {"type": "repository_candidate", "discovered_from": provider,
                                     "first_seen": date, "state": "REVIEW_REQUIRED"}
                    new_sources += 1
        except (OSError, ValueError, TimeoutError, urllib.error.URLError) as exc:
            errors[provider] = type(exc).__name__
            queries.append({"provider": provider, "status": "UNAVAILABLE"})
    report = {
        "schema": 1, "state": "COMPLETED" if not errors else "PARTIAL",
        "date_utc": date, "started_at_utc": now.isoformat(),
        "scheduled_local": "02:00 America/Sao_Paulo",
        "regions_selected": selected, "country_scans": visited,
        "countries_scanned": len(visited), "region_count": len(COUNTRIES_BY_REGION),
        "channels_examined": examined, "new_research_channel_records": new_records,
        "new_stream_alternatives_in_research": new_alternatives,
        "total_research_channels": len(channels), "total_sources_recorded": len(sources),
        "new_research_sources": new_sources, "multilingual_searches": queries,
        "errors": errors, "auto_promoted_to_player": 0,
        "note": "Research-only registry. No newly discovered URLs or repository links are automatically promoted into the playable catalog."
    }
    write_json(STATE, {"schema": 1, "updated": date, "channels": channels, "sources": sources})
    write_json(REPORT, report)
    return report

if __name__ == "__main__":
    print(json.dumps(run(), ensure_ascii=False, sort_keys=True))
