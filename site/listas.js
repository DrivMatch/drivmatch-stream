/* DrivMatch Stream private IPTV library. No retransmission or licensed-content bypass. */
(() => {
"use strict";
const $=id=>document.getElementById(id);
const countries={BR:"🇧🇷 Brasil",PT:"🇵🇹 Portugal",ES:"🇪🇸 Espanha",JP:"🇯🇵 Japão",
CN:"🇨🇳 China",US:"🇺🇸 Estados Unidos",AR:"🇦🇷 Argentina",UK:"🇬🇧 UK",
BE:"🇧🇪 Bélgica",IT:"🇮🇹 Itália",FR:"🇫🇷 França",DE:"🇩🇪 Alemanha"};
const norm=s=>String(s||"").toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();
const NEWS=/news|not[ií]cias|jornal|actualidad|actualit[eé]s|nieuws|nachrichten|noticiero|informa|新闻|ニュース|報道/i;
const SPORTS=/sport|esport|deport|football|futebol|soccer|calcio|スポーツ|体育/i;
const PREMIUM=/\b(espn|premiere|combate|sky\s*sports?|bein\s*sports?|tnt\s*sports?|sport\s*tv|dazn|ppv|pay.per.view)\b/i;
const state={sources:[],source:null,channels:[],limit:60,favorites:new Set(),onlyFavorites:false,
health:new Map(),selected:null,hls:null,playToken:0,loadToken:0,timeout:null,attempt:null};
const video=$("video");let hlsPromise=null;
const MAX_BYTES=6000000;
function safeUrl(s){
  try{
    const u=new URL(s);
    if(u.protocol!=="https:"||u.username||u.password||!u.hostname)return null;
    if(/^(localhost|127\.|0\.0\.0\.0$|\[::1\]$)/i.test(u.hostname)||u.hostname.endsWith(".local"))return null;
    return u.href;
  }catch{return null;}
}
function attribute(line,key){
  const m=new RegExp("(?:^|\\s)"+key+'="([^"]*)"',"i").exec(line);
  return m?.[1]||"";
}
function canonicalCountry(c){
  const code=String(c||"").toUpperCase().trim();
  return code==="GB"?"UK":Object.hasOwn(countries,code)?code:"OTHER";
}
function inferCountry(ext,group,hint){
  if(hint)return canonicalCountry(hint);
  const direct=attribute(ext,"tvg-country").split(/[;,\s]/)[0];
  if(direct)return canonicalCountry(direct);
  const id=attribute(ext,"tvg-id"),m=/\.([A-Z]{2})(?:@|$)/i.exec(id);
  if(m)return canonicalCountry(m[1]);
  const patterns={BR:/brasil|brazil/i,PT:/portugal/i,ES:/espa[nñ]a|spain/i,
    JP:/japan|jap[aã]o/i,CN:/china/i,US:/usa|united states|estados unidos/i,
    AR:/argentina/i,UK:/united kingdom|great britain|\buk\b/i,BE:/belgium|belgique|belgië/i,
    IT:/italy|italia/i,FR:/france|fran[cç]a/i,DE:/germany|deutschland|alemanha/i};
  for(const [code,re] of Object.entries(patterns))if(re.test(group))return code;
  return "OTHER";
}
function classify(name,group,source){
  if(source.id==="lista-3")return "news";
  if(source.id==="lista-4")return "sports";
  const v=name+" "+group;
  return SPORTS.test(v)?"sports":NEWS.test(v)?"news":"other";
}
function parseM3u(text,source,hint){
  if(typeof text!=="string"||text.length>MAX_BYTES)throw Error("Arquivo M3U acima do limite.");
  if(!/^\uFEFF?\s*#EXTM3U/i.test(text))throw Error("Formato inválido: esperado #EXTM3U.");
  if(/#EXT-X-TARGETDURATION:/i.test(text))throw Error("Endereço HLS de vídeo não é catálogo M3U.");
  const found=new Map();let ext="";
  for(const raw of text.split(/\r?\n/)){
    const line=raw.trim();
    if(line.startsWith("#EXTINF:")){ext=line;continue;}
    if(!ext||!line||line.startsWith("#"))continue;
    const metadata=ext;ext="";
    const name=metadata.slice(metadata.lastIndexOf(",")+1).trim().slice(0,160);
    const group=attribute(metadata,"group-title").slice(0,100);
    const epgId=attribute(metadata,"tvg-id").slice(0,120);
    const url=safeUrl(line);
    if(!name||!url||!source.personal&&PREMIUM.test(name+" "+group))continue;
    if(!source.personal&&!/\.m3u8(?:[?#]|$)|\.mp4(?:[?#]|$)/i.test(url))continue;
    const code=inferCountry(metadata,group,hint);
    const kind=classify(name,group,source);
    const id=(epgId?"epg:"+norm(epgId):"name:"+norm(name))+"|"+code;
    const existing=found.get(id);
    if(existing){if(existing.urls.length<4&&!existing.urls.includes(url))existing.urls.push(url);continue;}
    if(found.size>=12000)break;
    found.set(id,{id,name,group,epgId,country:code,kind,
      logo:safeUrl(attribute(metadata,"tvg-logo")),urls:[url],sourceId:source.id});
  }
  return [...found.values()];
}
async function downloadM3u(address){
  const url=safeUrl(address);
  if(!url)throw Error("URL inválida");
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),18000);
  try{
    const r=await fetch(url,{credentials:"omit",redirect:"follow",cache:"no-store",signal:controller.signal});
    if(!r.ok)throw Error("HTTP "+r.status);
    if(Number(r.headers.get("content-length")||0)>MAX_BYTES)throw Error("Lista grande demais");
    if(!r.body){
      const txt=await r.text();
      if(txt.length>MAX_BYTES)throw Error("Lista grande demais");
      return txt;
    }
    const reader=r.body.getReader();let total=0;const chunks=[];
    try{
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        total+=value.length;if(total>MAX_BYTES)throw Error("Lista grande demais");
        chunks.push(value);
      }
    }finally{reader.releaseLock();}
    const bytes=new Uint8Array(total);let pos=0;
    for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.length;}
    return new TextDecoder().decode(bytes);
  }finally{clearTimeout(timer);}
}
function key(c){return c.sourceId+"::"+c.id;}
function favoritesLoad(){
  try{
    const entries=JSON.parse(localStorage.getItem("drivmatch-iptv-library-fav-v1")||"[]");
    if(Array.isArray(entries))for(const s of entries)if(typeof s==="string")state.favorites.add(s);
  }catch{}
}
function favoritesSave(){
  try{localStorage.setItem("drivmatch-iptv-library-fav-v1",JSON.stringify([...state.favorites]));}catch{}
}
function status(c){
  const v=state.health.get(key(c));
  return v==="ok"?"✓ Reproduziu aqui":v==="failed"?"⚠ Falha aqui":"? Não testado";
}
function renderSources(){
  const area=$("source-list");area.replaceChildren();
  for(const s of state.sources){
    const button=document.createElement("button");button.type="button";
    button.className="source"+(state.source?.id===s.id?" active":"");
    const title=document.createElement("strong"),kind=document.createElement("span"),desc=document.createElement("small");
    title.textContent=s.title;kind.textContent=s.kind;kind.className="source-kind";
    desc.textContent=s.description;button.append(title,kind,desc);
    button.addEventListener("click",()=>void selectSource(s));
    area.append(button);
  }
}
function renderChannels(){
  const search=norm($("search").value),country=$("country").value,genre=$("genre").value;
  const matches=state.channels.filter(c=>
    (!search||norm(c.name+" "+c.group+" "+(countries[c.country]||"")).includes(search))&&
    (country==="ALL"||c.country===country)&&(genre==="all"||c.kind===genre)&&
    (!state.onlyFavorites||state.favorites.has(key(c))));
  const order={ok:0,unknown:1,failed:2};
  matches.sort((a,b)=>order[state.health.get(key(a))||"unknown"]-
    order[state.health.get(key(b))||"unknown"]||a.name.localeCompare(b.name,"pt-BR"));
  const area=$("channel-list");area.replaceChildren();
  const fragment=document.createDocumentFragment();
  for(const c of matches.slice(0,state.limit)){
    const row=document.createElement("div");
    row.className="channel"+(state.selected===c?" active":"");
    const pick=document.createElement("button");pick.type="button";pick.className="pick";
    const logo=c.logo?document.createElement("img"):document.createElement("span");
    logo.className="logo"+(c.logo?"":" logo-placeholder");
    if(c.logo){logo.src=c.logo;logo.alt="";logo.loading="lazy";logo.referrerPolicy="no-referrer";
      logo.onerror=()=>logo.removeAttribute("src");
    }else logo.textContent="TV";
    const info=document.createElement("span"),title=document.createElement("strong"),meta=document.createElement("small");
    title.textContent=c.name;
    meta.textContent=(countries[c.country]||"🌐 País não informado")+" • "+
      (c.group||({news:"Notícias",sports:"Esportes",other:"Ao vivo"}[c.kind]))+
      " • "+status(c)+(c.epgId?" • ID EPG":"");
    info.append(title,meta);pick.append(logo,info);
    pick.addEventListener("click",()=>void chooseChannel(c));
    const fav=document.createElement("button");fav.type="button";
    const marked=state.favorites.has(key(c));
    fav.className="star"+(marked?" marked":"");fav.textContent=marked?"★":"☆";
    fav.setAttribute("aria-label",(marked?"Remover favorito ":"Favoritar ")+c.name);
    fav.addEventListener("click",()=>{
      if(marked)state.favorites.delete(key(c));else state.favorites.add(key(c));
      if(!state.source?.personal)favoritesSave();
      renderChannels();
    });
    row.append(pick,fav);fragment.append(row);
  }
  area.append(fragment);
  $("catalog-status").textContent=matches.length+" neste filtro • "+state.channels.length+
    " catalogados • reprodução ainda não garantida";
  $("show-more").hidden=matches.length<=state.limit;
  if(!matches.length){
    const p=document.createElement("p");p.className="status";
    p.textContent="Nenhum canal encontrado neste filtro.";area.append(p);
  }
}
async function selectSource(s){
  const token=++state.loadToken;
  stopPlayer();state.source=s;state.channels=[];state.limit=60;
  $("search").value="";$("country").value="ALL";$("genre").value="all";
  $("favorites-only").checked=false;state.onlyFavorites=false;
  $("active-source").textContent=s.title+" — "+s.description;
  $("channel-list").replaceChildren();$("show-more").hidden=true;
  $("catalog-status").textContent="Carregando catálogo…";renderSources();
  if(s.channels){state.channels=s.channels;renderChannels();return;}
  const response=await Promise.allSettled(s.urls.map(async url=>{
    const country=s.id==="lista-2"?/\/countries\/([a-z]{2})\.m3u/i.exec(url)?.[1]:null;
    return parseM3u(await downloadM3u(url),s,country);
  }));
  if(token!==state.loadToken)return;
  const combined=new Map();
  for(const item of response){
    if(item.status!=="fulfilled")continue;
    for(const c of item.value){
      const old=combined.get(c.id);
      if(old){for(const url of c.urls)if(!old.urls.includes(url)&&old.urls.length<4)old.urls.push(url);}
      else combined.set(c.id,c);
    }
  }
  state.channels=[...combined.values()];
  renderChannels();
  const fails=response.filter(r=>r.status==="rejected").length;
  if(fails)$("catalog-status").textContent+=" • "+fails+"/"+response.length+" fontes inacessíveis";
  if(!state.channels.length)$("catalog-status").textContent=
    "Nenhum canal carregado: URL, CORS, indisponibilidade ou formato incompatível.";
}
function stopPlayer(){
  state.playToken++;
  clearTimeout(state.timeout);state.timeout=null;
  try{video.pause();}catch{}
  if(state.hls){state.hls.destroy();state.hls=null;}
  video.removeAttribute("src");try{video.load();}catch{}
  video.hidden=true;$("placeholder").hidden=false;$("fullscreen").disabled=true;
  state.selected=null;state.attempt=null;
  $("now-name").textContent="Nenhum canal selecionado";
  $("now-detail").textContent="Status: não verificado";$("player-error").hidden=true;
}
function error(message){$("player-error").textContent=message;$("player-error").hidden=false;}
function ensureHls(){
  if(window.Hls)return Promise.resolve(window.Hls);
  if(!hlsPromise)hlsPromise=new Promise((resolve,reject)=>{
    const script=document.createElement("script");script.async=true;script.crossOrigin="anonymous";
    script.src="https://cdn.jsdelivr.net/npm/hls.js@1.6.15/dist/hls.min.js";
    script.onload=()=>window.Hls?resolve(window.Hls):reject(Error("HLS"));
    script.onerror=()=>reject(Error("HLS network"));document.head.append(script);
  }).catch(e=>{hlsPromise=null;throw e;});
  return hlsPromise;
}
function current(token,c){return state.playToken===token&&state.selected===c;}
function requestPlay(token,c){
  if(!current(token,c)||state.attempt?.playInvoked)return;
  state.attempt.playInvoked=true;
  try{
    const p=video.play();
    if(p&&typeof p.catch==="function")p.catch(()=>{
      if(current(token,c)){clearTimeout(state.timeout);state.timeout=null;
        error("Toque em Play no vídeo para iniciar, se a emissora permitir.");}
    });
  }catch{clearTimeout(state.timeout);state.timeout=null;error("Toque em Play no vídeo.");}
}
function fail(token,c,index){
  if(!current(token,c)||state.attempt?.failed)return;
  state.attempt.failed=true;clearTimeout(state.timeout);
  if(index+1<c.urls.length){void attach(c,index+1);return;}
  state.health.set(key(c),"failed");
  $("now-detail").textContent="Não reproduziu neste dispositivo";
  error("Transmissão indisponível, bloqueada por região, DRM, CORS ou pela própria emissora.");
  renderChannels();
}
async function attach(c,index){
  const token=++state.playToken;
  clearTimeout(state.timeout);
  try{video.pause();}catch{}
  if(state.hls){state.hls.destroy();state.hls=null;}
  video.removeAttribute("src");try{video.load();}catch{}
  state.selected=c;state.attempt={index,playInvoked:false,failed:false};
  video.hidden=false;$("placeholder").hidden=true;$("fullscreen").disabled=false;
  $("player-error").hidden=true;$("now-name").textContent=c.name;
  $("now-detail").textContent="Verificando sinal "+(index+1)+"/"+c.urls.length;
  state.timeout=setTimeout(()=>fail(token,c,index),20000);
  const url=c.urls[index];
  try{
    if(/\.mp4(?:[?#]|$)/i.test(url)||
      video.canPlayType("application/vnd.apple.mpegurl")||
      video.canPlayType("application/x-mpegURL")){
      video.src=url;video.load();
    }else{
      const Hls=await ensureHls();
      if(!current(token,c))return;
      if(Hls.isSupported()){
        const hls=new Hls();state.hls=hls;
        hls.on(Hls.Events.MEDIA_ATTACHED,()=>{if(current(token,c))hls.loadSource(url);});
        hls.on(Hls.Events.MANIFEST_PARSED,()=>{if(current(token,c))requestPlay(token,c);});
        hls.on(Hls.Events.ERROR,(_event,detail)=>{if(detail.fatal)fail(token,c,index);});
        hls.attachMedia(video);
      }else{video.src=url;video.load();}
    }
  }catch{fail(token,c,index);}
}
async function chooseChannel(c){
  state.health.delete(key(c));
  await attach(c,0);renderChannels();
}
function setup(){
  for(const id of ["search","country","genre"]){
    $(id).addEventListener(id==="search"?"input":"change",()=>{state.limit=60;renderChannels();});
  }
  $("favorites-only").addEventListener("change",e=>{
    state.onlyFavorites=e.target.checked;state.limit=60;renderChannels();
  });
  $("show-more").addEventListener("click",()=>{state.limit+=60;renderChannels();});
  $("fullscreen").addEventListener("click",()=>{
    const p=document.querySelector(".screen").requestFullscreen?.();p?.catch(()=>{});
  });
  video.addEventListener("canplay",()=>{if(state.selected)requestPlay(state.playToken,state.selected);});
  video.addEventListener("playing",()=>{
    const c=state.selected;if(!c)return;
    clearTimeout(state.timeout);state.timeout=null;
    state.health.set(key(c),"ok");
    $("now-detail").textContent=(countries[c.country]||"País não informado")+" • Reproduziu nesta sessão";
    $("player-error").hidden=true;renderChannels();
  });
  video.addEventListener("error",()=>{
    if(state.selected&&state.attempt)fail(state.playToken,state.selected,state.attempt.index);
  });
  $("source-form").addEventListener("submit",e=>{
    e.preventDefault();
    const title=$("custom-name").value.trim(),url=safeUrl($("custom-url").value.trim());
    if(!title||!url||!/\.m3u8?(?:[?#]|$)/i.test(url)){
      $("import-status").textContent="Informe nome e URL pública HTTPS M3U/M3U8, sem credenciais.";return;
    }
    const num=state.sources.length+1;
    const s={id:"personal-"+num,title:"Lista "+num+" • "+title.slice(0,80),
      kind:"pessoal / nesta sessão",description:"Lista fornecida pelo usuário; direitos e CORS não verificados.",
      urls:[url],personal:true};
    state.sources.push(s);$("source-form").reset();
    $("import-status").textContent="Lista adicionada sem armazenar a URL.";
    void selectSource(s);
  });
  $("custom-file").addEventListener("change",async e=>{
    const file=e.target.files?.[0];if(!file)return;
    if(file.size>5000000||!/\.m3u8?$/i.test(file.name)){
      $("import-status").textContent="Envie somente M3U/M3U8 com até 5 MB.";return;
    }
    try{
      const num=state.sources.length+1;
      const s={id:"personal-"+num,title:"Lista "+num+" • "+file.name.slice(0,80),
        kind:"arquivo local / nesta sessão",description:"Arquivo processado localmente, sem upload.",personal:true};
      s.channels=parseM3u(await file.text(),s,null);
      state.sources.push(s);
      $("import-status").textContent=s.channels.length+" canais lidos do arquivo local.";
      void selectSource(s);
    }catch(err){$("import-status").textContent="Falha ao importar: "+String(err.message||"formato inválido");}
    finally{e.target.value="";}
  });
}
async function start(){
  setup();
  try{
    const r=await fetch("/stream/session",{credentials:"same-origin",cache:"no-store"});
    if(!r.ok||(await r.json()).allowed!==true)throw Error("unauthorized");
  }catch{$("access-error").hidden=false;return;}
  $("library").hidden=false;favoritesLoad();
  try{
    const r=await fetch("/stream/listas/sources.json",{credentials:"same-origin",cache:"no-store"});
    if(!r.ok)throw Error("sources");
    const data=await r.json();
    if(!Array.isArray(data.sources))throw Error("sources format");
    state.sources=data.sources;renderSources();
    $("library-status").textContent=state.sources.length+" listas de diretórios públicos"+
      " • disponibilidade e direitos de cada transmissão não verificados";
  }catch{$("library-status").textContent="Não foi possível carregar as fontes.";}
}
void start();
})();
