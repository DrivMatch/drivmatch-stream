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
