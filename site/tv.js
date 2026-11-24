/* Samsung TV guide: pure ES5 to work in older Tizen Web browsers. No private secrets or CORS bypass. */
(function(){
"use strict";
var D=function(id){return document.getElementById(id);};
/* Desktop uses the Samsung three-column guide but its own streaming engine.
 * Detect with ES5 syntax so Samsung's older Tizen runtime stays compatible. */
var agent=navigator.userAgent||"";
var samsungTV=/SMART-TV|SmartTV|Tizen|TV Safari|NetCast|Web0S|WebOS/i.test(agent);
var portable=/Android|iPhone|iPad|iPod|Mobi|Mobile/i.test(agent);
var mobileMode=portable&&!samsungTV;
var desktopMode=!samsungTV; // Browsers, including Android, need HLS.js; Samsung remains native.
if(samsungTV)document.documentElement.className+=" dm-tizen";
if(mobileMode)document.documentElement.className+=" dm-mobile-guide";
else if(desktopMode)document.documentElement.className+=" dm-desktop-compact";
var desktopHls=null,desktopHlsLoading=false,desktopHlsWaiters=[];
var desktopSourceGeneration=0,desktopFailureReason="";
var COUNTRY=[["ALL","Todos os países"],["BR","Brasil"],["US","Estados Unidos"],["PT","Portugal"],
 ["ES","Espanha"],["AR","Argentina"],["JP","Japão"],["CN","China"],["UK","Reino Unido"],
 ["BE","Bélgica"],["IT","Itália"],["FR","França"],["DE","Alemanha"],["OTHER","Outros / não identificados"]];
var SOURCES=[],source="lista-2",country="ALL",category="all",search="",channels=[],visible=[],selected=null;
var openCountries={},openGenres={},treeLimits={},treeErrors={};
var officialFree=[],officialPaid=[];
var globalSearchMode=false,globalResults=[],globalStatus="",globalSearchTimer=null,globalSearchSeq=0;
var favorites=[],recent=[],favoriteMeta={},limit=60,serial=0,session=false,
 cache={},MAX_CHANNELS=15000,video=D("video");
var streamUserId=null,streamUserRole=null;
var favoritesReady=false,favoriteRead=0,favoriteWrites=0,pendingFavorites=Object.create(null);
var STORE="drivmatch-tv-guide-favorites-v1";
var HISTORY_STORE="drivmatch-tv-recent-25-v1",FAV_META_STORE="drivmatch-tv-favorite-meta-v1";
var HIDDEN_STORE="drivmatch-tv-hidden-failed-60s-v1",HIDDEN_TTL=24*60*60*1000;
var hiddenFailed={},playbackToken=0,playbackTimers=[],playbackConfirmed=false,autoplayBlocked=false;
var officialFrame=D("official-embed");
var NEWS=/news|not[ií]cias|jornal|noticiero|journal|nieuws|nachrichten|actualidad|actualit[eé]s|新闻|ニュース|報道/i;
var SPORTS=/sports?|esport|deport|futebol|football|soccer|calcio|体育|スポーツ/i;
var PREMIUM=/\b(espn|premiere|combate|sky\s*sports?|bein\s*sports?|tnt\s*sports?|(?:spor\s*tv|sport\s*tv)|dazn|canal\+|fox\s*sports?|ppv|pay.per.view)\b/i;

var TREE_GENRES=[
 ["sports","Esportes"],["news","Notícias"],
 ["movies_pt","Filmes em português"],["movies_otherlanguage","Filmes em outros idiomas"],
 ["movies_unknown","Filmes — idioma não informado"],
 ["kids","Infantil"],["music","Música e entretenimento"],
 ["religion","Religião"],["education","Educação"],["other","Outros / sem categoria"]
];
var MOVIES=/movies?|film|filmes?|cinema|telecine|s[eé]ries|series|pel[ií]culas/i;
var KIDS=/kids?|children|infantil|crian[cç]as|cartoon|desenhos?|junior/i;
var MUSIC=/music|m[uú]sica|show|entreten|variedades|entertainment/i;
var RELIGION=/relig|gospel|crist[aã]|igreja|evangel|cat[oó]lic|faith/i;
var EDUCATION=/educa|educat|learning|ensino|cultur|documentar/i;
function channelGenre(name,group,origin){
 var text=name+" "+group;
 if(origin==="lista-4"||SPORTS.test(text)||/\b(espn|premiere|combate|dazn|sportv|spor\s*tv)\b/i.test(name))return "sports";
 if(origin==="lista-3"||NEWS.test(text))return "news";
 if(MOVIES.test(text))return "movies";
 if(KIDS.test(text))return "kids";
 if(RELIGION.test(text))return "religion";
 if(EDUCATION.test(text))return "education";
 if(MUSIC.test(text))return "music";
 return "other";
}
function genreFits(c,id){
 if(id==="movies_pt")return c.genre==="movies"&&c.lang==="pt";
 if(id==="movies_otherlanguage")return c.genre==="movies"&&c.lang&&c.lang!=="pt";
 if(id==="movies_unknown")return c.genre==="movies"&&!c.lang;
 return c.genre===id;
}
function classificationName(c){
  return c.code==="OTHER"?"Outros":countryName(c.code);
}
function genreName(id){
 for(var i=0;i<TREE_GENRES.length;i++)if(TREE_GENRES[i][0]===id)return TREE_GENRES[i][1];
 return "Todos os canais";
}
function T(el,s){if(el)el.textContent=s;}
function E(tag,cl,s){var x=document.createElement(tag);if(cl)x.className=cl;if(typeof s==="string")T(x,s);return x;}
function clear(el){while(el.firstChild)el.removeChild(el.firstChild);}
function visibleEl(el,on){el.style.display=on?"":"none";el.hidden=!on;}
function on(el,k,fn){if(el&&el.addEventListener)el.addEventListener(k,fn,false);}
function http(path,cb,expectedUser){var x=new XMLHttpRequest(),done=false;x.onreadystatechange=function(){if(x.readyState===4&&!done){done=true;
cb(x.status,x.responseText||"");}};
x.onerror=function(){if(!done){done=true;cb(0,"");}};
try{
 x.open("GET",path,true);
 if(expectedUser)x.setRequestHeader("X-Stream-Account",expectedUser);
 x.send();
}catch(e){cb(0,"");}}
function postJson(path,data,cb){
 var x=new XMLHttpRequest(),done=false;x.onreadystatechange=function(){if(x.readyState===4&&!done){done=true;cb(x.status);}};
 x.onerror=function(){if(!done){done=true;cb(0);}};
 try{
  x.open("POST",path,true);
  x.setRequestHeader("Content-Type","application/json");
  if(streamUserId)x.setRequestHeader("X-Stream-Account",streamUserId);
  x.send(JSON.stringify(data));
 }catch(e){cb(0);}
}
function trim(s){return String(s||"").replace(/^\s+|\s+$/g,"");}
function lower(s){return trim(s).toLowerCase();}
function has(arr,k){return arr.indexOf(k)>=0;}
function favoriteNameCanonical(name){
  var n=lower(name).replace(/\s*\(\d{3,4}p\)\s*$/i,"");
  if(typeof n.normalize==="function")n=n.normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  return n.replace(/\s+/g," ");
}
function canonicalFavoriteKeyFromLegacy(k){
  var parts=String(k||"").split(":");
  var code="",name="";
  if(parts.length>=3 && /^(lista-\d+|paid)$/i.test(parts[0])){
    code=parts[1];name=parts.slice(2).join(":");
  }else if(parts.length>=2){
    code=parts[0];name=parts.slice(1).join(":");
  }else return "";
  if(!/^[A-Za-z]{2,8}$/.test(code) || !name)return "";
  return code.toUpperCase()+":"+favoriteNameCanonical(name);
}
function favorKey(c){
  if(streamUserId) return String(c.code||"OTHER")+":"+favoriteNameCanonical(c.originalName||c.name);
  return (c.source||(String(c.id||"").indexOf("paid:")===0?"paid":"lista-2"))+
    ":"+c.code+":"+lower(c.originalName||c.name);
}
/* Alias only for Lista 02 Brazil; playback URL and original metadata stay unchanged. */
function channelAlias(name,code){
  if(source==="lista-2"&&code==="BR"&&/^TV Guar[aá](?:\s*\([^)]*\))?$/i.test(name))
    return "Record News";
  return name;
}

/* Only a chosen native stream is tested. An unplayed stream is hidden locally
 * after sixty seconds, for up to 24h. Favorites and playlists stay intact.
 * Official-site/paid entries never get treated as failed video streams. */
function hiddenKey(c){return favorKey(c);}
function isHidden(c){
 var key=hiddenKey(c),t=hiddenFailed[key];
 if(!t)return false;
 if(new Date().getTime()-t>=HIDDEN_TTL){
  delete hiddenFailed[key];saveHidden();updateHiddenRestore();return false;
 }
 return true;
}
function countHidden(){var n=0;for(var k in hiddenFailed)
 if(Object.prototype.hasOwnProperty.call(hiddenFailed,k))n++;return n;}
function saveHidden(){if(streamUserId)return;try{localStorage.setItem(HIDDEN_STORE,JSON.stringify(hiddenFailed));}catch(e){}}
function updateHiddenRestore(){
 var n=countHidden(),btn=D("restore-hidden");
 if(!btn)return;
 visibleEl(btn,n>0);
 T(btn,"↺ Restaurar canais ocultos ("+n+")");
}
function loadHidden(){
 var now=new Date().getTime(),obj;
 try{obj=JSON.parse(localStorage.getItem(HIDDEN_STORE)||"{}");}catch(e){obj={};}
 hiddenFailed={};
 if(obj&&typeof obj==="object"&&
    Object.prototype.toString.call(obj)!=="[object Array]"){
   var count=0;
   for(var k in obj)if(Object.prototype.hasOwnProperty.call(obj,k)){
     var t=Number(obj[k]);
     if(k.length<260&&t>0&&t<=now&&now-t<HIDDEN_TTL&&count<500){
       hiddenFailed[k]=t;count++;
     }
   }
 }
 saveHidden();updateHiddenRestore();
}
function hideFailed(c){
 if(!c||c.premium||c.officialUrl&&(!c.urls||!c.urls.length))return;
 hiddenFailed[hiddenKey(c)]=new Date().getTime();
 saveHidden();updateHiddenRestore();
 T(D("play-status"),"Ocultado após 60 s");
 T(D("player-error"),"Este canal não iniciou a reprodução em 60 segundos. "+
   "Foi ocultado apenas nesta TV por 24 horas. Você pode restaurá-lo pelo botão no guia. "+
   "A lista original e os favoritos foram preservados.");
 visibleEl(D("player-error"),true);
 try{video.pause();video.removeAttribute("src");video.load();}catch(e){}
 visibleEl(video,false);visibleEl(D("player-empty"),true);
 D("player-fullscreen").disabled=true;
 renderChannels();drawCountries();drawQuickLists();
}
function restoreHidden(){
 hiddenFailed={};saveHidden();updateHiddenRestore();
 renderChannels();drawCountries();drawQuickLists();
 T(D("catalog-status"),"Canais ocultos restaurados. Você pode tentar reproduzi-los novamente.");
}
function destroyDesktopHls(){
 if(desktopHls){try{desktopHls.destroy();}catch(e){}desktopHls=null;}
}
function loadDesktopHls(callback){
 if(window.Hls){callback(null,window.Hls);return;}
 desktopHlsWaiters.push(callback);
 if(desktopHlsLoading)return;
 desktopHlsLoading=true;
 var script=document.createElement("script");
 script.src="https://cdn.jsdelivr.net/npm/hls.js@1.6.15/dist/hls.min.js";
 script.async=true;script.crossOrigin="anonymous";
 function finish(err){
  desktopHlsLoading=false;
  var waiting=desktopHlsWaiters.slice(0);desktopHlsWaiters=[];
  if(err&&script.parentNode)script.parentNode.removeChild(script);
  for(var i=0;i<waiting.length;i++)waiting[i](err,window.Hls);
 }
 script.onload=function(){finish(window.Hls?null:Error("HLS_NOT_READY"));};
 script.onerror=function(){finish(Error("HLS_LIBRARY_UNAVAILABLE"));};
 document.getElementsByTagName("head")[0].appendChild(script);
}
function isCurrentDesktop(c,token,generation){
 return desktopMode&&selected&&selected.id===c.id&&
  token===playbackToken&&generation===desktopSourceGeneration&&
  !playbackConfirmed&&!autoplayBlocked;
}
function desktopError(message){
 desktopFailureReason=message;
 T(D("play-status"),"Não foi possível reproduzir");
 T(D("player-error"),message);visibleEl(D("player-error"),true);
}
function startDesktopHls(c,url,token,generation,playNative){
 loadDesktopHls(function(err,Hls){
  if(!isCurrentDesktop(c,token,generation))return;
  if(err||!Hls){
   desktopError("O componente HLS do desktop não carregou. Confira a conexão "+
    "ou o bloqueio de scripts externos e tente Recarregar. O sinal não foi testado.");
   return;
  }
  if(!Hls.isSupported()){
   if(video.canPlayType("application/vnd.apple.mpegurl")||
      video.canPlayType("application/x-mpegURL")){
     video.src=url;video.load();playNative();return;
   }
   desktopError("Este navegador não oferece suporte HLS/Media Source necessário "+
    "para este sinal. Experimente Chrome, Edge ou Safari atualizado.");
   return;
  }
  try{
   var player=new Hls();desktopHls=player;
   player.on(Hls.Events.MEDIA_ATTACHED,function(){
    if(isCurrentDesktop(c,token,generation))player.loadSource(url);
   });
   player.on(Hls.Events.MANIFEST_PARSED,function(){
    if(isCurrentDesktop(c,token,generation))playNative();
   });
   player.on(Hls.Events.ERROR,function(event,data){
    if(!isCurrentDesktop(c,token,generation)||!data||!data.fatal)return;
    var detail=String(data.details||"");
    var kind=String(data.type||"");
    var msg=/manifestParsing|manifestIncompatible/i.test(detail)?
      "A fonte retornou um manifesto HLS inválido ou incompatível.":
      /network/i.test(kind)||/loadError|timeout/i.test(detail)?
      "O navegador não conseguiu acessar o sinal. A origem pode estar indisponível, "+
      "bloqueada por CORS ou região, ou exigir autorização.":
      "O navegador não conseguiu decodificar o sinal. Formato ou codec pode ser incompatível.";
    desktopError(msg+" O Stream verificará alternativas, quando disponíveis.");
   });
   player.attachMedia(video);
   T(D("play-status"),"Carregando HLS…");
  }catch(e){
   destroyDesktopHls();
   desktopError("Não foi possível iniciar o player HLS neste navegador.");
  }
 });
}
function clearPlaybackWatch(){
 if(desktopMode){desktopSourceGeneration++;destroyDesktopHls();desktopFailureReason="";}
 for(var i=0;i<playbackTimers.length;i++)clearTimeout(playbackTimers[i]);
 playbackTimers=[];playbackToken++;playbackConfirmed=false;autoplayBlocked=false;
}
function completePlayback(){
 if(!selected||playbackConfirmed||selected.premium)return;
 playbackConfirmed=true;
 for(var i=0;i<playbackTimers.length;i++)clearTimeout(playbackTimers[i]);
 playbackTimers=[];
 if(isHidden(selected)){
   delete hiddenFailed[hiddenKey(selected)];
   saveHidden();updateHiddenRestore();
   renderChannels();drawCountries();drawQuickLists();
 }
}
function startPlaybackWatch(c){
 var token=playbackToken,urls=c.urls||[],n=Math.min(3,urls.length);
 if(!n)return;
 function tryUrl(idx){
  if(token!==playbackToken||playbackConfirmed||autoplayBlocked||
     !selected||selected.id!==c.id)return;
  T(D("play-status"),idx?"Tentando sinal alternativo…":"Conectando…");
  var generation=++desktopSourceGeneration;
  function playVideo(){
   if(desktopMode&&!isCurrentDesktop(c,token,generation))return;
   try{
    var task=video.play();
    if(task&&typeof task.catch==="function")task.catch(function(err){
     if(token!==playbackToken||playbackConfirmed||
        (desktopMode&&generation!==desktopSourceGeneration))return;
     var name=String(err&&err.name||""),msg=String(err&&err.message||"");
     if(name==="NotAllowedError"||/autoplay|user gesture|not allowed/i.test(msg)){
       autoplayBlocked=true;
       for(var i=0;i<playbackTimers.length;i++)clearTimeout(playbackTimers[i]);
       playbackTimers=[];
       T(D("play-status"),"Pressione Play");
       T(D("player-error"),"O navegador bloqueou a reprodução automática. "+
         "Pressione Play no vídeo; este canal não será ocultado por esse bloqueio.");
       visibleEl(D("player-error"),true);
     }else if(desktopMode){
       desktopError("A reprodução não iniciou neste navegador. "+
        "Pode haver bloqueio de fonte, formato ou codec incompatível.");
     }else{
       T(D("player-error"),"Aguardando o sinal (até 60 segundos)…");
       visibleEl(D("player-error"),true);
     }
    });
   }catch(e){
    if(desktopMode)desktopError("Erro ao iniciar a reprodução neste navegador.");
    else{
     T(D("player-error"),"Sinal ainda não disponível; verificando alternativas até 60 segundos.");
     visibleEl(D("player-error"),true);
    }
   }
  }
  try{
   video.pause();
   if(desktopMode)destroyDesktopHls();
   video.removeAttribute("src");video.load();
   if(desktopMode&&/\.m3u8(?:[?#]|$)/i.test(urls[idx])&&
     !(mobileMode&&(video.canPlayType("application/vnd.apple.mpegurl")||
                     video.canPlayType("application/x-mpegURL")))){
     startDesktopHls(c,urls[idx],token,generation,playVideo);
   }else{
     video.src=urls[idx];video.load();playVideo();
   }
  }catch(e){
   if(desktopMode)desktopError("Não foi possível preparar o sinal neste navegador.");
   else{
    T(D("player-error"),"Sinal ainda não disponível; verificando alternativas até 60 segundos.");
    visibleEl(D("player-error"),true);
   }
  }
 }
 // Try up to 3 alternatives within one 60-second startup budget.
 tryUrl(0);
 if(n>=2)playbackTimers.push(setTimeout(function(){tryUrl(1);},20000));
 if(n>=3)playbackTimers.push(setTimeout(function(){tryUrl(2);},40000));
 playbackTimers.push(setTimeout(function(){
  if(token!==playbackToken||playbackConfirmed||autoplayBlocked||
     !selected||selected.id!==c.id)return;
  if(desktopMode){
   T(D("play-status"),mobileMode?"Sem reprodução neste celular":"Sem reprodução neste desktop");
   T(D("player-error"),desktopFailureReason||
     "Não houve reprodução após 60 segundos. Pode haver bloqueio CORS, região, "+
     "codec incompatível ou indisponibilidade na origem. Nenhum canal foi ocultado.");
   visibleEl(D("player-error"),true);
   return;
  }
  hideFailed(c);
 },60000));
}

function saveFav(){if(streamUserId)return;try{localStorage.setItem(STORE,JSON.stringify(favorites));}catch(e){}}
function loadFav(){if(streamUserId)return;try{var a=JSON.parse(localStorage.getItem(STORE)||"[]");if(Object.prototype.toString.call(a)==="[object Array]")favorites=a;}catch(e){}}
function fetchUserFavorites(){
 if(!session||!streamUserId||favoriteWrites)return;
 var read=++favoriteRead;
 http("/stream/favorites",function(st,raw){
  if(!session||read!==favoriteRead)return;
  if(st===409){window.location.replace("/stream/");return;}
  if(st!==200){T(D("catalog-status"),"Favoritos indisponíveis. Não serão substituídos.");return;}
  try{var data=JSON.parse(raw);if(Object.prototype.toString.call(data.favorites)!=="[object Array]")throw Error("format");
    favorites=data.favorites;favoritesReady=true;drawQuickLists();renderChannels();updateFavButton();
  }catch(e){T(D("catalog-status"),"Erro ao carregar Favoritos.");}
 },streamUserId);
}
function legacyFavoriteKeys(stores){
 var canonical=[];
 for(var i=0;i<stores.length;i++){
  try{
   var list=JSON.parse(localStorage.getItem(stores[i])||"[]");
   if(!Array.isArray(list))continue;
   for(var j=0;j<list.length;j++){
    var key=canonicalFavoriteKeyFromLegacy(list[j]);
    if(key&&canonical.indexOf(key)<0)canonical.push(key);
   }
  }catch(e){}
 }
 return canonical;
}
function migrateAdminFavorites(){
 if(streamUserRole!=="admin"){fetchUserFavorites();return;}
 var imported=STORE+":imported:"+streamUserId;
 try{if(localStorage.getItem(imported)==="yes"){fetchUserFavorites();return;}}catch(e){}
 var canonical=legacyFavoriteKeys([STORE]);
 if(!canonical.length){fetchUserFavorites();return;}
 postJson("/stream/favorites",{operation:"import",keys:canonical},function(st){
  if(st===409){window.location.replace("/stream/");return;}
  if(st===200){
   try{localStorage.setItem(imported,"yes");}catch(e){}
  }else T(D("catalog-status"),"Migração dos Favoritos pendente. Seus dados antigos foram preservados.");
  fetchUserFavorites();
 });
}
function offerBrowserFavoriteImport(){
 fetchUserFavorites();
 var button=D("import-browser-favorites");
 var imported=STORE+":imported:"+streamUserId;
 try{if(localStorage.getItem(imported)==="yes")return;}catch(e){}
 var canonical=legacyFavoriteKeys([STORE,"drivmatch-stream-favorites-v1"]);
 if(!button||!canonical.length)return;
 visibleEl(button,true);
 on(button,"click",function(){
  if(!session||!window.confirm("Importar os favoritos deste navegador para a conta conectada?"))return;
  button.disabled=true;
  function importBatch(offset){
   postJson("/stream/favorites",{operation:"import",keys:canonical.slice(offset,offset+20)},function(status){
    if(status===409){window.location.replace("/stream/");return;}
    if(status!==200){
     button.disabled=false;
     T(D("catalog-status"),"Importação pendente. Você pode tentar novamente.");
     return;
    }
    if(offset+20<canonical.length){importBatch(offset+20);return;}
    try{localStorage.setItem(imported,"yes");}catch(e){}
    visibleEl(button,false);
    fetchUserFavorites();
   });
  }
  importBatch(0);
 });
}

/* Only minimal channel identity is persisted locally; never keep stream URLs
 * or authentication tokens. Saved favorites use the preexisting key format. */
function safeSnapshot(c){
 return {key:favorKey(c),name:trim(c.name).slice(0,140),
  code:String(c.code||"OTHER").slice(0,8),genre:String(c.genre||"other").slice(0,32)};
}
function oldFavoriteSnapshot(key){
 var parts=String(key||"").split(":");
 if(streamUserId)return {key:key,name:parts.slice(1).join(":")||key,
   code:parts[0]||"OTHER",genre:"other"};
 return {key:key,name:parts.slice(2).join(":")||key,code:parts[1]||"OTHER",genre:"other"};
}
function loadQuickHistory(){
 try{
  var arr=streamUserId?[]:JSON.parse(localStorage.getItem(HISTORY_STORE)||"[]");
  if(Object.prototype.toString.call(arr)==="[object Array]"){
   recent=[];
   for(var i=0;i<arr.length&&recent.length<25;i++)
    if(arr[i]&&typeof arr[i].key==="string"&&typeof arr[i].name==="string"&&
      !hasRecent(arr[i].key))recent.push({
       key:arr[i].key,name:arr[i].name.slice(0,140),
       code:String(arr[i].code||"OTHER").slice(0,8),
       genre:String(arr[i].genre||"other").slice(0,32)
      });
  }
 }catch(e){}
 try{
  var data=streamUserId?{}:JSON.parse(localStorage.getItem(FAV_META_STORE)||"{}");
  if(data&&typeof data==="object"&&
     Object.prototype.toString.call(data)!=="[object Array]")
    favoriteMeta=data;
 }catch(e){}
}
function hasRecent(key){
 for(var i=0;i<recent.length;i++)if(recent[i].key===key)return true;
 return false;
}
function recordVisit(c){
 if(!c||!c.name||!c.code)return;
 var data=safeSnapshot(c),next=[data];
 for(var i=0;i<recent.length&&next.length<25;i++)
  if(recent[i].key!==data.key)next.push(recent[i]);
 recent=next;
 if(!streamUserId)try{localStorage.setItem(HISTORY_STORE,JSON.stringify(recent));}catch(e){}
 drawQuickLists();
}
function findKnown(key,code,name){
 if(selected&&favorKey(selected)===key)return selected;
 for(var x in cache)if(Object.prototype.hasOwnProperty.call(cache,x)){
  var items=cache[x];
  if(!items||!items.length)continue;
  for(var j=0;j<items.length;j++)if(favorKey(items[j])===key)
   return items[j];
 }
 // Previously saved favorites might have used a different source name.
 var list=cache["lista-2:"+code]||[],norm=lower(name);
 for(var k=0;k<list.length;k++)
  if(lower(list[k].originalName||list[k].name)===norm)return list[k];
 return null;
}
function drawQuickGroup(id,items,kind){
 var target=D(id);if(!target)return;clear(target);
 if(!items.length){
  target.appendChild(E("p","quick-empty",kind==="recent"?
   "Nenhum canal visitado ainda.":"Marque ☆ nos canais que quiser guardar."));
  return;
 }
 for(var i=0;i<items.length;i++){(function(item){
  if(!item||!item.key)return;
  var b=E("button","quick-entry-btn"+
    (selected&&favorKey(selected)===item.key?" active":""));
  b.type="button";b.setAttribute("data-quick-key",item.key);
  b.setAttribute("data-quick-kind",kind);
  b.appendChild(E("span","quick-entry-name",
    (kind==="favorite"?"★ ":"")+item.name));
  b.appendChild(E("span","quick-entry-meta",classificationName(item)+(hiddenFailed[item.key]?" · Oculto":"")));
  on(b,"click",function(){openQuickChannel(item,kind);});
  target.appendChild(b);
 }(items[i]));}
}
function drawQuickLists(){
 T(D("recent-count"),recent.length+"/25");
 drawQuickGroup("recent-items",recent,"recent");
 var list=[];
 for(var i=0;i<favorites.length;i++){
  var key=favorites[i],item=favoriteMeta[key];
  if(!item){
    var legacy=oldFavoriteSnapshot(key);
    var resolved=findKnown(key,legacy.code,legacy.name);
    item=resolved?safeSnapshot(resolved):legacy;
    // Keep the original stored key when falling back to a legacy source id.
    item.key=key;
  }
  list.push(item);
 }
 T(D("favorite-count"),String(list.length));
 drawQuickGroup("favorite-items",list,"favorite");
}
function focusQuickItem(key,kind){
 var buttons=D(kind==="favorite"?"favorite-items":"recent-items").getElementsByTagName("button");
 for(var i=0;i<buttons.length;i++)if(buttons[i].getAttribute("data-quick-key")===key){
  focusTV(buttons[i]);return;
 }
}
function playFromQuick(c,record,kind){
 cancelGlobalSearch();
 // Premium service entries are never turned into free HLS links.
 if(c.source!=="paid"&&c.id&&String(c.id).indexOf("paid:")!==0){
  country=c.code;category="all";openCountries[c.code]=true;closeAllGenres();
  search="";D("search").value="";limit=60;
  channels=cache["lista-2:"+c.code]||[];
  T(D("catalog-title"),countryName(c.code));T(D("catalog-subtitle"),"Todos os canais");
  renderChannels();drawCountries();
 }
 play(c);
 focusQuickItem(record.key,kind);
}
function openQuickChannel(record,kind){
 var c=findKnown(record.key,record.code,record.name);
 if(c){playFromQuick(c,record,kind);return;}
 // A saved platform remains a link to the official subscription, never a stream.
 for(var i=0;i<officialPaid.length;i++){
  var x=officialPaid[i];
  if(x.code===record.code&&lower(x.name)===lower(record.name)){
   playFromQuick({id:"paid:"+x.id,source:"paid",name:x.name,code:x.code,
      genre:x.genre||"other",group:x.notes||"",premium:true,urls:[],
      officialUrl:x.url,officialAccess:x.access},record,kind);
   return;
  }
 }
 var code=record.code;
 if(!/^[A-Z]{2}$/.test(code)&&code!=="OTHER"){
  T(D("catalog-status"),"Este favorito não tem país válido no catálogo atual.");return;
 }
 // Do not fabricate or persist a playback URL. Resolve through current catalog.
 T(D("catalog-status"),"Localizando "+record.name+" em "+countryName(code)+"…");
 http("/stream/catalog?list=lista-2&country="+encodeURIComponent(code),function(st,body){
  if(st!==200){
   T(D("catalog-status"),"Catálogo temporariamente indisponível para "+countryName(code));
   return;
  }
  cache["lista-2:"+code]=attachOfficial(code,parse(body,code));
  var found=findKnown(record.key,code,record.name);
  if(found)playFromQuick(found,record,kind);
  else T(D("catalog-status"),"Canal não encontrado nas fontes atuais. O favorito foi preservado.");
 });
}
function detectLanguage(info,group){
 var raw=lower(dataAttr(info,"tvg-language")||dataAttr(info,"language"));
 if(/^(pt|portuguese|portugu[eê]s)/i.test(raw))return "pt";
 if(/^(en|english|ingl[eê]s)/i.test(raw))return "en";
 if(/^(es|spanish|espa[nñ]ol)/i.test(raw))return "es";
 if(/^(fr|french)/i.test(raw))return "fr";
 if(/^(de|german)/i.test(raw))return "de";
 if(/^(it|italian)/i.test(raw))return "it";
 if(/\b(?:movies?|films?)\s*\((EN|PT|ES)\)/i.test(group))
  return /\(PT\)/i.test(group)?"pt":/\(ES\)/i.test(group)?"es":"en";
 return "";
}
function validOfficialUrl(url){return /^https:\/\/[^/@\s]+(?:\/|$)/i.test(String(url||""));}
/* Only publisher-backed providers with a validated channel ID may be framed.
 * Never embed arbitrary links, scrape streaming URLs or bypass restrictions. */
function officialEmbedUrl(c){
 if(!c||c.premium||c.urls&&c.urls.length||!c.embed)return "";
 var e=c.embed;
 if(e.provider==="youtube_live_channel"&&/^UC[A-Za-z0-9_-]{22}$/.test(e.channelId||""))
   return "https://www.youtube.com/embed/live_stream?channel="+e.channelId;
 if(e.provider==="twitch_channel"&&/^[A-Za-z0-9_]{3,25}$/.test(e.channel||"")){
   var host=window.location.hostname||"";
   if(!/^[A-Za-z0-9.-]{1,120}$/.test(host))return "";
   return "https://player.twitch.tv/?channel="+encodeURIComponent(e.channel)+
     "&parent="+encodeURIComponent(host)+"&autoplay=false";
 }
 return "";
}
function clearOfficialFrame(){
 if(!officialFrame)return;
 officialFrame.removeAttribute("src");
 visibleEl(officialFrame,false);
}
function attachOfficial(code,items){
 var out=items.slice(0);
 for(var i=0;i<officialFree.length;i++){
  var x=officialFree[i];if(x.code!==code||!validOfficialUrl(x.url))continue;
  var match=lower(x.matchName||x.name),existing=null;
  for(var j=0;j<out.length;j++){
   var clean=lower(out[j].originalName||out[j].name).replace(/\s*[ⓈⒼⓎ]|\s*\(\d+p\)/g,"");
   if(clean===match){existing=out[j];break;}
  }
  if(existing){
   if(!existing.officialUrl){existing.officialUrl=x.url;
     existing.officialAccess=x.access;existing.officialNotes=x.notes;}
   if(x.embed&&!existing.embed)existing.embed=x.embed;
   if(!existing.lang&&x.lang)existing.lang=x.lang;
  }else{
   out.push({id:"official:"+x.id,source:"official",name:x.name,code:code,
    genre:x.genre||"other",group:"Site/app oficial",origins:["Emissora"],
    premium:false,urls:[],lang:x.lang||"",officialUrl:x.url,
    officialAccess:x.access,officialNotes:x.notes,embed:x.embed||null});
  }
 }
 return out;
}
function loadOfficialDirectory(){
 http("/stream/official-access.json",function(st,body){
  if(st!==200)return;
  var data;try{data=JSON.parse(body);}catch(e){return;}
  if(!data||Object.prototype.toString.call(data.free)!=="[object Array]")return;
  officialFree=data.free;officialPaid=data.paid||[];
  for(var key in cache)if(Object.prototype.hasOwnProperty.call(cache,key)&&
    key.indexOf("lista-2:")===0){
    cache[key]=attachOfficial(key.substring(8),cache[key].filter(function(c){
      return c.source!=="official";
    }));
    if(cache[key].length)treeErrors[key.substring(8)]=false;
  }
  var id="lista-2:"+country;
  if(cache[id])channels=cache[id];
  renderChannels();drawCountries();drawPaidProviders();drawQuickLists();
 });
}
/* Providers are official external destinations, not playable channels.
 * Show the actual verified catalog URL as an accessible, visible link. */
function drawPaidProviders(){
 var area=D("provider-items");if(!area)return;clear(area);
 area.appendChild(E("p","provider-note",
   "Sites oficiais externos. Clique em Abrir site oficial. "+
   "Pode exigir assinatura; o vídeo não abre neste player."));
 for(var i=0;i<officialPaid.length;i++){(function(x){
   if(!validOfficialUrl(x.url))return;
   var link=E("a","provider-entry");
   link.href=x.url;
   link.rel="noopener noreferrer";
   if(desktopMode)link.target="_blank";
   link.setAttribute("aria-label",countryName(x.code)+" · "+x.name+
     " · Abrir site oficial (acesso pode exigir assinatura)");
   link.appendChild(E("span","provider-name",countryName(x.code)+" · "+x.name));
   link.appendChild(E("span","provider-open","↗ Abrir site oficial"));
   area.appendChild(link);
 }(officialPaid[i]));}
}
function sourceName(){for(var i=0;i<SOURCES.length;i++)if(SOURCES[i].id===source)return SOURCES[i].title;return "Lista IPTV";}
function countryName(code){for(var i=0;i<COUNTRY.length;i++)if(COUNTRY[i][0]===code)return COUNTRY[i][1];return code;}
/* Fixed priority: Brasil, Portugal, Espanha, Estados Unidos; rest alphabetical. */
var PRIORITY_COUNTRIES=["BR","PT","ES","US"];
function compareCountries(a,b){
 if(a[0]==="ALL")return -1;if(b[0]==="ALL")return 1;
 if(a[0]==="OTHER")return 1;if(b[0]==="OTHER")return -1;
 var x=PRIORITY_COUNTRIES.indexOf(a[0]),y=PRIORITY_COUNTRIES.indexOf(b[0]);
 if(x>=0&&y>=0)return x-y;
 if(x>=0)return -1;if(y>=0)return 1;
 var aa=lower(a[1]),bb=lower(b[1]);return aa<bb?-1:aa>bb?1:0;
}
function dataAttr(s,k){var m=new RegExp("(?:^|\\s)"+k+'="([^"]*)"',"i").exec(s);return m?m[1]:"";}
function inferCountry(meta,group,name,defaultCode){
  var merged=dataAttr(meta,"dm-country");
  if(merged)return merged==="GB"?"UK":merged;
  if(defaultCode && defaultCode!=="ALL")return defaultCode;
  var code=dataAttr(meta,"tvg-country").toUpperCase().split(/[;, ]/)[0];
  if(!code){var m=/\.([A-Za-z]{2})(?:@|$)/.exec(dataAttr(meta,"tvg-id"));if(m)code=m[1].toUpperCase();}
  if(!code){
    var text=group+" "+name;
    var candidates=[["BR",/brasil|brazil/i],["US",/usa|united states|estados unidos/i],["PT",/portugal/i],
      ["ES",/espa[nñ]a|spain/i],["AR",/argentina/i],["JP",/japan|jap[aã]o/i],
      ["CN",/china/i],["UK",/united kingdom|england|great britain/i],["FR",/france|fran[cç]a/i],
      ["DE",/germany|deutschland|alemanha/i],["IT",/italy|italia/i],["BE",/belgium|belgique/i]];
    for(var i=0;i<candidates.length;i++)if(candidates[i][1].test(text)){code=candidates[i][0];break;}
  }
  if(code==="GB")code="UK";
  if(/^[A-Z]{2}$/.test(code))return code;
  return "OTHER";
}
function parse(raw,forcedCode){
  var result=[],dedupe={},inf="",lines=raw.split(/\r?\n/),marker=forcedCode||"ALL";
  for(var i=0;i<lines.length&&result.length<MAX_CHANNELS;i++){
    var ln=trim(lines[i]);
    if(ln.indexOf("#DM_COUNTRY:")===0){marker=trim(ln.substring(12)).toUpperCase();continue;}
    if(ln.indexOf("#EXTINF:")===0){inf=ln;continue;}
    if(!inf||!ln||ln.charAt(0)==="#")continue;
    var m=inf.lastIndexOf(","),name=m>=0?trim(inf.substring(m+1)):"";
    var group=dataAttr(inf,"group-title");
    var sourceMeta=inf;inf="";
    if(!name||/\[(geo.blocked|blocked)\]/i.test(name))continue;
    if(!/^https:\/\//i.test(ln)||!/\.(?:m3u8|mp4)(?:[?#]|$)/i.test(ln))continue;
    var code=inferCountry(sourceMeta,group,name,marker);
    var origin=dataAttr(sourceMeta,"dm-source")||source;
    var genre=channelGenre(name,group,origin);
    var premium=PREMIUM.test(name),k=code+"|"+lower(name),orig=dedupe[k];
    if(orig){
      if(!orig.premium&&orig.urls.length<3&&!has(orig.urls,ln))orig.urls.push(ln);
      if(!has(orig.origins,origin))orig.origins.push(origin);
      continue;
    }
    var display=channelAlias(name,code);
    var sourceOriginal=dataAttr(sourceMeta,"dm-original-name");
    var rawAliases=dataAttr(sourceMeta,"dm-aliases");
    var item={id:source+":"+k,source:source,name:display,
      originalName:sourceOriginal||(display!==name?name:""),
      aliases:rawAliases?rawAliases.split(/\s*\|\s*/):[],code:code,genre:genre,group:group,
      premium:premium,urls:premium?[]:[ln],origins:[origin],
      lang:detectLanguage(sourceMeta,group)};
    dedupe[k]=item;result.push(item);
  }
  return result;
}
function drawSources(){
  var area=D("source-items");clear(area);
  for(var i=0;i<SOURCES.length;i++){(function(s,j){
    var btn=E("button","source-btn"+(s.id===source?" active":""));
    btn.type="button";btn.setAttribute("data-source",s.id);
    btn.appendChild(E("span","source-label",s.title||("Lista "+(j+1))));
    on(btn,"click",function(){selectSource(s.id);});area.appendChild(btn);
  }(SOURCES[i],i));}
  T(D("source-count"),SOURCES.length+" listas");
}
function addCountryOptions(){
  http("/stream/countries?list=lista-2",function(status,raw){
    if(status!==200)return;
    var values;
    try{values=JSON.parse(raw).countries||[];}catch(e){return;}
    var added=0;
    for(var j=0;j<values.length;j++){
      var c=values[j],id=String(c.code||"").toUpperCase();
      if(!/^[A-Z]{2}$/.test(id)||id==="UK"&&hasCountry("UK")||hasCountry(id))continue;
      COUNTRY.splice(COUNTRY.length-1,0,[id,String(c.name||id).slice(0,80)]);
      added++;
    }
    COUNTRY.sort(compareCountries);
    if(added){var focus=document.activeElement,
        current=focus&&focus.getAttribute("data-country");
      drawCountries();
      if(current)selectNewCountryFocus(current);
    }
    T(D("country-caption"),String(COUNTRY.length-2)+" países");
  });
}
function hasCountry(code){
  for(var i=0;i<COUNTRY.length;i++)if(COUNTRY[i][0]===code)return true;
  return false;
}

function treeKey(code,genre){return code+":"+genre;}
function treeGroups(code,genre){
 var src=cache["lista-2:"+code]||[],items=[];
 for(var i=0;i<src.length;i++)if(genreFits(src[i],genre)&&!isHidden(src[i]))items.push(src[i]);
 items.sort(function(a,b){
  var x=lower(a.originalName||a.name),y=lower(b.originalName||b.name);
  return x<y?-1:x>y?1:0;
 });
 return items;
}
function switchMobilePane(name){
 if(!mobileMode)return;
 var countryPane=name!=="guide",left=D("mobile-countries-panel"),
     right=D("mobile-guide-panel");
 document.documentElement.className=document.documentElement.className
   .replace(/\s*dm-mobile-pane-(?:countries|guide)/g,"")+
   (countryPane?" dm-mobile-pane-countries":" dm-mobile-pane-guide");
 left.setAttribute("aria-hidden",countryPane?"false":"true");
 right.setAttribute("aria-hidden",countryPane?"true":"false");
 D("mobile-countries").setAttribute("aria-pressed",countryPane?"true":"false");
 D("mobile-guide").setAttribute("aria-pressed",countryPane?"false":"true");
}
function drawCountries(){
 var area=D("country-items");clear(area);
 // "Todos" is a search/filter, not a geographical country.
 for(var i=1;i<COUNTRY.length;i++){(function(entry){
  var code=entry[0],opened=!!openCountries[code],items=cache["lista-2:"+code];
  var wrap=E("div","tree-country");area.appendChild(wrap);
  var btn=E("button","country-btn tree-country-btn"+(country===code?" active":""));
  btn.type="button";btn.setAttribute("data-country",code);
  btn.setAttribute("aria-expanded",opened?"true":"false");
  btn.appendChild(E("span","tree-chevron",opened?"▾":"▸"));
  btn.appendChild(E("span","tree-label",entry[1]));
  if(items){var count=0;for(var n=0;n<items.length;n++)if(!isHidden(items[n]))count++;
   btn.appendChild(E("span","tree-count",String(count)));}
  on(btn,"click",function(){chooseCountry(code);});wrap.appendChild(btn);
  if(!opened)return;
  var subtree=E("div","tree-categories");wrap.appendChild(subtree);
  if(treeErrors[code]){subtree.appendChild(E("p","tree-error","Falha no catálogo. Selecione novamente."));return;}
  if(!items){subtree.appendChild(E("p","tree-loading","Carregando canais…"));return;}
  if(!items.length){subtree.appendChild(E("p","tree-loading","Nenhum canal encontrado."));return;}
  for(var g=0;g<TREE_GENRES.length;g++){(function(genre){
    var id=genre[0],filtered=treeGroups(code,id);
    if(!filtered.length)return;
    var key=treeKey(code,id),expanded=!!openGenres[key];
    var cat=E("button","tree-genre-btn"+(country===code&&category===id?" active":""));
    cat.type="button";cat.setAttribute("data-country",code);
    cat.setAttribute("data-genre",id);cat.setAttribute("aria-expanded",expanded?"true":"false");
    cat.appendChild(E("span","tree-chevron",expanded?"▾":"▸"));
    cat.appendChild(E("span","tree-label",genre[1]));
    cat.appendChild(E("span","tree-count",String(filtered.length)));
    on(cat,"click",function(){chooseGenre(code,id);});subtree.appendChild(cat);
    if(!expanded)return;
    var list=E("div","tree-channel-list");subtree.appendChild(list);
    var max=treeLimits[key]||20;
    for(var n=0;n<filtered.length&&n<max;n++){(function(channel){
      var ch=E("button","tree-channel-btn"+(selected&&selected.id===channel.id?" active":""));
      ch.type="button";ch.setAttribute("data-channel-id",channel.id);
      ch.setAttribute("data-country",code);
      ch.appendChild(E("span","tree-channel-name",
        channel.name+(channel.officialUrl&&(!channel.urls||!channel.urls.length)?" ↗":"")));
      ch.appendChild(E("span","tree-channel-class",classificationName(channel)));
      if(channel.officialUrl&&(!channel.urls||!channel.urls.length))
        ch.setAttribute("title","Site/app oficial externo — "+channel.name);
      on(ch,"click",function(){chooseTreeChannel(code,id,channel);});list.appendChild(ch);
    }(filtered[n]));}
    if(filtered.length>max){
      var more=E("button","tree-more-btn","Mostrar mais "+Math.min(20,filtered.length-max));
      more.type="button";more.setAttribute("data-country",code);
      on(more,"click",function(){
        var next=filtered[max];treeLimits[key]=max+20;drawCountries();
        if(next)focusTreeChannel(code,next.id);
      });
      list.appendChild(more);
    }
  }(TREE_GENRES[g]));}
 }(COUNTRY[i]));}
}
function focusTreeChannel(code,id){
 var list=D("country-items").getElementsByTagName("button");
 for(var i=0;i<list.length;i++)
  if(list[i].getAttribute("data-country")===code &&
    list[i].getAttribute("data-channel-id")===id){focusTV(list[i]);return;}
}
function focusTreeGenre(code,genre){
 var list=D("country-items").getElementsByTagName("button");
 for(var i=0;i<list.length;i++)
  if(list[i].getAttribute("data-country")===code &&
    list[i].getAttribute("data-genre")===genre){focusTV(list[i]);return;}
}
/* At most one category stays expanded across the navigation tree.
 * Expand another category without scrolling through the previous channel list. */
function closeAllGenres(){
 openGenres={};
}
/* Countries start closed, including Brazil; the guide only shows channels
 * after a country is intentionally opened. The video remains untouched. */
function showCountryPrompt(){
 cancelGlobalSearch();
 country="ALL";category="all";search="";limit=60;
 D("search").value="";
 channels=[];visible=[];
 T(D("catalog-title"),"Escolha um país");
 T(D("catalog-subtitle"),"Clique em um país à esquerda para abrir os canais.");
 T(D("result-count"),"Aguardando seleção");
 T(D("catalog-status"),"Abra um país para visualizar o guia de canais.");
 clear(D("channel-items"));visibleEl(D("show-more"),false);
}
function chooseCountry(code){
 if(openCountries[code]){
  openCountries[code]=false;closeAllGenres();
  if(country===code){serial++;showCountryPrompt();}
  drawCountries();selectNewCountryFocus(code);return;
 }
 closeAllGenres();
 cancelGlobalSearch();
 openCountries[code]=true;country=code;category="all";search="";
 D("search").value="";limit=60;drawCountries();
 selectNewCountryFocus(code);loadChannels();switchMobilePane("guide");
}
function chooseGenre(code,genre){
 var k=treeKey(code,genre),expanding=!openGenres[k];
 closeAllGenres();
 if(expanding)openGenres[k]=true;
 cancelGlobalSearch();
 country=code;category=expanding?genre:"all";
 search="";D("search").value="";limit=60;
 openCountries[code]=true;
 drawCountries();focusTreeGenre(code,genre);loadChannels();switchMobilePane("guide");
}
function chooseTreeChannel(code,genre,c){
 cancelGlobalSearch();
 country=code;category=genre;search="";limit=60;D("search").value="";
 channels=cache["lista-2:"+code]||[];renderChannels();play(c,true);
 switchMobilePane("guide");
}
function drawCategories(){
  var area=D("category-items"),btns=area.getElementsByTagName("button");
  for(var i=0;i<btns.length;i++){
    var b=btns[i];
    b.className="filter-btn"+(b.getAttribute("data-category")===category?" active":"");
  }
}
function refresh(){
  if(globalSearchMode){runGlobalSearch();return;}
  closeAllGenres();category="all";cache={};treeErrors={};
  if(source==="lista-2"&&country==="ALL"){
    showCountryPrompt();drawCountries();return;
  }
  loadChannels();
}
function selectSource(id){
  cancelGlobalSearch();
  if(source===id&&channels.length)return;
  source=id;country=(id==="lista-2"||id==="lista-8"||id==="lista-9")?"BR":"ALL";
  category="all";search="";D("search").value="";limit=60;
  T(D("head-source"),sourceName());
  drawSources();drawCountries();drawCategories();
  selectNewSourceFocus(id);
  loadChannels();
}
function loadChannels(){
  serial++;var seq=serial,code=(source==="lista-2"||source==="lista-8"||source==="lista-9")?country:"ALL";
  var cacheKey=source+":"+code;
  T(D("catalog-title"),countryName(country));
  T(D("catalog-subtitle"),category==="all"?"Todos os canais":genreName(category));
  T(D("catalog-status"),"Organizando canais de "+countryName(country)+"…");
  T(D("result-count"),"Carregando");
  clear(D("channel-items"));visibleEl(D("show-more"),false);
  if(cache[cacheKey]){
    channels=attachOfficial(code,cache[cacheKey]);cache[cacheKey]=channels;
    T(D("catalog-status"),"Canais por país · sinais não verificados e sites oficiais identificados");
    renderChannels();drawCountries();return;
  }
  treeErrors[code]=false;drawCountries();
  http("/stream/catalog?list="+encodeURIComponent(source)+"&country="+encodeURIComponent(code),function(st,body){
    if(seq!==serial){
      // Keep independently expanded countries usable even after switching focus.
      if(st===200)cache[cacheKey]=attachOfficial(code,parse(body,code));
      else {cache[cacheKey]=attachOfficial(code,[]);treeErrors[code]=!cache[cacheKey].length;}
      drawCountries();return;
    }
    if(st!==200){
      channels=attachOfficial(code,[]);cache[cacheKey]=channels;
      treeErrors[code]=!channels.length;renderChannels();drawCountries();
      T(D("catalog-status"),"Fontes M3U não carregaram (erro "+st+"). "+
        channels.length+" acessos oficiais externos estão disponíveis.");
      return;
    }
    var parsed=parse(body,(source==="lista-2"||source==="lista-8"||source==="lista-9")&&code!=="ALL"?code:"ALL");
    channels=attachOfficial(code,parsed);
    cache[cacheKey]=channels;
    if(source==="lista-2"){
      var count=/#DM_SOURCES_LOADED:([^\r\n]+)/.exec(body),
        missing=/#DM_PARTIAL:([^\r\n]+)/.exec(body),
        cut=/#DM_TRUNCATED:1/.test(body);
      T(D("catalog-status"),"Canais do país"+
        (count?" · Fontes: "+count[1]:"")+
        (missing?" · Fontes indisponíveis: "+missing[1]:"")+
        (cut?" · Catálogo geral parcial; selecione um país":"")+
        " · Reprodução não garantida.");
    }else T(D("catalog-status"),"Lista pública · reprodução ainda não verificada nesta TV.");
    renderChannels();drawCountries();
  });
}
function fits(c){
  if(isHidden(c))return false;
  if(country!=="ALL" && c.code!==country)return false;
  if(category!=="all"&&category!=="fav"&&!genreFits(c,category))return false;
  if(category==="fav"&&!has(favorites,favorKey(c)))return false;
  if(search && lower(c.name+" "+(c.originalName||"")+" "+(c.aliases||[]).join(" ")+" "+c.group).indexOf(search)<0)return false;
  return true;
}

/* Global search is independent of the expanded country. It reads one
 * authenticated cross-country server endpoint, plus official-site listings.
 * The country tree, active player and favorites remain unchanged. */
function cancelGlobalSearch(){
 globalSearchSeq++;
 if(globalSearchTimer!==null){clearTimeout(globalSearchTimer);globalSearchTimer=null;}
 globalSearchMode=false;globalResults=[];globalStatus="";
}
function globalSearchMatches(serverItems,query){
 var found=[],seen={},i,k,c,code;
 function append(item){
  if(!item||!item.code||isHidden(item))return;
  k=item.code+"|"+lower(item.originalName||item.name);
  if(seen[k])return;
  seen[k]=true;found.push(item);
 }
 for(var a=0;a<serverItems.length;a++)append(serverItems[a]);
 for(var key in cache)if(Object.prototype.hasOwnProperty.call(cache,key)&&
     key.indexOf("lista-2:")===0){
  var list=cache[key]||[];
  for(i=0;i<list.length;i++){
   c=list[i];
   if(lower(c.name+" "+(c.originalName||"")+" "+(c.aliases||[]).join(" ")).indexOf(query)>=0)append(c);
  }
 }
 for(i=0;i<officialFree.length;i++){
  var x=officialFree[i];
  if(!validOfficialUrl(x.url)||lower(x.name).indexOf(query)<0)continue;
  append({id:"official:"+x.id,source:"official",name:x.name,code:x.code,
   genre:x.genre||"other",group:"Site/app oficial",origins:["Emissora"],
   premium:false,urls:[],lang:x.lang||"",officialUrl:x.url,
   officialAccess:x.access,officialNotes:x.notes,embed:x.embed||null});
 }
 return found;
}
function runGlobalSearch(){
 var value=lower(D("search").value),token=++globalSearchSeq;
 if(globalSearchTimer!==null){clearTimeout(globalSearchTimer);globalSearchTimer=null;}
 search=value;limit=60;
 if(!value){
  globalSearchMode=false;globalResults=[];globalStatus="";
  if(country==="ALL"){showCountryPrompt();return;}
  channels=cache[source+":"+country]||channels;
  T(D("catalog-title"),countryName(country));
  T(D("catalog-subtitle"),category==="all"?"Todos os canais":genreName(category));
  T(D("catalog-status"),"Exibindo novamente os canais de "+countryName(country)+".");
  renderChannels();return;
 }
 globalSearchMode=true;
 globalResults=globalSearchMatches([],value);
 globalStatus=value.length<2?"Digite pelo menos 2 caracteres para pesquisar todos os países.":
   "Pesquisando canais em todos os países e listas…";
 renderChannels();
 if(value.length<2)return;
 globalSearchTimer=setTimeout(function(){
  globalSearchTimer=null;
  http("/stream/search?q="+encodeURIComponent(value),function(st,body){
   if(token!==globalSearchSeq||!globalSearchMode||lower(D("search").value)!==value)return;
   if(st!==200){
    globalStatus="Busca geral indisponível. Mostrando apenas resultados locais já conhecidos.";
    renderChannels();return;
   }
   var results=parse(body,"ALL");
   globalResults=globalSearchMatches(results,value);
   var sources=/#DM_SOURCES_LOADED:([^\r\n]+)/.exec(body),
       partial=/#DM_PARTIAL:([^\r\n]+)/.exec(body),
       cut=/#DM_TRUNCATED:1/.test(body);
   globalStatus="Busca global"+(sources?" · Fontes consultadas: "+sources[1]:"")+
     (partial?" · Alguns catálogos indisponíveis":"")+
     (cut?" · Resultados limitados; refine a busca":"");
   renderChannels();
  });
 },450);
}

function toggleFavorite(c){
  var k=favorKey(c),remove=has(favorites,k);
  function commit(){
   if(remove){
    var idx=favorites.indexOf(k);
    if(idx>=0)favorites.splice(idx,1);
    delete favoriteMeta[k];
   }else if(!has(favorites,k)){
    favorites.push(k);favoriteMeta[k]=safeSnapshot(c);
   }
   saveFav();
   if(!streamUserId)try{localStorage.setItem(FAV_META_STORE,JSON.stringify(favoriteMeta));}catch(e){}
   updateFavButton();renderChannels();drawQuickLists();
  }
  if(!streamUserId){commit();return;}
  if(!session||!favoritesReady||pendingFavorites[k])return;
  pendingFavorites[k]=true;
  favoriteWrites++;
  favoriteRead++;
  updateFavButton();
  postJson("/stream/favorites",{operation:remove?"remove":"add",key:k},function(st){
   delete pendingFavorites[k];
   favoriteWrites--;
   updateFavButton();
   if(!session)return;
   if(st===409){window.location.replace("/stream/");return;}
   if(st===200)commit();
   else T(D("catalog-status"),"Não foi possível salvar Favorito. Tente novamente.");
  });
}
function updateFavButton(){
  var b=D("player-favorite"),k=selected?favorKey(selected):"";
  b.disabled=!selected||!!(streamUserId&&(!favoritesReady||pendingFavorites[k]));
  T(b,selected&&has(favorites,k)?"★ Favoritado":"☆ Favoritar");
}
function renderChannels(){
  if(!globalSearchMode&&source==="lista-2"&&country==="ALL"){showCountryPrompt();return;}
  var all=[],i,area=D("channel-items");clear(area);
  if(globalSearchMode){
    for(i=0;i<globalResults.length;i++)if(!isHidden(globalResults[i]))all.push(globalResults[i]);
    var rank={BR:0,PT:1,US:2};
    all.sort(function(a,b){
      var ar=Object.prototype.hasOwnProperty.call(rank,a.code)?rank[a.code]:3;
      var br=Object.prototype.hasOwnProperty.call(rank,b.code)?rank[b.code]:3;
      if(ar!==br)return ar-br;
      if(a.code!==b.code)return a.code<b.code?-1:1;
      var x=lower(a.originalName||a.name),y=lower(b.originalName||b.name);
      return x<y?-1:x>y?1:0;
    });
    T(D("catalog-title"),"Resultados em todos os países");
    T(D("catalog-subtitle"),"Busca global: "+D("search").value);
    T(D("catalog-status"),globalStatus);
  }else{
    for(i=0;i<channels.length;i++)if(fits(channels[i]))all.push(channels[i]);
    all.sort(function(a,b){var x=lower(a.originalName||a.name),y=lower(b.originalName||b.name);return x<y?-1:x>y?1:0;});
  }
  visible=all;
  var videos=0,external=0;
  for(i=0;i<visible.length;i++){
    if(visible[i].urls&&visible[i].urls.length)videos++;
    else if(visible[i].officialUrl)external++;
  }
  if(globalSearchMode){
    var codes={},countries=0;
    for(i=0;i<all.length;i++)if(!codes[all[i].code]){codes[all[i].code]=true;countries++;}
    T(D("result-count"),all.length+" resultados em "+countries+" países · "+
      videos+" sinais · "+external+" sites oficiais");
  }else T(D("result-count"),videos+" sinais · "+external+" sites oficiais");
  if(!all.length){
    var emptyText=globalSearchMode?(search.length<2?"Digite 2 ou mais caracteres.":globalStatus.indexOf("Pesquisando")===0?"Buscando canais em todos os países…":globalStatus.indexOf("indisponível")>=0?"Não foi possível consultar todas as listas. Tente novamente.":"Nenhum canal encontrado para esta busca."):channels.length?"Nenhum canal nesta categoria ou busca.":"Nenhum canal catalogado neste país.";
    area.appendChild(E("p","loading",emptyText));
  }
  for(i=0;i<all.length&&i<limit;i++){(function(c,j){
    var row=E("div","channel-row"+(selected&&selected.id===c.id?" current":""));
    row.appendChild(E("span","channel-number",String(j+1)));
    var btn=E("button","channel-btn");btn.type="button";
    var extra=(c.officialUrl&&(!c.urls||!c.urls.length)?" ↗":"");
    btn.appendChild(E("strong","channel-title",c.name+extra));
    btn.appendChild(E("span","channel-classification",classificationName(c)));
    var from="";
    if((source==="lista-2"||globalSearchMode)&&c.origins&&c.origins.length){
      from="Origem: "+c.origins.map(function(x){return x.replace(/^lista-/,"Lista ");}).join(", ");
    }
    var details=(c.genre==="news"?"Notícias":c.genre==="sports"?"Esportes":genreName(c.genre))+
      (c.premium?" · Assinatura":"")+
      (c.originalName?" · Nome da fonte: "+c.originalName:"")+
      (c.officialUrl?" · Site/app oficial externo":"")+
      (from?" · "+from:"");
    btn.setAttribute("title",details);
    btn.setAttribute("aria-label",c.name+" · "+classificationName(c)+" · "+details);
    btn.setAttribute("data-channel-id",c.id);
    on(btn,"click",function(){play(c);});row.appendChild(btn);
    var starred=has(favorites,favorKey(c));
    var star=E("button","fav-btn"+(starred?" marked":""),starred?"★":"☆");
    star.type="button";star.setAttribute("aria-label","Favoritar "+c.name);
    star.setAttribute("data-channel-id",c.id);
    on(star,"click",function(){toggleFavorite(c);focusChannelAfterRender(c.id,true);});row.appendChild(star);
    area.appendChild(row);
  }(all[i],i));}
  visibleEl(D("show-more"),all.length>limit);
  T(D("show-more"),"Mostrar mais "+Math.min(60,Math.max(0,all.length-limit))+" canais");
}
function play(c,fromTree){
  clearPlaybackWatch();clearOfficialFrame();recordVisit(c);
  visibleEl(D("official-open"),!!c.officialUrl);
  T(D("official-open"),c.premium?"Abrir plataforma oficial":"Abrir no site/app oficial");
  if(c.officialUrl&&(!c.urls||!c.urls.length)&&!c.premium){
    try{video.pause();video.removeAttribute("src");video.load();}catch(e){}
    selected=c;T(D("now-name"),c.name);
    T(D("now-meta"),countryName(c.code)+" · "+(c.officialAccess||"Site oficial"));
    var url=officialEmbedUrl(c),framed=!!url&&!!officialFrame;
    if(framed){
      officialFrame.src=url;
      officialFrame.title="Player oficial · "+c.name;
      visibleEl(officialFrame,true);
      T(D("play-status"),"Player oficial · live não verificada");
      T(D("player-error"),"Player oficial incorporado. O Stream não confirma "+
        "se há transmissão agora. Se não houver imagem, pode estar encerrada, "+
        "restrita ou com incorporação bloqueada. Tente Abrir no site/app oficial.");
    }else{
      T(D("play-status"),"Acesso oficial externo");
      T(D("player-error"),"Este serviço abre no site ou aplicativo oficial; "+
        "não há player incorporável verificado para esta fonte.");
    }
    visibleEl(D("player-empty"),!framed);visibleEl(video,false);
    visibleEl(D("player-error"),true);
    D("player-retry").disabled=!framed;D("player-fullscreen").disabled=!framed;
    updateFavButton();renderChannels();drawCountries();
    if(fromTree)focusTreeChannel(c.code,c.id);else focusChannelAfterRender(c.id,false);
    return;
  }
  if(c.premium){
    try{video.pause();video.removeAttribute("src");video.load();}catch(e){}
    selected=c;T(D("now-name"),c.name);
    T(D("now-meta"),countryName(c.code)+" · Listado, sem autorização de transmissão verificada");
    T(D("play-status"),"Acesso oficial necessário");
    visibleEl(D("player-empty"),true);visibleEl(video,false);
    T(D("player-error"),"Canal ou serviço por assinatura. Não existe acesso gratuito "+
      "ao sinal integral dentro deste player. Consulte o provedor oficial.");
    visibleEl(D("player-error"),true);
    D("player-retry").disabled=true;D("player-fullscreen").disabled=true;
    updateFavButton();renderChannels();drawCountries();
    if(fromTree)focusTreeChannel(c.code,c.id);else focusChannelAfterRender(c.id,false);
    return;
  }
  selected=c;T(D("now-name"),c.name);
  T(D("now-meta"),countryName(c.code)+" · "+
    (c.originalName?"Fonte: "+c.originalName+" · ":"")+
    (c.group||"Ao vivo")+" · verificando reprodução…");
  T(D("play-status"),"Conectando…");updateFavButton();
  visibleEl(D("player-empty"),false);visibleEl(video,true);visibleEl(D("player-error"),false);
  D("player-retry").disabled=false;D("player-fullscreen").disabled=false;
  startPlaybackWatch(c);
  renderChannels();drawCountries();
  if(fromTree)focusTreeChannel(c.code,c.id);else focusChannelAfterRender(c.id,false);
}
/* Directional navigation stays inside the focused column on UP/DOWN.
 * LEFT/RIGHT changes columns; only that column scrolls, never the video.
 * ES5-compatible for older Samsung Tizen browsers.
 */
function columnOf(el){
  while(el&&el!==document.body){
    if(el.className&&typeof el.className==="string"&&(" "+el.className+" ").indexOf(" column ")>=0)return el;
    el=el.parentNode;
  }
  return null;
}
function focusableItems(col){
  var nodes=col.querySelectorAll(".quick-toggle,.quick-entry-btn,.country-btn,.tree-genre-btn,.tree-channel-btn,.tree-more-btn,.channel-btn,.fav-btn,#search,#clear-search,#refresh,#restore-hidden,#show-more,#official-open,#provider-toggle,#technical-toggle,.provider-entry,#player-favorite,#player-retry,#player-fullscreen,#video");
  var out=[];
  for(var i=0;i<nodes.length;i++){
    var x=nodes[i];
    if(x.offsetHeight>0&&x.offsetWidth>0&&!x.disabled&&x.hidden!==true)out.push(x);
  }
  return out;
}
function keepVisibleInColumn(col,item){
  if(!col||!item)return;
  var a=col.getBoundingClientRect(),b=item.getBoundingClientRect();
  var top=a.top+12,bottom=a.bottom-12;
  if(b.top<top)col.scrollTop-=top-b.top;
  else if(b.bottom>bottom)col.scrollTop+=b.bottom-bottom;
}
function focusTV(item){
  if(!item)return;
  item.focus();
  keepVisibleInColumn(columnOf(item),item);
}
function selectNewCountryFocus(code){
  var all=D("country-items").getElementsByTagName("button");
  for(var i=0;i<all.length;i++)if(all[i].getAttribute("data-country")===code){focusTV(all[i]);break;}
}
function selectNewSourceFocus(code){
  var all=D("source-items").getElementsByTagName("button");
  for(var i=0;i<all.length;i++)if(all[i].getAttribute("data-source")===code){focusTV(all[i]);break;}
}
function focusChannelAfterRender(channelId,star){
  var all=D("channel-items").getElementsByTagName("button");
  for(var i=0;i<all.length;i++)if(all[i].getAttribute("data-channel-id")===channelId &&
     (star?all[i].className.indexOf("fav-btn")>=0:all[i].className.indexOf("channel-btn")>=0)){
    focusTV(all[i]);return;
  }
}
function initRemote(){
  on(document,"keydown",function(e){
    var code=e.keyCode||e.which;
    if(code!==37&&code!==38&&code!==39&&code!==40&&code!==33&&code!==34&&code!==35&&code!==36)return;
    if(e.target&&e.target.tagName==="INPUT")return;
    var current=document.activeElement;
    var cols=[document.querySelector(".sidebar"),document.querySelector(".catalog"),document.querySelector(".player-column")];
    var col=columnOf(current)||cols[0],list=focusableItems(col),idx=-1,i;
    for(i=0;i<list.length;i++)if(list[i]===current){idx=i;break;}
    if(code===37||code===39){
      var pos=cols.indexOf(col),next=cols[pos+(code===39?1:-1)];
      if(next){
        var options=focusableItems(next),chosen=null,score=1e20;
        var point=current&&current.getBoundingClientRect?current.getBoundingClientRect():col.getBoundingClientRect();
        var y=point.top+point.height/2;
        for(i=0;i<options.length;i++){
          var rect=options[i].getBoundingClientRect();
          // Prefer same vertical row, but allow off-screen channel entries.
          var distance=Math.abs(rect.top+rect.height/2-y);
          if(distance<score){score=distance;chosen=options[i];}
        }
        if(chosen){if(e.preventDefault)e.preventDefault();focusTV(chosen);}
      }
      return;
    }
    if(!list.length)return;
    if(e.preventDefault)e.preventDefault();
    if(code===33||code===34){
      col.scrollTop+=(code===34?1:-1)*Math.max(180,col.clientHeight*0.75);
      return;
    }
    if(code===36||code===35){focusTV(list[code===36?0:list.length-1]);return;}
    if(idx<0){focusTV(list[code===38?list.length-1:0]);return;}
    var nextIndex=idx+(code===40?1:-1);
    if(code===40&&current.id==="show-more"&&visible.length>limit){
      var nextChannel=visible[limit],oldLimit=limit;
      limit+=60;renderChannels();
      if(nextChannel)focusChannelAfterRender(nextChannel.id,false);
      return;
    }
    if(nextIndex>=0&&nextIndex<list.length){focusTV(list[nextIndex]);return;}
    // Stay in the same column at the boundary, do not jump to another column.
    if(code===40&&idx===list.length-1){col.scrollTop=col.scrollHeight;}
    if(code===38&&idx===0){col.scrollTop=0;}
  });
}
function toggleQuickGroup(kind){
  var id=kind==="recent"?"recent":"favorite";
  var list=D(id+"-items"),button=D(id+"-toggle");
  var expanded=list.hidden;
  list.hidden=!expanded;
  button.setAttribute("aria-expanded",expanded?"true":"false");
  T(button.getElementsByTagName("span")[0],expanded?"▾":"▸");
}
function init(){
  COUNTRY.sort(compareCountries);
  drawQuickLists();initRemote();
  if(mobileMode){
   switchMobilePane("countries");
   on(D("mobile-countries"),"click",function(){switchMobilePane("countries");});
   on(D("mobile-guide"),"click",function(){switchMobilePane("guide");});
  }
  on(D("recent-toggle"),"click",function(){toggleQuickGroup("recent");});
  on(D("favorite-toggle"),"click",function(){toggleQuickGroup("favorite");});
  on(D("search"),"input",runGlobalSearch);
  on(D("search"),"keyup",function(e){if(!("oninput" in D("search")))runGlobalSearch();});
  on(D("clear-search"),"click",function(){D("search").value="";runGlobalSearch();});
  on(D("refresh"),"click",refresh);
  on(D("restore-hidden"),"click",restoreHidden);
  on(D("show-more"),"click",function(){
    var next=visible[limit];
    limit+=60;renderChannels();
    if(next)focusChannelAfterRender(next.id,false);
  });
  on(D("player-favorite"),"click",function(){if(selected)toggleFavorite(selected);});
  on(D("player-retry"),"click",function(){if(selected)play(selected);});
  on(D("official-open"),"click",function(){
    if(selected&&validOfficialUrl(selected.officialUrl))
      window.location.href=selected.officialUrl;
  });
  on(D("provider-toggle"),"click",function(){
    var open=D("provider-items").hidden;D("provider-items").hidden=!open;
    D("provider-toggle").setAttribute("aria-expanded",open?"true":"false");
    T(D("provider-toggle"),(open?"▾":"▸")+" Plataformas por assinatura");
  });
  on(D("technical-toggle"),"click",function(){
    var open=D("technical-items").hidden;D("technical-items").hidden=!open;
    D("technical-toggle").setAttribute("aria-expanded",open?"true":"false");
    T(D("technical-toggle"),(open?"▾":"▸")+" Fontes técnicas (listas)");
  });
  on(D("player-fullscreen"),"click",function(){
    var target=officialFrame&&!officialFrame.hidden?officialFrame:video;
    var fn=target.requestFullscreen||target.webkitRequestFullscreen||target.webkitEnterFullscreen;
    if(fn)try{fn.call(target);}catch(e){}
  });
  on(video,"playing",function(){
    completePlayback();
    T(D("play-status"),"● Reproduzindo");
    if(selected&&!selected.premium)T(D("now-meta"),countryName(selected.code)+" · Reprodução confirmada nesta sessão");
    visibleEl(D("player-error"),false);
  });
  on(video,"error",function(){
    if(!selected||selected.premium||video.hidden||playbackConfirmed)return;
    if(desktopMode&&desktopFailureReason)return;
    T(D("play-status"),"Verificando sinal…");
    T(D("player-error"),"Sinal ainda sem reprodução. "+
      "O Stream verificará as alternativas disponíveis por até 60 segundos.");
    visibleEl(D("player-error"),true);
  });
  // When Samsung denies automatic play, the sixty-second watch starts only
  // after the viewer actually presses Play.
  on(video,"play",function(){
    if(!autoplayBlocked||playbackConfirmed||!selected||selected.premium)return;
    autoplayBlocked=false;
    var token=playbackToken,c=selected;
    if(!desktopMode)playbackTimers.push(setTimeout(function(){
      if(token===playbackToken&&!playbackConfirmed&&selected&&selected.id===c.id)
        hideFailed(c);
    },60000));
  });
  var btns=D("category-items").getElementsByTagName("button");
  for(var i=0;i<btns.length;i++){(function(b){
    on(b,"click",function(){category=b.getAttribute("data-category");limit=60;drawCategories();renderChannels();});
  }(btns[i]));}
  on(window,"focus",fetchUserFavorites);
  on(document,"visibilitychange",function(){if(!document.hidden)fetchUserFavorites();});
  http("/stream/session",function(code,body){
    if(code!==200||body.indexOf('"allowed":true')<0){
      visibleEl(D("tv-layout"),false);visibleEl(D("tv-error"),true);return;
    }
    session=true;
    // Stop a player when this account is suspended or its session expires.
    setInterval(function(){http("/stream/session",function(st,raw){
      if(st!==200||raw.indexOf('"allowed":true')<0){
        session=false;clearPlaybackWatch();destroyDesktopHls();
        try{video.pause();video.removeAttribute("src");video.load();}catch(e){}
        if(officialFrame)officialFrame.removeAttribute("src");
        visibleEl(D("tv-layout"),false);visibleEl(D("tv-error"),true);
      }else if(!document.hidden)fetchUserFavorites();
    });},300000);
    try{var a=JSON.parse(body);if(typeof a.user_id==="string"){streamUserId=a.user_id;streamUserRole=a.role||"viewer";T(D("account-identity"),"Conta: "+String(a.email||"não identificada")+(a.role==="admin"?" · ADMIN":" · USUÁRIO"));}}catch(e){T(D("account-identity"),"Conta não identificada");}
    // Management link is visible only for a server-confirmed admin session.
    if(D("admin-link"))visibleEl(D("admin-link"),streamUserRole==="admin");
    if(streamUserId){
      recent=[];favoriteMeta={};favorites=[];loadQuickHistory();
      if(window.location.hostname==="streamnow-2o1.pages.dev"||
         window.location.hostname==="contas-compartilhadas.streamnow-2o1.pages.dev")offerBrowserFavoriteImport();
      else migrateAdminFavorites();
    }
    else{loadHidden();loadFav();loadQuickHistory();drawQuickLists();}
    http("/stream/listas/sources.json",function(st,raw){
      if(st!==200){T(D("catalog-status"),"Não foi possível abrir a biblioteca. Tente Atualizar.");return;}
      try{var d=JSON.parse(raw);SOURCES=d.sources||[];}catch(e){SOURCES=[];}
      var verified=[];for(var j=0;j<SOURCES.length;j++)if(/^lista-(?:[1-9]|1[0-4])$/.test(SOURCES[j].id))verified.push(SOURCES[j]);
      SOURCES=verified;drawSources();drawCountries();drawCategories();
      var tech=D("technical-items");clear(tech);
      for(var n=0;n<SOURCES.length;n++)
        tech.appendChild(E("p","technical-source-name",SOURCES[n].title||SOURCES[n].id));
      addCountryOptions();loadOfficialDirectory();
      if(!SOURCES.length){T(D("catalog-status"),"Biblioteca sem fontes cadastradas.");return;}
      source="lista-2";showCountryPrompt();
    });
  });
}
init();
}());
