/* DrivMatch Stream • private in-page viewer • source playback only (no restreaming) */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const countries = [
    {code:"ALL",name:"Todos os países",flag:"🌐"},
    {code:"BR",name:"Brasil",flag:"🇧🇷"},
    {code:"PT",name:"Portugal",flag:"🇵🇹"},
    {code:"ES",name:"Espanha",flag:"🇪🇸"},
    {code:"JP",name:"Japão",flag:"🇯🇵"},
    {code:"CN",name:"China",flag:"🇨🇳"},
    {code:"US",name:"Estados Unidos",flag:"🇺🇸"},
    {code:"AR",name:"Argentina",flag:"🇦🇷"},
    {code:"UK",name:"UK",flag:"🇬🇧"},
    {code:"BE",name:"Bélgica",flag:"🇧🇪"},
    {code:"IT",name:"Itália",flag:"🇮🇹"},
    {code:"FR",name:"França",flag:"🇫🇷"},
    {code:"DE",name:"Alemanha",flag:"🇩🇪"}
  ];
  const NEWS = /news|not[ií]cias|noticiero|informaci[oó]n|actualidad|jornalismo|journalism|nachrichten|nieuws|actualit[eé]s|tg\d|informazione|報道|ニュース|新闻/i;
  const SPORTS = /sports?|esport|deport|futebol|football|soccer|calcio|sportivo|スポーツ|体育/i;
  // A playlist is a directory, not a right to view premium programming.
  const PREMIUM = /\b(espn|premiere|combate|sky\s*sports?|bein\s*sports?|tnt\s*sports?|sport\s*tv|dazn|canal\+|fox\s*sports?|ppv|pay.per.view)\b/i;
  const store = "drivmatch-stream-favorites-v1";
  const state = {
    country:"ALL", category:"live", favoritesOnly:false, search:"",
    channels:[], selected:null, favorites:[], hls:null, authorised:false,
    health:new Map(), limit:80, attempt:0, sourceIndex:0, timer:null,
    playRequested:false, awaitingTap:false, failedAttempt:false, sourcesFailed:0
  };
  const video = $("video");
  let hlsPromise = null;
  const normal = str => str.toLocaleLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();

  function showError(message){
    $("player-error").textContent=message;
    $("player-error").hidden=false;
  }
  function clearError(){$("player-error").hidden=true;}
  function stopPlayer(){
    state.attempt++;
    clearTimeout(state.timer);
    state.timer=null;
    state.playRequested=false;
    state.awaitingTap=false;
    state.failedAttempt=false;
    try{video.pause();}catch{}
    if(state.hls){state.hls.destroy();state.hls=null;}
    video.removeAttribute("src");
    try{video.load();}catch{}
    video.hidden=true;
    $("full-screen").disabled=true;
  }
  function setGate(message){
    state.authorised=false;
    stopPlayer();
    $("gate").hidden=false;
    $("tv").hidden=true;
    $("gate-message").textContent=message;
  }
  async function verifyOwner(){
    try{
      const res=await fetch("./session",{
        credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json"}
      });
      if(!res.ok || (await res.json()).allowed!==true)throw Error("unauthorized");
      state.authorised=true;
      $("gate").hidden=true;
      $("tv").hidden=false;
      return true;
    }catch{
      setGate("Acesso pessoal indisponível. Entre novamente com sua senha particular.");
      return false;
    }
  }
  function parsePlaylist(content,code){
    const result=[];
    let ext="";
    for(const raw of content.split(/\r?\n/)){
      const line=raw.trim();
      if(line.startsWith("#EXTINF:")){ext=line;continue;}
      if(!ext || !line || line.startsWith("#"))continue;
      const name=ext.slice(ext.lastIndexOf(",")+1).trim();
      const group=/group-title="([^"]*)"/i.exec(ext)?.[1] || "";
      ext="";
      if(!name || /\[(geo.blocked|blocked)\]/i.test(name) || PREMIUM.test(name))continue;
      try{
        const url=new URL(line);
        if(url.protocol!=="https:" || url.username || url.password ||
          !/\.m3u8(?:[?#]|$)/i.test(url.href))continue;
        const genre=SPORTS.test(name+" "+group)?"sports":
          NEWS.test(name+" "+group)?"news":"general";
        const cleanName=name.replace(/\s*\((?:\d{3,4}p|[248]k)\)\s*$/i,"").trim();
        result.push({
          id:code+":"+genre+":"+normal(cleanName),code,name,genre,
          sources:[url.href]
        });
      }catch{/* Ignore invalid URLs supplied by the public directory. */}
    }
    return result;
  }
  async function loadChannels(){
    if(!state.authorised)return;
    $("catalog-status").textContent="Carregando listas de 12 países…";
    const options=countries.filter(c=>c.code!=="ALL");
    const results=await Promise.allSettled(options.map(async c=>{
      const source="https://iptv-org.github.io/iptv/countries/"+c.code.toLowerCase()+".m3u";
      const res=await fetch(source,{cache:"no-store"});
      if(!res.ok)throw Error("unavailable");
      return parsePlaylist(await res.text(),c.code);
    }));
    if(!state.authorised)return;
    const unique=new Map();
    for(const r of results){
      if(r.status!=="fulfilled")continue;
      for(const c of r.value){
        const existing=unique.get(c.id);
        if(existing){
          if(existing.sources.length<4 && !existing.sources.includes(c.sources[0]))
            existing.sources.push(c.sources[0]);
        }else unique.set(c.id,c);
      }
    }
    state.channels=[...unique.values()];
    state.sourcesFailed=results.filter(r=>r.status==="rejected").length;
    const counts=new Map();
    for(const c of state.channels)counts.set(c.code,(counts.get(c.code)||0)+1);
    for(const b of $("countries").querySelectorAll("button")){
      const code=b.dataset.country,c=countries.find(x=>x.code===code);
      const count=code==="ALL"?state.channels.length:counts.get(code)||0;
      b.textContent=c.flag+" "+c.name+" ("+count+")";
    }
    $("catalog-status").textContent=state.channels.length+" canais catalogados (não verificados)"
      +(state.sourcesFailed?" • "+state.sourcesFailed+" países com fonte indisponível":"")
      +" • Disponibilidade depende do dispositivo, da região e dos direitos";
    state.limit=80;
    render();
  }
  function favoriteKey(c){return c.code+":"+normal(c.name.replace(/\s*\(\d{3,4}p\)$/,""));}
  function readFavorites(){
    try{
      const v=JSON.parse(localStorage.getItem(store)||"[]");
      return Array.isArray(v)?v.filter(x=>typeof x==="string"):[];
    }catch{return [];}
  }
  function saveFavorites(){
    try{localStorage.setItem(store,JSON.stringify(state.favorites));}catch{}
  }
  function channelStatus(c){
    const s=state.health.get(c.id);
    return s==="ok"?"Reprodução confirmada nesta sessão":
      s==="failed"?"Falhou neste dispositivo":"Não testado";
  }
  function matchesFilter(c){
    return (state.country==="ALL"||c.code===state.country) &&
      (state.category==="live" ||
       state.category==="sports"&&c.genre==="sports" ||
       state.category==="news"&&c.genre==="news") &&
      (!state.favoritesOnly||state.favorites.includes(favoriteKey(c))) &&
      normal(c.name).includes(normal(state.search));
  }
  function render(){
    const matches=state.category==="ppv"?[]:state.channels.filter(matchesFilter);
    const order={ok:0,unknown:1,failed:2};
    matches.sort((a,b)=>{
      const aStatus=state.health.get(a.id)||"unknown";
      const bStatus=state.health.get(b.id)||"unknown";
      return order[aStatus]-order[bStatus] ||
        a.name.localeCompare(b.name,"pt-BR");
    });
    const area=$("channels");
    area.replaceChildren();
    const fragment=document.createDocumentFragment();
    for(const c of matches.slice(0,state.limit)){
      const row=document.createElement("div");
      row.className="channel"+(state.selected?.id===c.id?" active":"");
      const pick=document.createElement("button");
      pick.type="button";pick.className="pick";
      const title=document.createElement("strong");
      title.textContent=c.name;
      const meta=document.createElement("small");
      const country=countries.find(x=>x.code===c.code);
      const label=c.genre==="sports"?"Esportes":c.genre==="news"?"Notícias":"Ao vivo";
      meta.textContent=country.flag+" "+country.name+" • "+label+" • "+channelStatus(c);
      if(state.health.get(c.id)==="ok")meta.className="signal-ok";
      if(state.health.get(c.id)==="failed")meta.className="signal-bad";
      pick.append(title,meta);
      pick.addEventListener("click",()=>void selectChannel(c));
      const fav=document.createElement("button");
      const marked=state.favorites.includes(favoriteKey(c));
      fav.type="button";fav.className="fav"+(marked?" marked":"");
      fav.textContent=marked?"★":"☆";
      fav.title=(marked?"Remover favorito: ":"Favoritar: ")+c.name;
      fav.setAttribute("aria-label",fav.title);
      fav.addEventListener("click",()=>{
        const key=favoriteKey(c);
        state.favorites=marked?state.favorites.filter(x=>x!==key):[...state.favorites,key];
        saveFavorites();render();
      });
      row.append(pick,fav);fragment.appendChild(row);
    }
    area.appendChild(fragment);
    $("result-count").textContent=state.category==="ppv"?"Eventos pay-per-view: 0":
      matches.length+" canais neste filtro";
    $("more-channels").hidden=matches.length<=state.limit;
    $("more-channels").textContent="Mostrar mais canais ("+
      Math.min(80,Math.max(0,matches.length-state.limit))+")";
    $("ppv-notice").hidden=state.category!=="ppv";
    if(!matches.length && state.category!=="ppv"){
      const empty=document.createElement("p");
      empty.className="status";
      empty.textContent="Nenhum canal encontrado neste filtro.";
      area.appendChild(empty);
    }
  }
  function ensureHls(){
    if(window.Hls)return Promise.resolve(window.Hls);
    if(!hlsPromise){
      hlsPromise=new Promise((resolve,reject)=>{
        const script=document.createElement("script");
        script.src="https://cdn.jsdelivr.net/npm/hls.js@1.6.15/dist/hls.min.js";
        script.crossOrigin="anonymous";
        script.async=true;
        script.onload=()=>window.Hls?resolve(window.Hls):reject(Error("HLS missing"));
        script.onerror=()=>reject(Error("HLS network"));
        document.head.appendChild(script);
      }).catch(e=>{hlsPromise=null;throw e;});
    }
    return hlsPromise;
  }
  function current(c,token){
    return state.authorised && state.selected===c && state.attempt===token;
  }
  function tryToPlay(c,token){
    if(!current(c,token) || state.playRequested || state.awaitingTap)return;
    state.playRequested=true;
    try{
      const p=video.play();
      if(p && typeof p.catch==="function")p.catch(()=>{
        if(!current(c,token))return;
        state.awaitingTap=true;
        clearTimeout(state.timer);
        state.timer=null;
        showError("Toque em Play no vídeo para iniciar. Se não funcionar, o sinal pode estar bloqueado.");
      });
    }catch{
      state.awaitingTap=true;
      clearTimeout(state.timer);
      state.timer=null;
      showError("Toque em Play no vídeo para iniciar a transmissão.");
    }
  }
  function failAttempt(c,sourceIndex,token){
    if(!current(c,token) || state.failedAttempt)return;
    state.failedAttempt=true;
    clearTimeout(state.timer);
    state.timer=null;
    if(sourceIndex+1<c.sources.length){
      showError("Sinal indisponível. Tentando outra fonte deste canal…");
      void startSource(c,sourceIndex+1);
      return;
    }
    state.health.set(c.id,"failed");
    showError("Este canal não reproduziu neste dispositivo. Pode estar fora do ar, com bloqueio regional, CORS ou direitos restritos. Escolha outro.");
    render();
  }
  async function startSource(c,sourceIndex){
    stopPlayer();
    state.selected=c;
    state.sourceIndex=sourceIndex;
    const token=state.attempt;
    const source=c.sources[sourceIndex];
    video.hidden=false;
    $("full-screen").disabled=false;
    $("screen-message").hidden=true;
    clearError();
    render();
    state.timer=setTimeout(()=>failAttempt(c,sourceIndex,token),20000);
    try{
      if(video.canPlayType("application/vnd.apple.mpegurl") ||
         video.canPlayType("application/x-mpegURL")){
        video.src=source;
        video.load();
      }else{
        const Hls=await ensureHls();
        if(!current(c,token))return;
        if(Hls.isSupported()){
          const player=new Hls();
          state.hls=player;
          player.on(Hls.Events.MEDIA_ATTACHED,()=>{
            if(current(c,token))player.loadSource(source);
          });
          player.on(Hls.Events.MANIFEST_PARSED,()=>{
            if(current(c,token))tryToPlay(c,token);
          });
          player.on(Hls.Events.ERROR,(_event,detail)=>{
            if(detail.fatal)failAttempt(c,sourceIndex,token);
          });
          player.attachMedia(video);
        }else{
          // Certain mobile browsers play HLS natively without advertising support.
          video.src=source;
          video.load();
        }
      }
    }catch{failAttempt(c,sourceIndex,token);}
  }
  async function selectChannel(c){
    if(!state.authorised)return;
    state.health.delete(c.id); // Re-test on explicit selection.
    $("current-channel").textContent=c.name;
    $("current-country").textContent=(countries.find(x=>x.code===c.code)?.name||"")+
      " • Verificando reprodução…";
    await startSource(c,0);
  }
  function setupFilters(){
    for(const c of countries){
      const b=document.createElement("button");
      b.type="button";
      b.dataset.country=c.code;
      b.textContent=c.flag+" "+c.name;
      if(c.code==="ALL")b.className="chosen";
      b.addEventListener("click",()=>{
        state.country=c.code;state.limit=80;
        for(const el of $("countries").querySelectorAll("button"))
          el.classList.toggle("chosen",el===b);
        render();
      });
      $("countries").appendChild(b);
    }
    $("categories").querySelectorAll("[data-category]").forEach(b=>
      b.addEventListener("click",()=>{
        state.category=b.dataset.category;
        state.limit=80;
        $("categories").querySelectorAll("[data-category]").forEach(el=>
          el.classList.toggle("chosen",el===b));
        render();
      })
    );
    $("favorites-only").addEventListener("click",e=>{
      state.favoritesOnly=!state.favoritesOnly;
      e.currentTarget.classList.toggle("chosen",state.favoritesOnly);
      state.limit=80;render();
    });
    $("search").addEventListener("input",e=>{
      state.search=e.target.value;
      state.limit=80;render();
    });
    $("more-channels").addEventListener("click",()=>{
      state.limit+=80;render();
    });
    $("refresh-channels").addEventListener("click",()=>void loadChannels());
    $("full-screen").addEventListener("click",()=>{
      const p=$("screen").requestFullscreen?.();
      p?.catch(()=>{});
    });
    video.addEventListener("canplay",()=>{
      if(state.selected)tryToPlay(state.selected,state.attempt);
    });
    video.addEventListener("playing",()=>{
      const c=state.selected;
      if(!c || !state.authorised)return;
      clearTimeout(state.timer);state.timer=null;
      state.health.set(c.id,"ok");
      $("current-country").textContent=(countries.find(x=>x.code===c.code)?.name||"")+
        " • Reprodução confirmada nesta sessão";
      clearError();render();
    });
    video.addEventListener("error",()=>{
      if(state.selected)failAttempt(state.selected,state.sourceIndex,state.attempt);
    });
  }
  async function init(){
    setupFilters();
    if(!await verifyOwner())return;
    state.favorites=readFavorites();
    await loadChannels();
    setInterval(async()=>{if(state.authorised)await verifyOwner();},300000);
  }
  void init();
})();
