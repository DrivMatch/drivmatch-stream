#!/usr/bin/env python3
"""Stream Now YouTube LIVE discovery (official YouTube Data API only).

Research records are NOT evidence of broadcast rights or embed permission.
No HTML scraping, stream extraction, conversion or HLS proxying.
No data belonging to users, favorites or watch history is read or written.
"""
from __future__ import annotations
import datetime as dt
import json
import os
from pathlib import Path
import urllib.parse
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
STATE=ROOT/"data/youtube-live-research.json"
REPORT=ROOT/"data/youtube-live-report.json"
LIVE=ROOT/"site/youtube-live-official.json"
API="https://www.googleapis.com/youtube/v3/"
MAX_SEARCHES=18
# Terms are opportunities for discovery, NOT claims these brands are broadcasting.
# Include sports whose rights vary by country, event and period.
QUERIES=[
 ("news","BR","CNN Brasil ao vivo oficial"),
 ("news","US","CNN live official"),
 ("news","US","CNN International live official"),
 ("news","ES","CNN en Español en vivo oficial"),
 ("news","TR","CNN Türk canlı yayın"),
 ("business","US","Bloomberg Television live official"),
 ("business","BR","Bloomberg TV Brasil ao vivo oficial"),
 ("business","OTHER","Bloomberg live Europe Asia official"),
 ("news","BR","Times Brasil CNBC ao vivo oficial"),
 ("sports","BR","CazéTV ao vivo"),
 ("sports","BR","ge tv Globo Esporte ao vivo"),
 ("sports","BR","Canal GOAT ao vivo futebol"),
 ("sports","BR","CBF TV ao vivo futebol"),
 ("sports","OTHER","live official volleyball FIVB"),
 ("sports","OTHER","live official tennis ATP WTA"),
 ("sports","OTHER","live official basketball NBA FIBA"),
 ("sports","US","NFL live official"),
 ("sports","OTHER","live official football soccer federation"),
 ("sports","OTHER","live official motorsport Formula 1"),
 ("sports","OTHER","live official athletics World Athletics"),
 ("sports","OTHER","live official gymnastics FIG"),
 ("sports","OTHER","live official NASCAR racing"),
 ("sports","OTHER","live official cycling UCI"),
 ("sports","OTHER","live official swimming World Aquatics"),
 ("sports","OTHER","live official baseball MLB"),
 ("sports","OTHER","live official hockey IIHF NHL"),
 ("sports","OTHER","live official rugby World Rugby"),
 ("sports","OTHER","live official handball IHF"),
 ("news","GB","Sky News live official"),
 ("news","FR","France 24 direct officiel"),
 ("news","DE","DW News live official"),
 ("news","QA","Al Jazeera English live official"),
 ("news","JP","NHK World live official"),
 ("news","BR","Record News ao vivo oficial"),
 ("news","BR","SBT News ao vivo oficial"),
 ("news","BR","Band Jornalismo ao vivo oficial"),
 ("news","BR","noticias jornal ao vivo Brasil oficial"),
 ("sports","BR","clubes brasileiros canal oficial live futebol"),
 ("sports","BR","Flamengo TV ao vivo oficial"),
 ("sports","BR","Palmeiras TV ao vivo oficial"),
 ("sports","BR","Corinthians TV ao vivo oficial"),
 ("sports","BR","Santos TV ao vivo oficial"),
 ("sports","BR","São Paulo FC TV ao vivo oficial"),
 ("sports","BR","Grêmio TV ao vivo oficial"),
 ("sports","BR","Internacional TV ao vivo oficial"),
 ("sports","BR","Atlético Mineiro TV ao vivo oficial"),
 ("sports","BR","Cruzeiro TV ao vivo oficial"),
 ("sports","BR","Fluminense TV ao vivo oficial"),
 ("sports","BR","Botafogo TV ao vivo oficial"),
 ("sports","BR","Vasco TV ao vivo oficial"),
]
# Never replace real canonical identity with unreviewed names merely because
# search terms, logos or titles contain a famous brand.
def official_ids():
    try:
        directory=json.loads((ROOT/"site/official-access.json").read_text(encoding="utf-8"))
    except (OSError,ValueError):
        return {}
    result={}
    for entry in directory.get("free",[]):
        embed=entry.get("embed") or {}
        ident=embed.get("channelId")
        if embed.get("provider")=="youtube_live_channel" and isinstance(ident,str) and len(ident)==24 and ident.startswith("UC"):
            result[ident]={"name":entry["name"],"code":entry.get("code","OTHER"),
                           "genre":entry.get("genre","other"),"url":entry["url"],"id":entry["id"]}
    return result

def api_json(endpoint,params,fetch=None):
    key=os.environ.get("STREAMNOW_YOUTUBE_DATA_API_KEY","")
    if not key: raise RuntimeError("youtube-api-key-not-configured")
    q=urllib.parse.urlencode({**params,"key":key})
    url=API+endpoint+"?"+q
    if fetch: return fetch(endpoint,params)
    req=urllib.request.Request(url,headers={"User-Agent":"StreamNow-Official-Live-Research/1.0"})
    with urllib.request.urlopen(req,timeout=15) as response:
        return json.loads(response.read(1024*1024))

def selected_queries(now):
    # Critical broadcasters are always scanned. A different thematic segment is
    # sampled daily, avoiding a persistent news/sports-only bias.
    fixed=QUERIES[:12]
    rotate=QUERIES[12:]
    offset=now.date().toordinal() % len(rotate)
    return fixed+[rotate[(offset+i)%len(rotate)] for i in range(MAX_SEARCHES-len(fixed))]

def run(now=None,fetch=None):
    now=now or dt.datetime.now(dt.timezone.utc)
    if now.tzinfo is None: raise ValueError("timezone-aware datetime required")
    ids=official_ids()
    existing={}
    if STATE.exists():
        try:
            data=json.loads(STATE.read_text(encoding="utf-8"))
            if isinstance(data.get("candidates"),dict):existing=data["candidates"]
        except (ValueError,OSError):pass
    records=dict(existing)
    checks=0;errors=[];verified=[];scanned=[]
    if not os.environ.get("STREAMNOW_YOUTUBE_DATA_API_KEY"):
        errors.append("YOUTUBE_API_KEY_NOT_CONFIGURED")
    else:
        for genre,code,term in selected_queries(now):
            scanned.append({"genre":genre,"country":code,"term":term})
            try:
                result=api_json("search",{"part":"snippet","q":term,"eventType":"live",
                                         "type":"video","maxResults":10},fetch)
                checks+=1
                for item in result.get("items",[]):
                    vid=(item.get("id") or {}).get("videoId")
                    sn=item.get("snippet") or {}
                    channel=sn.get("channelId")
                    if not vid or len(vid)!=11 or not channel or not channel.startswith("UC"):continue
                    key=channel+":"+vid
                    is_curated=channel in ids
                    # All non-curated identities are leads, never published.
                    records[key]={"videoId":vid,"channelId":channel,"title":str(sn.get("title",""))[:180],
                                  "channelTitle":str(sn.get("channelTitle",""))[:140],
                                  "topic":genre,"countryHint":code,"source":"youtube-data-api",
                                  "identity":"CURATED_OFFICIAL" if is_curated else "REVIEW_PENDING",
                                  "access_state":"LIVE_SEARCH_CANDIDATE",
                                  "last_seen_utc":now.isoformat()}
                    if is_curated:verified.append((key,vid,channel))
            except Exception as exc:
                errors.append("search-error:"+type(exc).__name__)
        # Only videos from known publisher IDs can be evaluated for embed.
        unique=list({vid:(key,channel) for key,vid,channel in verified}.items())
        for offset in range(0,len(unique),50):
            batch=unique[offset:offset+50]
            try:
                detail=api_json("videos",{"part":"snippet,status,liveStreamingDetails",
                                         "id":",".join(vid for vid,_ in batch)},fetch)
                by_id={v.get("id"):v for v in detail.get("items",[])}
                for vid,(key,channel) in batch:
                    item=by_id.get(vid) or {}
                    sn=item.get("snippet") or {}
                    live=sn.get("liveBroadcastContent")=="live"
                    embeddable=(item.get("status") or {}).get("embeddable") is True
                    records[key]["access_state"]="LIVE_EMBED_API_ELIGIBLE" if (live and embeddable) else "NOT_LIVE_OR_EMBED_RESTRICTED"
            except Exception as exc: errors.append("videos-error:"+type(exc).__name__)
    # Research state is metadata only; never store secret API keys or HLS URLs.
    if len(records)>6000:
        records=dict(sorted(records.items(),key=lambda x:x[1].get("last_seen_utc",""),reverse=True)[:6000])
    reviewed=[]
    for key,item in records.items():
        if item.get("last_seen_utc")!=now.isoformat() or item.get("access_state")!="LIVE_EMBED_API_ELIGIBLE":continue
        curated=ids.get(item.get("channelId"))
        if not curated:continue
        reviewed.append({"id":"ytlive:"+item["videoId"],"name":curated["name"],
                          "code":curated["code"],"genre":curated["genre"],
                          "url":"https://www.youtube.com/watch?v="+item["videoId"],
                          "videoId":item["videoId"],"channelId":item["channelId"],
                          "provider":"youtube","identity":"CURATED_OFFICIAL",
                          "live_api_checked_at":now.isoformat(),
                          "embed_status":"API_ELIGIBLE_NOT_PHYSICAL_DEVICE_VERIFIED",
                          "rights_status":"UNVERIFIED_TERRITORY_AND_EVENT"})
    # Do not replace an existing published catalog if API absent/error. Output
    # remains research-only; publishing requires legal, product and QA review.
    STATE.parent.mkdir(parents=True,exist_ok=True)
    STATE.write_text(json.dumps({"schema":1,"updated_at":now.isoformat(),"candidates":records},
                                indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    report={"schema":1,"run_utc":now.isoformat(),"searches_attempted":checks,
            "queries":scanned,"candidates_total":len(records),
            "api_eligible_curated_lives":reviewed,"auto_published":0,
            "errors":errors,"mode":"RESEARCH_ONLY_NO_YOUTUBE_AUTO_PUBLICATION"}
    REPORT.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    return report

if __name__=="__main__":
    result=run()
    print(json.dumps({k:v for k,v in result.items() if k!="api_eligible_curated_lives"},ensure_ascii=False))
