#!/usr/bin/env python3
"""Bounded, non-destructive full HLS health audit of Stream Now public catalogs.

prepare -> sharded scan -> finalize. Never modifies accounts or favorites.
HTTP HLS manifest + media segment is a remote health test, not TV playback,
legal provenance or region-universal proof.
"""
from __future__ import annotations
import argparse
import concurrent.futures as cf
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import daily_channel_autopilot as a
from global_channel_discovery import describe_channel

INPUT = Path("audit-input.json")
RESULTS = Path("audit-results")
HEALTH = ROOT / "site" / "channel-health.json"
UTC = dt.timezone.utc
SHARDS = 24
WORKERS = 12

def read(path):
    return json.loads(path.read_text(encoding="utf-8"))

def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, sort_keys=True, indent=2)+"\n", encoding="utf-8")

def sources_for_app():
    """Canonical 1–14 sources and exactly the country feeds configured in Worker."""
    proxy = (ROOT / "cloudflare" / "stream-proxy.mjs").read_text(encoding="utf-8")
    match = re.search(r"const TV_SOURCE_URLS=(\{.*?\});", proxy, flags=re.S)
    countries = re.search(r"const TV_COUNTRIES=(\[.*?\]);", proxy, flags=re.S)
    if not match or not countries:
        raise RuntimeError("Cannot establish canonical sources; abort rather than claim full coverage")
    urls = json.loads(match.group(1))
    known = json.loads(countries.group(1))
    values = list(a.SOURCES)
    values.extend((name, url, "", "", False) for name,url in urls.items()
                  if name != "lista-12")
    values.extend(("lista-2-"+country, 
                   "https://iptv-org.github.io/iptv/countries/"+country+".m3u",
                   country.upper(), "", False) for country in known)
    # Dedup exact source ID + URL (country aliases still remain distinct for metadata).
    dedup = {}
    for row in values:
        dedup[(row[0], row[1])] = row
    return list(dedup.values()), sorted(urls), known

def prepare():
    started = dt.datetime.now(UTC)
    sources, list_ids, country_codes = sources_for_app()
    base = read(ROOT/"site"/"daily-autopilot-state.json")
    previous = base.get("channels", {}) if isinstance(base.get("channels"),dict) else {}
    channels = {}
    failures = {}
    counts = {}
    def fetch_source(src):
        return a.fetch_bytes(src[1], a.CATALOG_LIMIT).decode("utf-8","replace")
    with cf.ThreadPoolExecutor(max_workers=12) as executor:
        future_by_source = {executor.submit(fetch_source,src):src for src in sources}
        for future in cf.as_completed(future_by_source):
            src = future_by_source[future]
            try:
                entries = a.parse_playlist(future.result(), src)
                counts[src[0]]=len(entries)
                for entry in entries:
                    url = entry["url"]
                    old = channels.get(url)
                    if old:
                        old["eligible"] |= bool(entry["eligible"])
                        old["sources"].append(src[0])
                    else:
                        channels[url]={**entry,"sources":[src[0]]}
            except (OSError,ValueError,TimeoutError) as e:
                failures[src[0]]=type(e).__name__
    # Include the exact current published playlist even if an upstream is down.
    # This is still an actual probe, not an assumption of continued availability.
    current=(ROOT/"site"/"daily-autopilot.m3u8").read_text(encoding="utf-8")
    for entry in a.parse_playlist(current, ("current-published","", "", "", True)):
        entry["eligible"]=True
        url=entry["url"]
        if url in channels:
            channels[url]["eligible"]=True
            channels[url]["sources"].append("current-published")
        else:
            channels[url]={**entry,"sources":["current-published"]}
    if not counts or len(channels)<10:
        raise RuntimeError("Source collection too incomplete; refused global changes")
    for entry in channels.values():
        entry["sources"]=sorted(set(entry["sources"]))
    data={"schema":1,"started_utc":started.isoformat(),"sources_requested":len(sources),
          "sources_responded":len(counts),"source_errors":failures,"source_counts":counts,
          "country_feeds":country_codes,"canonical_lists":list_ids,
          "candidates":sorted(channels.values(),key=lambda row:row["url"])}
    save(INPUT,data)
    print(json.dumps({"event":"prepared","started_utc":data["started_utc"],
                      "sources":len(counts),"source_errors":len(failures),
                      "unique_HLS":len(channels),"shards":SHARDS},ensure_ascii=False))

def shard_for(url, total):
    return int.from_bytes(hashlib.sha256(url.encode()).digest()[:8],"big")%total

def scan(shard, shards):
    data=read(INPUT)
    if shards != SHARDS or not 0<=shard<shards:
        raise ValueError("Wrong sharding configuration")
    records=[c for c in data["candidates"] if shard_for(c["url"],shards)==shard]
    started=time.monotonic()
    results={}
    def check(candidate):
        _,ok=a.check_channel({"id":candidate["url"],"url":candidate["url"]},budget=60)
        return candidate["url"],bool(ok)
    with cf.ThreadPoolExecutor(max_workers=WORKERS) as executor:
        for url,good in executor.map(check,records):
            results[url]=good
    result={"schema":1,"shard":shard,"shards":shards,"started_utc":data["started_utc"],
            "elapsed_seconds":round(time.monotonic()-started,3),
            "tested":len(records),"passed":sum(results.values()),"failed":len(records)-sum(results.values()),
            "results":results}
    save(RESULTS/("scan-"+str(shard)+".json"),result)
    print(json.dumps({"event":"shard-completed","shard":shard,"tested":result["tested"],
                      "passed":result["passed"],"failed":result["failed"],
                      "elapsed_seconds":result["elapsed_seconds"]}))

def normalize_artifacts():
    """Restore the download-artifact@v4 flat ZIP layout to the scan directory.

    upload-artifact with path audit-results/scan-N.json stores scan-N.json at
    the ZIP root. download-artifact(pattern=..., merge-multiple=true) therefore
    restores files in the workspace root, not audit-results/. Normalization
    is deterministic and must fail on missing or ambiguous artifacts.
    """
    if not INPUT.is_file():
        raise RuntimeError("Missing audit-input.json: no valid source snapshot")
    data = read(INPUT)
    if data.get("schema") != 1 or not isinstance(data.get("candidates"), list):
        raise RuntimeError("Invalid audit-input.json: no publication")
    RESULTS.mkdir(parents=True, exist_ok=True)
    for n in range(SHARDS):
        root_file = Path(f"scan-{n}.json")
        target = RESULTS / f"scan-{n}.json"
        if root_file.exists() and target.exists():
            raise RuntimeError(f"Ambiguous duplicate shard {n}: no publication")
        if root_file.is_file():
            root_file.rename(target)
        if not target.is_file():
            raise RuntimeError(f"Missing shard {n}: no incomplete publication")
        part = read(target)
        if (part.get("schema"), part.get("shard"), part.get("shards"),
                part.get("started_utc")) != (
                    1, n, SHARDS, data.get("started_utc")):
            raise RuntimeError(f"Shard {n} belongs to a different audit")
    print(json.dumps({"event":"artifacts-normalized","shards":SHARDS,
                      "started_utc":data.get("started_utc")}))


def finalize():
    data=read(INPUT)
    all_candidates={c["url"]:c for c in data["candidates"]}
    outcomes={}
    duration=[]
    for n in range(SHARDS):
        path=RESULTS/("scan-"+str(n)+".json")
        if not path.exists():
            raise RuntimeError("Missing shard "+str(n)+": no incomplete publication")
        part=read(path)
        if (part["schema"],part["shard"],part["shards"],part["started_utc"]) != (
            1,n,SHARDS,data["started_utc"]):
            raise RuntimeError("Shard binding mismatch: no partial publication")
        expected={url for url in all_candidates if shard_for(url,SHARDS)==n}
        if set(part["results"])!=expected:
            raise RuntimeError("Missing or extra channel test results in shard "+str(n))
        outcomes.update(part["results"])
        duration.append(part["elapsed_seconds"])
    if set(outcomes)!=set(all_candidates):
        raise RuntimeError("Not every collected HLS candidate was checked")
    old_playlist=(ROOT/"site"/"daily-autopilot.m3u8").read_text(encoding="utf-8")
    verified=[v for url,v in all_candidates.items() if outcomes[url] and v["eligible"]]
    blocked=sorted(url for url,ok in outcomes.items() if not ok)
    checked=len(outcomes)
    approved=sum(bool(x) for x in outcomes.values())
    if approved<25 or approved<checked//20:
        raise RuntimeError("Mass unavailability / possible probe-region outage; do not hide catalog")
    # Publish only verified, curated sources, in the same source-format as autopilot.
    date=dt.datetime.now(UTC).strftime("%Y-%m-%d")
    oldstate=read(ROOT/"site"/"daily-autopilot-state.json").get("channels",{})
    state=dict(oldstate)
    for url,item in all_candidates.items():
        old=oldstate.get(item["id"],{})
        profile=describe_channel(item["name"],item["country"])
        record={k:item[k] for k in ("id","url","name","country","genre","language","source")}
        record.update(profile)
        record["checked"]=date
        record["status"]="ok" if outcomes[url] else "failed"
        record["last_ok"]=date if outcomes[url] else old.get("last_ok","")
        record["failures"]=0 if outcomes[url] else int(old.get("failures",0))+1
        record["language_codes"]=[item["language"]] if item["language"] else []
        state[item["id"]]=record
    for item in verified:
        old=state[item["id"]]
        item.update({k:old[k] for k in ("checked","display_name_pt","original_name","aliases") if k in old})
    verified.sort(key=lambda item:(a.priority(item),a.normalized(item["name"]),item["id"]))
    # No arbitrary 360 or 1000 entry truncation in a COMPLETE audit.
    playlist=["#EXTM3U","#DM_AUTO_SOURCE:FULL_VERIFIED_PUBLIC_HLS",
              "#DM_AUTO_PLAYBACK:REMOTE_HLS_SEGMENT_ONLY_NOT_TV",
              "#DM_AUTO_DATE:"+date]
    for item in verified:
        playlist.extend((a.as_extinf(item),item["url"]))
    new_text="\n".join(playlist)+"\n"
    before=a.published_channel_signatures(old_playlist)
    after=a.published_channel_signatures(new_text)
    finished=dt.datetime.now(UTC)
    start=dt.datetime.fromisoformat(data["started_utc"])
    report={"schema":1,"date_utc":date,"state":"COMPLETED_FULL_HLS_AUDIT",
            "started_utc":start.isoformat(),"finished_utc":finished.isoformat(),
            "elapsed_seconds":round((finished-start).total_seconds(),3),
            "shards":SHARDS,"max_seconds_per_channel":60,
            "tested":checked,"tested_ok":approved,"tested_failed":checked-approved,
            "published_healthy":len(verified),"published_added":len(after-before),
            "published_removed":len(before-after),"published_unchanged":len(before&after),
            "sources_responded":data["sources_responded"],
            "source_errors":data["source_errors"],
            "global_hidden_urls":len(blocked),
            "notes":["Covers playable HTTPS HLS discovered in configured sources; non-HLS apps/official embeds not testable with HLS probe",
                     "Remote segment availability is not proof of playback on every TV or region",
                     "Favorites and account data preserved; hidden streams can be restored on next successful audit"]}
    health={"schema":1,"status":"COMPLETE_HLS","started_utc":start.isoformat(),
            "finished_utc":finished.isoformat(),"tested":checked,
            "tested_ok":approved,"tested_failed":checked-approved,
            "hidden_urls":blocked,"scope":"known HTTPS HLS in configured Stream Now sources",
            "favorites_deleted":0}
    save(HEALTH,health)
    save(ROOT/"site"/"daily-autopilot-state.json",
         {"schema":1,"last_run":date,"channels":state})
    (ROOT/"site"/"daily-autopilot.m3u8").write_text(new_text,encoding="utf-8")
    save(ROOT/"site"/"daily-autopilot-report.json",report)
    print(json.dumps({"event":"full-audit-finished",**report},ensure_ascii=False))

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("stage",choices=("prepare","scan","normalize-artifacts","finalize"))
    ap.add_argument("--shard",type=int,default=0)
    ap.add_argument("--shards",type=int,default=SHARDS)
    args=ap.parse_args()
    if args.stage=="prepare":prepare()
    elif args.stage=="scan":scan(args.shard,args.shards)
    elif args.stage=="normalize-artifacts":normalize_artifacts()
    else:finalize()

if __name__=="__main__":
    main()
