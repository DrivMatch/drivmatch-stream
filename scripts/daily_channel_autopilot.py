#!/usr/bin/env python3
"""DrivMatch daily public-channel discovery and HLS availability sampler.

This runner does NOT claim Samsung compatibility, legal licensing certification
or free access to subscription services. It never proxies media and never
changes the original playlists or locally stored TV favorites.
Only predefined curated/public sources may contribute playable URLs.
Community catalogues are searched for research but NOT auto-published.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import datetime as dt
import hashlib
import ipaddress
import json
import os
import random
import re
import socket
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / "site" / "daily-autopilot-state.json"
OUTPUT = ROOT / "site" / "daily-autopilot.m3u8"
REPORT = ROOT / "site" / "daily-autopilot-report.json"
MAX_CHECKS = min(180, max(1, int(os.getenv("DM_DAILY_MAX_CHECKS", "120"))))
MAX_WORKERS = min(16, max(1, int(os.getenv("DM_DAILY_WORKERS", "12"))))
VALID_DAYS = 8
MAX_LIVE = 360
PROBE_SECONDS = 60
CATALOG_LIMIT = 5_000_000
UA = "DrivMatch-Public-TV-Health/1.0 (+https://drivmatch.com/stream/tv/)"
SENSITIVE = re.compile(r"(?:^|[&?])(?:token|sig|signature|key|auth|secret|session|jwt|hdnts|expires|expiry|policy|apikey|access_token)=", re.I)
PAID = re.compile(
    r"\b(?:espn(?:\s*\d+)?|dazn|premiere|sportv|spor\s*tv|"
    r"fox\s*news|fox\s*sports?|hbo|max\s*originals?|netflix|"
    r"amazon\s*prime|prime\s*video|disney\s*\+?|paramount\s*\+?|"
    r"universal\s*\+|telecine|multishow|globo\s*news|globonews|"
    r"sky\s*sports?|tnt\s*sports?|bein\s*sports?|pay.per.view|"
    r"ppv|adult|xxx|18\+|premium\s*tv)\b", re.I
)
CATEGORY_RULES = (
    ("sports", re.compile(r"esport|sport|futebol|football|soccer|deport|formula.?1|nba|nfl|tennis", re.I)),
    ("news", re.compile(r"news|not[ií]cia|jornal|informativ|nieuws|nachrichten|actualidad|actualit[eé]", re.I)),
    ("movies", re.compile(r"movies?|films?|cinema|filmes?|pel[ií]cula|s[eé]ries|series", re.I)),
    ("kids", re.compile(r"kids?|infantil|children|junior|cartoon|desenho", re.I)),
    ("music", re.compile(r"music|m[uú]sica|concert|entertainment|variedades", re.I)),
    ("education", re.compile(r"educa|cultur|learn|school|documentar", re.I)),
    ("religion", re.compile(r"relig|church|faith|gospel|crist[aã]|igreja", re.I)),
)
LANGUAGES = {"portuguese": "pt", "português": "pt", "english": "en",
             "spanish": "es", "español": "es", "french": "fr",
             "german": "de", "italian": "it"}

# Auto-publication is limited to these free/public source collections, with
# no guarantee of country rights or playback. Treat unknown sources as RESEARCH.
SOURCES = (
    ("biskyt-open", "https://biskyt.github.io/legalFreeIPTVplaylist/live.m3u", "", "", True),
    ("freetv-main", "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8", "", "", True),
    ("freetv-br", "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_brazil.m3u8", "BR", "", True),
    ("freetv-pt", "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_portugal.m3u8", "PT", "", True),
    ("freetv-us", "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_usa.m3u8", "US", "", True),
    ("freetv-movies", "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_zz_movies.m3u8", "", "movies", True),
    ("freetv-news", "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_zz_news_en.m3u8", "", "news", True),
    ("nexonic-open", "https://nexonic-technologies.github.io/nexonic-iptv/playlists/verified.m3u", "", "", True),
    ("freecasthub", "https://raw.githubusercontent.com/freecasthub/public-iptv/main/playlist.m3u", "", "", True),
    # Community playlists are for daily research/reporting only, not auto-add.
    ("iptv-org-br", "https://iptv-org.github.io/iptv/countries/br.m3u", "BR", "", False),
    ("iptv-org-pt", "https://iptv-org.github.io/iptv/countries/pt.m3u", "PT", "", False),
    ("iptv-org-es", "https://iptv-org.github.io/iptv/countries/es.m3u", "ES", "", False),
    ("iptv-org-us", "https://iptv-org.github.io/iptv/countries/us.m3u", "US", "", False),
    ("iptv-org-ar", "https://iptv-org.github.io/iptv/countries/ar.m3u", "AR", "", False),
    ("iptv-org-uk", "https://iptv-org.github.io/iptv/countries/uk.m3u", "UK", "", False),
    ("iptv-org-fr", "https://iptv-org.github.io/iptv/countries/fr.m3u", "FR", "", False),
    ("iptv-org-de", "https://iptv-org.github.io/iptv/countries/de.m3u", "DE", "", False),
    ("iptv-org-it", "https://iptv-org.github.io/iptv/countries/it.m3u", "IT", "", False),
)

def normalized(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", value.lower())
                   if not unicodedata.combining(c)).strip()

def safe_url(url: str, check_dns: bool = True) -> bool:
    if not isinstance(url, str) or len(url) > 1900 or not url.isascii():
        return False
    p = urllib.parse.urlsplit(url)
    if p.scheme != "https" or not p.hostname or p.username or p.password:
        return False
    if p.port not in (None, 443) or not re.fullmatch(r"[a-zA-Z0-9._-]+", p.hostname):
        return False
    if p.hostname in ("localhost", "localhost.localdomain") or p.hostname.endswith((".local", ".internal")):
        return False
    if SENSITIVE.search("?" + p.query):
        return False
    if not check_dns:
        return True
    try:
        ips = {item[4][0] for item in socket.getaddrinfo(p.hostname, 443, type=socket.SOCK_STREAM)}
        return bool(ips) and all(ipaddress.ip_address(v).is_global for v in ips)
    except (socket.gaierror, ValueError, OSError):
        return False

class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not safe_url(newurl):
            raise urllib.error.URLError("unapproved redirect target")
        return super().redirect_request(req, fp, code, msg, headers, newurl)

OPENER = urllib.request.build_opener(SafeRedirect())

def fetch_bytes(url: str, limit: int, deadline: float | None = None, segment: bool = False) -> bytes:
    if not safe_url(url):
        raise ValueError("unsafe or unreachable URL")
    seconds = 12 if deadline is None else max(1.0, min(12.0, deadline - time.monotonic()))
    if deadline is not None and time.monotonic() >= deadline:
        raise TimeoutError("probe exceeded 60 seconds")
    request = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept": "*/*",
        **({"Range": f"bytes=0-{min(limit, 131072)-1}"} if segment else {}),
    })
    with OPENER.open(request, timeout=seconds) as response:
        if int(response.status) not in (200, 206):
            raise OSError("bad HTTP status")
        data = response.read(limit + 1)
        if len(data) > limit:
            if not segment:
                raise ValueError("source above size cap")
            data = data[:limit]
        return data

def attr(line: str, name: str) -> str:
    match = re.search(r"(?:^|\s)" + re.escape(name) + r'="([^"]*)"', line, re.I)
    return match.group(1) if match else ""

def country_of(info: str, forced: str) -> str:
    if forced:
        return forced
    country = re.split(r"[;,\s]", attr(info, "tvg-country"))[0].upper()
    if not country:
        match = re.search(r"\.([A-Za-z]{2})(?:@|$)", attr(info, "tvg-id"))
        country = match.group(1).upper() if match else ""
    if country == "GB":
        country = "UK"
    return country if re.fullmatch(r"[A-Z]{2}", country) else "OTHER"

def genre_of(info: str, name: str, suggested: str) -> str:
    text = name + " " + attr(info, "group-title")
    for genre, pat in CATEGORY_RULES:
        if pat.search(text):
            return genre
    return suggested or "other"

def language_of(info: str) -> str:
    raw = attr(info, "tvg-language").split(";")[0].strip().lower()
    if raw in LANGUAGES:
        return LANGUAGES[raw]
    return raw if re.fullmatch(r"[a-z]{2}", raw) else ""

def parse_playlist(raw: str, source: tuple) -> list[dict]:
    sid, _, forced, group, eligible = source
    rows, info = [], ""
    for value in raw.splitlines():
        line = value.strip()
        if line.startswith("#EXTINF:"):
            info = line
            continue
        if not info or not line or line.startswith("#"):
            continue
        header, info = info, ""
        name = header.rsplit(",", 1)[-1].strip()[:120]
        if not name or PAID.search(name) or not safe_url(line, False):
            continue
        if not re.search(r"\.m3u8(?:[?#]|$)", line, re.I):
            continue
        code = country_of(header, forced)
        genre = genre_of(header, name, group)
        lang = language_of(header)
        fingerprint = hashlib.sha256((code + "|" + normalized(name) + "|" + line).encode()).hexdigest()[:24]
        rows.append({"id": fingerprint, "name": name, "country": code,
                     "genre": genre, "language": lang,
                     "url": line, "source": sid, "eligible": eligible})
    return rows

def media_segment_valid(data: bytes) -> bool:
    if len(data) < 188 or b"<html" in data[:400].lower() or data.lstrip().startswith(b"{"):
        return False
    # TS or fMP4 (some CDNs send ID3 before TS/AAC audio).
    return data[0] == 0x47 or data[4:8] in (b"ftyp", b"moof", b"mdat") or data[:3] == b"ID3"

def media_segment(playlist: str) -> str | None:
    for row in playlist.splitlines():
        row = row.strip()
        if not row or row.startswith("#"):
            continue
        return row
    return None

def probe_once(url: str, deadline: float, getter=fetch_bytes) -> bool:
    current = url
    for _ in range(3):
        data = getter(current, 192_000, deadline=deadline)
        text = data.decode("utf-8", "replace")
        if not text.lstrip().startswith("#EXTM3U"):
            return False
        if "#EXT-X-KEY:" in text or "#EXT-X-SESSION-KEY:" in text:
            return False  # encrypted/DRM streams are not independently verified
        next_path = media_segment(text)
        if not next_path:
            return False
        next_url = urllib.parse.urljoin(current, next_path)
        if not safe_url(next_url):
            return False
        if "#EXT-X-STREAM-INF" in text or next_url.lower().split("?")[0].endswith(".m3u8"):
            current = next_url
            continue
        if "#EXTINF:" in text or "#EXT-X-PART" in text:
            return media_segment_valid(getter(next_url, 131_072, deadline=deadline, segment=True))
        return False
    return False

def check_channel(item: dict, budget: float = PROBE_SECONDS) -> tuple[str, bool]:
    deadline = time.monotonic() + budget
    # A fast HTTP failure is not enough to remove a channel. Retry for the
    # whole minute, unless proof of a video segment is obtained.
    for attempt in range(4):
        try:
            if probe_once(item["url"], deadline):
                return item["id"], True
        except (OSError, ValueError, TimeoutError, urllib.error.URLError):
            pass
        left = deadline - time.monotonic()
        if left <= 0:
            break
        if attempt < 3:
            time.sleep(min(15.0, left))
    return item["id"], False

def read_json(path: Path, default: dict) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else default
    except (FileNotFoundError, ValueError):
        return default

def write_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")

def priority(item: dict) -> tuple:
    p = {"BR": 0, "PT": 1, "ES": 2, "US": 3}.get(item["country"], 4)
    g = {"news": 0, "sports": 1, "movies": 2}.get(item["genre"], 3)
    return (p, g)

def select_for_check(candidates: dict, previous: dict, now: dt.datetime) -> list[dict]:
    # Previously verified videos are checked repeatedly; failures get a fast
    # opportunity to recover. Remaining capacity rotates newly discovered rows.
    day = now.strftime("%Y%m%d")
    randomizer = random.Random(int(day))
    items = list(candidates.values())
    randomizer.shuffle(items)
    def key(x):
        old = previous.get(x["id"], {})
        checked = old.get("checked", "")
        expired = checked < (now - dt.timedelta(days=4)).strftime("%Y-%m-%d")
        failed = old.get("status") == "failed"
        # Reserve slots for previously verified/stale and recently failed.
        if failed:
            level = 0
        elif old.get("status") == "ok" and expired:
            level = 1
        elif x["id"] not in previous:
            level = 2
        else:
            level = 3
        return (level, priority(x))
    items.sort(key=key)
    return items[:MAX_CHECKS]

def as_extinf(item: dict) -> str:
    def clean(s: str) -> str:
        return str(s).replace('"', "'").replace("\r", " ").replace("\n", " ")[:120]
    return ('#EXTINF:-1 tvg-country="' + item["country"] +
            '" tvg-language="' + item.get("language", "") +
            '" group-title="' + clean(item["genre"]) +
            '" dm-source="lista-12" dm-auto-checked="' + clean(item["checked"]) +
            '",' + clean(item["name"]))

def run(now: dt.datetime | None = None, fetch=fetch_bytes, probe=check_channel) -> dict:
    now = now or dt.datetime.now(dt.timezone.utc)
    today = now.strftime("%Y-%m-%d")
    prev = read_json(STATE, {"schema": 1, "channels": {}})
    previous = prev.get("channels", {}) if isinstance(prev.get("channels"), dict) else {}
    discovered: dict[str, dict] = {}
    scans, errors, researched = {}, {}, 0
    for source in SOURCES:
        sid, url, _, _, allowed = source
        try:
            raw = fetch(url, CATALOG_LIMIT).decode("utf-8", "replace")
            rows = parse_playlist(raw, source)
            scans[sid] = len(rows)
            for row in rows:
                if allowed:
                    # Favor metadata from first trusted source; do not overwrite.
                    discovered.setdefault(row["id"], row)
                else:
                    researched += 1
        except (OSError, ValueError, urllib.error.URLError, TimeoutError) as exc:
            errors[sid] = type(exc).__name__
    if not scans:
        raise RuntimeError("All source feeds failed; do not update the published channel list")
    chosen = select_for_check(discovered, previous, now)
    checks = {}
    with cf.ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = [pool.submit(probe, item) for item in chosen]
        for future in cf.as_completed(futures):
            key, ok = future.result()
            checks[key] = ok
    state = {}
    for key, item in discovered.items():
        old = previous.get(key, {})
        checked = key in checks
        successful = checks.get(key, False)
        record = {k: item[k] for k in ("id", "name", "country", "genre", "language", "url", "source")}
        if checked:
            record["status"] = "ok" if successful else "failed"
            record["checked"] = today
            record["last_ok"] = today if successful else old.get("last_ok", "")
            record["failures"] = 0 if successful else int(old.get("failures", 0)) + 1
        else:
            record["status"] = old.get("status", "unverified")
            record["checked"] = old.get("checked", "")
            record["last_ok"] = old.get("last_ok", "")
            record["failures"] = old.get("failures", 0)
        state[key] = record
    # Only currently discovered, recently segment-tested channels qualify.
    earliest = (now - dt.timedelta(days=VALID_DAYS)).strftime("%Y-%m-%d")
    live = [row for row in state.values()
            if row.get("status") == "ok" and row.get("last_ok", "") >= earliest]
    live.sort(key=lambda x: (priority(x), normalized(x["name"]), x["id"]))
    live = live[:MAX_LIVE]
    playlist = ["#EXTM3U", "#DM_AUTO_SOURCE:CURATED_PUBLIC_FEEDS",
                "#DM_AUTO_PLAYBACK:REMOTE_HLS_SEGMENT_ONLY_NOT_SAMSUNG",
                "#DM_AUTO_DATE:" + today]
    for item in live:
        playlist += [as_extinf(item), item["url"]]
    # Do not overwrite an earlier nonempty file if every feed succeeded but
    # no video could be tested (e.g. a GitHub network outage).
    failures = sum(1 for good in checks.values() if not good)
    report = {"schema": 1, "date_utc": today, "state": "COMPLETED",
              "sources_responded": len(scans), "sources_total": len(SOURCES),
              "source_counts": scans, "source_errors": errors,
              "community_candidates_research_only": researched,
              "curated_candidates": len(discovered), "tested": len(checks),
              "tested_ok": len(checks) - failures, "tested_failed": failures,
              "not_tested_this_run": max(0, len(discovered) - len(checks)),
              "published_healthy": len(live),
              "last_validation_note": "HTTP manifest and first media segment; not Samsung playback, geographical rights or license certification"}
    if len(checks) == 0 and previous:
        raise RuntimeError("No candidates tested; fail safely instead of wiping the list")
    STATE.parent.mkdir(parents=True, exist_ok=True)
    write_json(STATE, {"schema": 1, "last_run": today, "channels": state})
    OUTPUT.write_text("\n".join(playlist) + "\n", encoding="utf-8")
    write_json(REPORT, report)
    return report

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if args.dry_run:
        print(json.dumps({"sources": len(SOURCES), "limit": MAX_CHECKS,
                          "schedule": "daily", "stream_probe_seconds": PROBE_SECONDS}))
    else:
        report = run()
        print(json.dumps(report, ensure_ascii=False, sort_keys=True))
