#!/usr/bin/env python3
"""Independent 04:00 and 06:00 Sao Paulo audits of the 02:00 Stream Now scanner.

Auditor A (04:00) checks the scan's workflow success and daily report freshness.
Auditor B (06:00) independently checks success, research coverage and actual
published playlist health. Both dispatch repair if required. Never edit favorite
data, credentials or catalog directly.
"""
from __future__ import annotations
import argparse
import base64
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

ZONE = ZoneInfo("America/Sao_Paulo")
WORKFLOW = "daily-channel-autopilot.yml"
SCAN_BEGIN_HOUR = 2

def local_day(now: dt.datetime) -> str:
    return now.astimezone(ZONE).date().isoformat()

def runs_for_day(runs: list[dict], now: dt.datetime) -> list[dict]:
    boundary = now.astimezone(ZONE).replace(hour=SCAN_BEGIN_HOUR, minute=0, second=0, microsecond=0)
    cutoff = boundary.astimezone(dt.timezone.utc)
    good = []
    for run in runs:
        if run.get("event") not in ("schedule", "workflow_dispatch"):
            continue
        try:
            created = dt.datetime.fromisoformat(run["created_at"].replace("Z", "+00:00"))
        except (KeyError, ValueError, TypeError):
            continue
        if cutoff <= created <= now:
            good.append(run)
    return good

def audit_a(runs: list[dict], report: dict, now: dt.datetime, youtube: dict | None = None) -> list[str]:
    """Auditor A: schedule delivery and daily catalog integrity."""
    problems = []
    today = runs_for_day(runs, now)
    if not any(r.get("conclusion") == "success" for r in today):
        problems.append("no-successful-scan-since-02:00")
    if report.get("date_utc") != local_day(now):
        problems.append("catalog-report-not-from-today")
    if report.get("state") != "COMPLETED" or report.get("tested", 0) <= 0:
        problems.append("catalog-scanner-incomplete")
    if report.get("sources_responded", 0) <= 0 or report.get("published_healthy", 0) <= 0:
        problems.append("catalog-has-no-validated-healthy-channels")
    if youtube is not None:
        if youtube.get("run_utc","")[:10] != local_day(now):
            problems.append("youtube-research-report-stale")
        elif youtube.get("mode") != "RESEARCH_ONLY_NO_YOUTUBE_AUTO_PUBLICATION":
            problems.append("youtube-research-mode-unsafe")
        elif youtube.get("auto_published") != 0:
            problems.append("youtube-unreviewed-channels-published")
    return problems

def audit_b(runs: list[dict], report: dict, research: dict, playlist: str,
            now: dt.datetime, youtube: dict | None = None) -> list[str]:
    """Auditor B: independent source, output and research audit, not A's verdict."""
    problems = []
    today = runs_for_day(runs, now)
    completed = [r for r in today if r.get("status") == "completed" and r.get("conclusion") == "success"]
    if not completed:
        problems.append("no-completed-successful-scan")
    if report.get("date_utc") != local_day(now) or report.get("schema") != 1:
        problems.append("catalog-report-stale-or-invalid")
    if report.get("tested_ok", 0) + report.get("tested_failed", 0) != report.get("tested", -1):
        problems.append("catalog-test-totals-inconsistent")
    if report.get("published_healthy", 0) <= 0 or not playlist.startswith("#EXTM3U"):
        problems.append("published-playlist-invalid")
    elif "#EXTINF" not in playlist:
        problems.append("published-playlist-has-no-channel-entries")
    if research.get("date_utc") != local_day(now):
        problems.append("worldwide-research-report-stale")
    if research.get("countries_scanned", 0) <= 0 or not research.get("multilingual_searches"):
        problems.append("multilingual-world-research-not-performed")
    if youtube is not None:
        if youtube.get("run_utc","")[:10] != local_day(now):
            problems.append("youtube-research-report-stale")
        elif youtube.get("auto_published") != 0:
            problems.append("youtube-unreviewed-channels-published")
        elif youtube.get("mode") != "RESEARCH_ONLY_NO_YOUTUBE_AUTO_PUBLICATION":
            problems.append("youtube-research-mode-unsafe")
    return problems

def github_api(url: str, token: str, *, method: str = "GET", data: dict | None = None):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, method=method,
        headers={"Authorization": "Bearer " + token,
                 "Accept": "application/vnd.github+json",
                 "X-GitHub-Api-Version": "2022-11-28",
                 "User-Agent": "StreamNow-Independent-Audit/1",
                 "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=25) as resp:
        raw = resp.read()
    return json.loads(raw) if raw else {}

def repository_file(repo: str, token: str, path: str) -> bytes:
    url = "https://api.github.com/repos/" + repo + "/contents/" + path + "?ref=main"
    obj = github_api(url, token)
    if obj.get("encoding") != "base64":
        raise ValueError("GitHub content not base64")
    return base64.b64decode(obj["content"])

def execute(mode: str, *, now: dt.datetime | None = None) -> dict:
    now = now or dt.datetime.now(dt.timezone.utc)
    token = os.environ["GH_TOKEN"]
    repo = os.environ["GITHUB_REPOSITORY"]
    api = "https://api.github.com/repos/" + repo
    errors = []
    try:
        runs = github_api(api + "/actions/workflows/" + WORKFLOW + "/runs?per_page=100", token)["workflow_runs"]
        report = json.loads(repository_file(repo, token, "site/daily-autopilot-report.json"))
        youtube = json.loads(repository_file(repo, token, "data/youtube-live-report.json"))
        if mode == "04":
            errors = audit_a(runs, report, now, youtube)
        else:
            research = json.loads(repository_file(repo, token, "data/global-discovery-report.json"))
            playlist = repository_file(repo, token, "site/daily-autopilot.m3u8").decode("utf-8", "replace")
            errors = audit_b(runs, report, research, playlist, now, youtube)
    except (OSError, KeyError, ValueError, TypeError, urllib.error.URLError) as e:
        errors = ["audit-input-unavailable:" + type(e).__name__]
        runs = []

    dispatched = False
    action = "healthy"
    if errors:
        # Avoid unnecessarily duplicating an already running recovery.
        active = [r for r in runs_for_day(runs, now)
                  if r.get("status") in ("queued", "in_progress", "waiting", "requested", "pending")]
        if active:
            action = "scan-already-running"
        else:
            try:
                github_api(api + "/actions/workflows/" + WORKFLOW + "/dispatches",
                    token, method="POST", data={"ref": "main"})
                dispatched = True
                action = "recovery-scan-dispatched"
            except (OSError, ValueError, urllib.error.URLError) as e:
                action = "dispatch-failed:" + type(e).__name__
    return {"auditor": "A-04" if mode == "04" else "B-06",
            "date_local": local_day(now), "problems": errors, "action": action,
            "dispatch_confirmed": dispatched,
            "favorites_policy": "NO_LOCALSTORAGE_WRITES_OR_DELETION",
            "worldwide_research_policy": "ALL_REGIONS_ALL_LANGUAGES_ALL_CATEGORIES_ROTATION",
            "youtube_live_policy": "API_VERIFIED_RESEARCH_ONLY_NO_UNREVIEWED_PUBLICATION"}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--agent", choices=("04", "06"), required=True)
    args = ap.parse_args()
    result = execute(args.agent)
    line = json.dumps(result, ensure_ascii=False)
    print(line)
    with open(os.environ.get("GITHUB_STEP_SUMMARY", "/dev/null"), "a", encoding="utf-8") as f:
        f.write("### Stream Now independent channel audit\n\n```json\n" + line + "\n```\n")
    if result["action"].startswith("dispatch-failed"):
        sys.exit(1)

if __name__ == "__main__":
    main()
