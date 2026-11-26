export const WATCHED = new Set([
  "Stream Now full-channel health audit",
  "DrivMatch - Autopiloto diario de canais",
  "Stream Now independent 04h and 06h channel audits",
  "Stream Now Cloudflare Pages",
  "Deploy DrivMatch Stream (independent)",
  "Stream Now P0 favorites integrity — independent account audits"
]);
export const AUTOMATIC_RETRY_MAX = 1;
export function eligibleRun(run) {
  return Boolean(run && WATCHED.has(run.name) &&
    run.head_branch === "main" && run.status === "completed");
}
export function shouldRetry(run, newerSameWorkflowRunning = false) {
  return eligibleRun(run) && !newerSameWorkflowRunning &&
    ["failure","timed_out"].includes(run.conclusion) &&
    Number(run.run_attempt || 1) <= AUTOMATIC_RETRY_MAX;
}
export function runIncidentKey(run) {
  return "run:" + String(run.id);
}
export function saoPauloParts(date) {
  const parts = new Intl.DateTimeFormat("en-US",{
    timeZone:"America/Sao_Paulo", year:"numeric",month:"2-digit",
    day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"
  }).formatToParts(new Date(date));
  const obj=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return {date:obj.year+"-"+obj.month+"-"+obj.day,
    hour:Number(obj.hour),minute:Number(obj.minute)};
}
export function missedSchedules(runs,now) {
  const local=saoPauloParts(now),minute=local.hour*60+local.minute;
  const tasks=[
    {type:"02",name:"DrivMatch - Autopiloto diario de canais",due:3*60+20,target:2*60},
    {type:"04",name:"Stream Now independent 04h and 06h channel audits",due:5*60+20,target:4*60},
    {type:"06",name:"Stream Now independent 04h and 06h channel audits",due:7*60+20,target:6*60}
  ];
  return tasks.filter(task=>{
    if(minute < task.due) return false;
    return !runs.some(r=>{
      if(r.name!==task.name || r.head_branch!=="main")return false;
      const t=saoPauloParts(r.created_at);
      const started=t.hour*60+t.minute;
      return t.date===local.date && started>=task.target && started<task.due;
    });
  }).map(task=>({date:local.date,type:task.type,key:"missed:"+local.date+":"+task.type}));
}

export function shouldRecoverMissing(type,runs,now) {
  const day=saoPauloParts(now).date;
  const daily="DrivMatch - Autopiloto diario de canais";
  const today=(runs||[]).filter(r=>r.head_branch==="main" &&
    saoPauloParts(r.created_at).date===day);
  const dailyOK=today.some(r=>r.name===daily && r.status==="completed" &&
    r.conclusion==="success");
  const activeScan=today.some(r=>r.name===daily && r.status!=="completed");
  if(type==="02")return !dailyOK&&!activeScan;
  if(type==="04"||type==="06")return dailyOK&&!activeScan;
  return false;
}

export function resumableFullAudit(run,jobs,artifacts,superseded=false){
  // A failed finalizer should reuse ALL 24 successful shard artifacts instead
  // of paying for another 8,000+ channel scans. Partial scans are not eligible.
  if(!eligibleRun(run)||run.name!=="Stream Now full-channel health audit"||
     run.conclusion!=="failure"||superseded)return false;
  const scans=(jobs||[]).filter(x=>/^scan \((?:\d{1,2})\)$/.test(x.name||""));
  const numbered=new Set(scans.map(x=>Number(x.name.match(/\d+/)[0])));
  if(scans.length!==24||numbered.size!==24||
     ![...numbered].every(n=>n>=0&&n<24)||
     !scans.every(x=>x.conclusion==="success"))return false;
  const final=(jobs||[]).find(x=>x.name==="finalize");
  if(!final||final.conclusion!=="failure")return false;
  const names=new Set((artifacts||[]).filter(x=>!x.expired).map(x=>x.name));
  return names.has("streamnow-full-prepare") &&
    Array.from({length:24},(_,n)=>"streamnow-full-scan-"+n).every(x=>names.has(x));
}

export function canCloseRecoveredAuditIncident(failed,recovered,health,shaMatch){
  return Boolean(shaMatch && health?.schema===1 && health?.status==="COMPLETE_HLS" &&
    Number(health.tested)>0 && failed?.name==="Stream Now full-channel health audit" &&
    failed?.status==="completed" && failed?.conclusion==="failure" &&
    recovered?.name==="Stream Now full-channel health audit" &&
    recovered?.status==="completed" && recovered?.conclusion==="success" &&
    recovered?.head_branch==="main" &&
    Date.parse(recovered.created_at)>Date.parse(failed.created_at));
}

export function githubContentsNeedsBlobFetch(contents){
  // GitHub Contents API returns encoding:"none" and content:"" for >1MB.
  return !contents || contents.encoding!=="base64" || !contents.content;
}
export function decodeCanonicalGitBlob(contents){
  if(contents?.encoding!=="base64" || !contents.content)
    throw Error("Canonical GitHub playlist blob unavailable");
  const canonical=Buffer.from(String(contents.content).replace(/\s+/g,""),"base64");
  if(!canonical.length)throw Error("Canonical GitHub playlist is empty");
  return canonical;
}
