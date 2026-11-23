/* Country-indexed consolidation of the existing public sources 1–8.
 * A channel in a playlist is not proof of signal/rights/TV compatibility.
 * This module does not forward video and never accepts arbitrary source URLs.
 */
const MAX_BYTES=8300000;
const MAX_ITEMS=14000;
const MERGE_IDS=["lista-1","lista-3","lista-4","lista-5","lista-6","lista-7","lista-8","lista-9","lista-10","lista-11","lista-12"];
const GROUP_HINTS={
 BR:/\b(?:brasil|brazil)\b/i,US:/\b(?:united states|estados unidos|usa)\b/i,
 PT:/\bportugal\b/i,ES:/\b(?:españa|espanha|spain)\b/i,
 AR:/\bargentina\b/i,JP:/\b(?:japan|japao|japão)\b/i,
 CN:/\bchina\b/i,UK:/\b(?:england|united kingdom|great britain)\b/i,
 FR:/\b(?:france|frança)\b/i,DE:/\b(?:germany|deutschland|alemanha)\b/i,
 IT:/\b(?:italy|italia)\b/i,BE:/\b(?:belgium|belgique|belgië)\b/i
};
function attr(info,name){
 const m=new RegExp("(?:^|\\s)"+name+'="([^"]*)"',"i").exec(info);
 return m?m[1]:"";
}
function codeOf(value){
 const c=String(value||"").trim().toUpperCase();
 return c==="GB"?"UK":/^[A-Z]{2}$/.test(c)?c:"OTHER";
}
function inferCountry(info,source,forced){
 if(forced)return codeOf(forced);
 if(source==="lista-8")return "BR";
 const country=attr(info,"tvg-country").split(/[;,\s]/)[0];
 if(country)return codeOf(country);
 const m=/\.([A-Za-z]{2})(?:@|$)/.exec(attr(info,"tvg-id"));
 if(m)return codeOf(m[1]);
 const group=attr(info,"group-title");
 for(const [code,re] of Object.entries(GROUP_HINTS))if(re.test(group))return code;
 return "OTHER";
}
function parseRows(raw,source,forced,requested){
 const items=[];let info="";
 for(const untrimmed of String(raw||"").split(/\r?\n/)){
  const line=untrimmed.trim();
  if(line.startsWith("#EXTINF:")){info=line;continue;}
  if(!info||!line||line[0]==="#")continue;
  const header=info;info="";
  if(!/^https:\/\//i.test(line)||!/\.(?:m3u8|mp4)(?:[?#]|$)/i.test(line))continue;
  const comma=header.lastIndexOf(",");
  const name=comma>=0?header.slice(comma+1).trim():"";
  if(!name||/\[(?:geo.blocked|blocked)\]/i.test(name))continue;
  const country=inferCountry(header,source,forced);
  if(requested!=="ALL"&&country!==requested)continue;
  const prefix=header.slice(0,comma).slice(0,2000);
  const meta=prefix+' dm-country="'+country+'" dm-source="'+source+'"'+header.slice(comma);
  items.push({name,code:country,meta,url:line.slice(0,2048)});
 }
 return items;
}
function workloads(country,urls,originalCountries){
 const jobs=MERGE_IDS.map(id=>({id,url:urls[id],country:id==="lista-8"?"BR":null}));
 if(country==="ALL"){
  for(const c of originalCountries)jobs.push({
   id:"lista-2",url:"https://iptv-org.github.io/iptv/countries/"+c+".m3u",country:c.toUpperCase()
  });
 }else if(originalCountries.includes(country.toLowerCase())){
  jobs.push({id:"lista-2",
   url:"https://iptv-org.github.io/iptv/countries/"+country.toLowerCase()+".m3u",
   country});
 }
 return jobs;
}
async function sourceData(country,urls,originalCountries,load){
 const jobs=workloads(country,urls,originalCountries);
 const settled=await Promise.allSettled(jobs.map(async job=>({...job,raw:await load(job.url,job.id)})));
 return {jobs,settled};
}
export async function countryIndex(urls,originalCountries,load){
 // The eleven independent sources + the original 12 country catalogs.
 const {settled}=await sourceData("OTHER",urls,originalCountries,load);
 const codes=new Set(originalCountries.map(c=>c.toUpperCase()));let ok=0;
 for(const result of settled){
  if(result.status!=="fulfilled")continue;ok++;
  const job=result.value;
  for(const c of parseRows(job.raw,job.id,job.country,"ALL"))
   if(c.code!=="OTHER")codes.add(c.code);
 }
 if(!ok)throw Error("No source catalogs available");
 let names=null;
 try{names=new Intl.DisplayNames(["pt-BR"],{type:"region"});}catch{}
 const label=c=>{try{return names?names.of(c):c;}catch{return c;}};
 return {countries:[...codes].sort((a,b)=>label(a).localeCompare(label(b),"pt-BR"))
  .map(code=>({code,name:label(code)})),
  loaded:ok,total:settled.length};
}
export async function mergedCatalog(country,urls,originalCountries,load){
 const {jobs,settled}=await sourceData(country,urls,originalCountries,load);
 const rows=[],seen=new Map(),failed=[];let completed=0,bytes=0,truncated=false;
 for(let i=0;i<settled.length;i++){
  const status=settled[i];
  if(status.status!=="fulfilled"){failed.push(jobs[i].id);continue;}
  completed++;
  const entry=status.value;
  for(const row of parseRows(entry.raw,entry.id,entry.country,country)){
   const key=row.code+"|"+row.name.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
     .toLowerCase().trim();
   const existing=seen.get(key);
   if(existing&&(existing.urls.has(row.url)||existing.count>=3))continue;
   const amount=row.meta.length+row.url.length+2;
   if(rows.length>=MAX_ITEMS||bytes+amount>MAX_BYTES){truncated=true;continue;}
   rows.push(row);bytes+=amount;
   if(existing){existing.count++;existing.urls.add(row.url);}
   else seen.set(key,{count:1,urls:new Set([row.url])});
  }
 }
 if(!completed)throw Error("All source catalogs unavailable");
 rows.sort((a,b)=>a.code.localeCompare(b.code)||a.name.localeCompare(b.name,"pt-BR"));
 const pre=["#EXTM3U","#DM_MERGED:LISTAS-1-12","#DM_COUNTRY_VIEW:"+country,
  "#DM_SOURCES_LOADED:"+completed+"/"+jobs.length];
 if(failed.length)pre.push("#DM_PARTIAL:"+failed.join(","));
 if(truncated)pre.push("#DM_TRUNCATED:1");
 for(const row of rows){pre.push(row.meta,row.url);}
 return pre.join("\n");
}
