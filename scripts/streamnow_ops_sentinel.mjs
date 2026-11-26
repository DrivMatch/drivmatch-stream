#!/usr/bin/env node
// GitHub-native Stream Now operational incident sentinel.
// No login, favorites, D1, catalog, or financial data are read or modified.
import fs from "node:fs";
import crypto from "node:crypto";
import {WATCHED, eligibleRun, shouldRetry, runIncidentKey, missedSchedules, saoPauloParts, shouldRecoverMissing, resumableFullAudit} from "./streamnow_ops_policy.mjs";

const token=process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const repo=process.env.GITHUB_REPOSITORY;
const required=Boolean(token && repo && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo));
if(!required)throw Error("Required scoped GitHub repo and token missing");
const base="/repos/"+repo;
const apiHeaders={
 "Authorization":"Bearer "+token,
 "Accept":"application/vnd.github+json",
 "X-GitHub-Api-Version":"2022-11-28",
 "User-Agent":"streamnow-ops-sentinel"
};
async function api(method,path,body) {
 const resp=await fetch("https://api.github.com"+path,{
   method,headers:{...apiHeaders,...(body?{"Content-Type":"application/json"}:{})},
   body:body?JSON.stringify(body):undefined,
   signal:AbortSignal.timeout(20000)
 });
 if(!resp.ok)throw Error("GitHub API "+method+" "+path+" HTTP "+resp.status+" "+(await resp.text()).slice(0,300));
 if(resp.status===204 || resp.status===202)return {};
 const raw=await resp.text();
 return raw?JSON.parse(raw):{};
}
async function artifact(url){
 const r=await fetch(url,{headers:{"User-Agent":"StreamNow-Ops-Sentinel"},signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error("Published catalog HTTP "+r.status);
 return Buffer.from(await r.arrayBuffer());
}
const now=new Date();
const recent=await api("GET",base+"/actions/runs?per_page=100");
const runs=(recent.workflow_runs||[]).filter(r=>WATCHED.has(r.name)&&r.head_branch==="main");
const issues=await api("GET",base+"/issues?state=all&per_page=100");
const issueList=(issues||[]).filter(x=>!x.pull_request);
const currentAlert=[];
const summary=[];
function title(key){return "[Stream Now OPS] "+key;}
function findIssue(key){return issueList.find(x=>x.title===title(key));}
async function openIncident(key,text){
 const old=findIssue(key);
 if(old){
   if(old.state==="closed")await api("PATCH",base+"/issues/"+old.number,{state:"open"});
   return old.number;
 }
 // Assigning the repository owner makes standard GitHub notifications possible,
 // provided that account's notification preferences allow delivery.
 const owner=repo.split("/")[0];
 const payload={title:title(key),body:text,assignees:[owner]};
 let created;
 try{created=await api("POST",base+"/issues",payload);}
 catch(e){
   // Do not discard the incident when assignability fails.
   created=await api("POST",base+"/issues",{title:title(key),body:text});
 }
 issueList.push(created);
 currentAlert.push(key);
 return created.number;
}
async function closeIncident(key,body){
 const x=findIssue(key);
 if(!x || x.state!=="open")return;
 await api("POST",base+"/issues/"+x.number+"/comments",{body});
 await api("PATCH",base+"/issues/"+x.number,{state:"closed"});
}
function sameWorkflowSuperseded(r){
 return runs.some(x=>x.name===r.name && x.id!==r.id &&
   Date.parse(x.created_at)>Date.parse(r.created_at));
}
const recentFailures=runs.filter(r=>eligibleRun(r) &&
  ["failure","timed_out","action_required"].includes(r.conclusion) &&
  Date.now()-Date.parse(r.updated_at)<6*3600*1000);
// Record every incident before retrying. No silent retry.
for(const run of recentFailures){
 const key=runIncidentKey(run);
 const issueNumber=await openIncident(key,
   "**Incidente operacional Stream Now**\n\n"+
   "Pipeline: **"+run.name+"**\n"+
   "Resultado: **"+run.conclusion+"**\n"+
   "Tentativa: **"+run.run_attempt+"**\n"+
   "Iniciado: "+run.run_started_at+"\n"+
   "Diagnóstico inicial e logs: "+run.html_url+"\n\n"+
   "Impacto: validar atualização do catálogo/Cloudflare; a auditoria não pode ser declarada concluída sem todos os lotes.\n"+
   "Favoritos e registros de contas não serão excluídos pelo sentinela.\n\n"+
   "Ação automática: no máximo uma repetição dos jobs falhos; nova falha exige intervenção humana."
 );
 // Recover previously tested candidates without re-running 8,599 HLS probes.
 // Only the all-successful-shards/finalizer-failed case is eligible.
 // This is guarded by an incident comment so every Sentinel poll is idempotent.
 if(run.name==="Stream Now full-channel health audit" && !sameWorkflowSuperseded(run)
    && Number(run.run_attempt||1)===1){
   try{
     const [jobData,artifactData]=await Promise.all([
       api("GET",base+"/actions/runs/"+run.id+"/jobs?per_page=100"),
       api("GET",base+"/actions/runs/"+run.id+"/artifacts?per_page=100")
     ]);
     if(resumableFullAudit(run,jobData.jobs,artifactData.artifacts)){
       const marker="[SNOPS_FULL_RESUME:"+run.id+"]";
       const comments=await api("GET",base+"/issues/"+issueNumber+"/comments?per_page=100");
       if(!comments.some(c=>String(c.body||"").includes(marker))){
         // New workflow code is required: the previous failed commit's
         // rerun-failed-jobs repeats its broken artifact extraction logic.
         await api("POST",base+"/actions/workflows/streamnow-full-channel-health.yml/dispatches",{
           ref:"main",inputs:{resume_run_id:String(run.id)}
         });
         await api("POST",base+"/issues/"+issueNumber+"/comments",{
           body:marker+"\\n**Reparação automática iniciada:** recuperando os 24 lotes já concluídos "+ 
           "na versão atual do código. Nova verificação da publicação obrigatória. "+run.html_url
         });
         summary.push("Resume 24 complete shards from full audit: "+run.id);
       }
       // Never start the incompatible old-SHA retry after dispatch or marker.
       continue;
     }
   }catch(e){
     await api("POST",base+"/issues/"+issueNumber+"/comments",{
       body:"**Falha na recuperação por artefatos:** "+String(e.message).slice(0,240)+
         ". Auditoria permanece incompleta; intervenção necessária."
     });
     // Do not fall through to an unsafe old-commit finalizer retry.
     continue;
   }
 }
 if(shouldRetry(run,sameWorkflowSuperseded(run))){
   try{
     await api("POST",base+"/actions/runs/"+run.id+"/rerun-failed-jobs");
     await api("POST",base+"/issues/"+issueNumber+"/comments",{
       body:"Recuperação automática acionada: reexecução dos jobs falhos, **uma única vez**. Acompanhar: "+run.html_url
     });
     summary.push("Retry once: "+run.id);
   }catch(e){
     await api("POST",base+"/issues/"+issueNumber+"/comments",{
       body:"**ESCALONAMENTO:** tentativa automática indisponível: "+String(e.message).slice(0,200)+". Necessária intervenção."
     });
   }
 } else if(Number(run.run_attempt||1)>1){
   summary.push("Human intervention required: "+run.id);
 }
}
for(const run of runs.filter(r=>eligibleRun(r)&&r.conclusion==="success")){
 await closeIncident(runIncidentKey(run),
   "Recuperação confirmada por execução GitHub concluída com sucesso: "+run.html_url+
   "\nA reprodução real na TV deve ser validada separadamente.");
}
const missed=missedSchedules(runs,now);
for(const m of missed){
 const number=await openIncident(m.key,
   "**Agendamento ausente ou atrasado — Stream Now**\n\n"+
   "Esperado: auditoria/rotina das "+m.type+"h em "+m.date+" (America/Sao_Paulo).\n"+
   "Não encontrei uma execução do respectivo workflow entre a hora programada e o prazo de tolerância.\n"+
   "A verificação será repetida pelo sentinela. Confira GitHub Actions e recuperação da execução.\n"+
   "Não houve qualquer alteração nos dados de usuários.");
 // Single recovery dispatch per incident. Never endlessly reschedule a scan.
 if(shouldRecoverMissing(m.type,runs,now)){
   const comments=await api("GET",base+"/issues/"+number+"/comments?per_page=100");
   const marker="[SNOPS_AUTO_RECOVERY_"+m.date+"_"+m.type+"]";
   if(!comments.some(c=>String(c.body||"").includes(marker))){
     const isDaily=m.type==="02";
     const workflow=isDaily?"daily-channel-autopilot.yml":"daily-channel-audits.yml";
     const input=isDaily?{ref:"main"}:{ref:"main",inputs:{agent:m.type}};
     try{
       await api("POST",base+"/actions/workflows/"+workflow+"/dispatches",input);
       await api("POST",base+"/issues/"+number+"/comments",{
         body:marker+"\nExecução de recuperação solicitada automaticamente para "+m.type+"h. "+
           "Sem exclusão de favoritos; o resultado será verificado no workflow."
       });
       summary.push("Missed schedule dispatched once: "+m.type+"h");
     }catch(e){
       await api("POST",base+"/issues/"+number+"/comments",{
         body:marker+"\n**INTERVENÇÃO NECESSÁRIA:** não foi possível iniciar recuperação: "+
           String(e.message).slice(0,240)
       });
     }
   }
 }
}
// Compare the live published Cloudflare catalog with GitHub's canonical playlist.
// Only treat a mismatch as an incident when no known deploy is in progress.
const deploying=runs.some(r=>r.name==="Stream Now Cloudflare Pages" &&
  r.status!=="completed");
if(!deploying){
 try{
   const gh=await api("GET",base+"/contents/site/daily-autopilot.m3u8");
   const canonical=Buffer.from(String(gh.content||"").replace(/\s+/g,""),"base64");
   const publicCatalog=await artifact("https://streamnow-2o1.pages.dev/daily-autopilot.m3u8");
   const hash=x=>crypto.createHash("sha256").update(x).digest("hex");
   const match=hash(canonical)===hash(publicCatalog);
   const date=saoPauloParts(now).date;
   if(!match){
     await openIncident("catalog-diff:"+date,
       "**Divergência de catálogo publicado**\n\n"+
       "O arquivo SHA-256 servido pela Cloudflare diverge do catálogo canônico no GitHub. "+
       "Não há deploy de Cloudflare Pages identificado como em execução no momento.\n"+
       "Verifique as últimas implantações e evite afirmar novos canais publicados até normalizar.\n"+
       "O sentinela não altera o catálogo nem exclui favoritos.");
   }else{
     await closeIncident("catalog-diff:"+date,
       "A playlist publicada corresponde exatamente ao GitHub por SHA-256.");
   }
   summary.push("Cloudflare catalog SHA-256: "+(match?"MATCH":"MISMATCH"));
 }catch(e){
   await openIncident("catalog-unreachable:"+saoPauloParts(now).date,
     "**Monitor não conseguiu conferir a playlist publicada.**\n\n"+
     "Erro: "+String(e.message).slice(0,250)+"\n"+
     "É uma falha de verificação, não prova de exclusão de canais.");
 }
}
const output=[
 "### Stream Now OPS Sentinel",
 "- Checked: "+now.toISOString(),
 "- Pipelines monitored: "+WATCHED.size,
 "- Recent failing runs: "+recentFailures.length,
 "- Missed schedules: "+missed.length,
 "- New incidents opened: "+currentAlert.length,
 ...summary.map(x=>"- "+x)
].join("\n");
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,output+"\n");
console.log(output);
