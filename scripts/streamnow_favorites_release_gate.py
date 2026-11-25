#!/usr/bin/env python3
"""Release gate: channel autopilot must never touch user favorites or change app code."""
import argparse
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
ALLOWED = {
    "site/daily-autopilot.m3u8",
    "site/daily-autopilot-state.json",
    "site/daily-autopilot-report.json",
    "data/global-discovery-state.json",
    "data/global-discovery-report.json",
    "data/youtube-live-report.json",
    "data/youtube-live-research.json",
}
FORBIDDEN = ("localStorage.clear(", "localStorage.removeItem(", "drivmatch-tv-guide-favorites-v1",
             "drivmatch-stream-favorites-v1", "drivmatch-iptv-library-fav-v1")

def validate_paths(paths):
    bad = [p for p in paths if p and p not in ALLOWED]
    if bad:
        raise SystemExit("BLOCKED: autopilot attempted non-catalog modification: " + ", ".join(bad))
    return True

def validate_scripts():
    for p in ("scripts/daily_channel_autopilot.py", "scripts/global_channel_discovery.py", "scripts/youtube_live_discovery.py"):
        s = (ROOT / p).read_text(encoding="utf-8")
        for mark in FORBIDDEN:
            if mark in s:
                raise SystemExit("BLOCKED: user favorites referenced by scanning script: " + p)
    return True

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--mode",choices=("catalog","changed-paths"),required=True)
    a=ap.parse_args()
    if a.mode=="catalog":validate_scripts()
    else:validate_paths(line.strip() for line in sys.stdin)
    print("PASS: catalog changes isolated; favorites cannot be overwritten by this pipeline.")

if __name__=="__main__":
    main()
