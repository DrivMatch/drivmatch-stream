/* Samsung TV guide: pure ES5 to work in older Tizen Web browsers. No private secrets or CORS bypass. */
(function(){
"use strict";
var D=function(id){return document.getElementById(id);};
var COUNTRY=[["ALL","Todos os países"],["BR","Brasil"],["US","Estados Unidos"],["PT","Portugal"],
 ["ES","Espanha"],["AR","Argentina"],["JP","Japão"],["CN","China"],["UK","Reino Unido"],
 ["BE","Bélgica"],["IT","Itália"],["FR","França"],["DE","Alemanha"],["OTHER","Outros / não identificados"]];
var SOURCES=[],source="lista-2",country="BR",category="all",search="",channels=[],visible=[],selected=null;
var favorites=[],limit=60,serial=0,session=false,cache={},MAX_CHANNELS=15000,video=D("video");
var STORE="drivmatch-tv-guide-favorites-v1";
var NEWS=/news|not[ií]cias|jornal|noticiero|journal|nieuws|nachrichten|actualidad|actualit[eé]s|新闻|ニュース|報道/i;
var SPORTS=/sports?|esport|deport|futebol|football|soccer|calcio|体育|スポーツ/i;
var PREMIUM=/\b(espn|premiere|combate|sky\s*sports?|bein\s*sports?|tnt\s*sports?|(?:spor\s*tv|sport\s*tv)|dazn|canal\+|fox\s*sports?|ppv|pay.per.view)\b/i;
function T(el,s){if(el)el.textContent=s;}
function E(tag,cl,s){var x=document.createElement(tag);if(cl)x.className=cl;if(typeof s==="string")T(x,s);return x;}
function clear(el){while(el.firstChild)el.removeChild(el.firstChild);}
function visibleEl(el,on){el.style.display=on?"":"none";el.hidden=!on;}
function on(el,k,fn){if(el&&el.addEventListener)el.addEventListener(k,fn,false);}
function http(path,cb){var x=new XMLHttpRequest(),done=false;x.onreadystatechange=function(){if(x.readyState===4&&!done){done=true;cb(x.status,x.responseText||"");}};
x.onerror=function(){if(!done){done=true;cb(0,"");}};
try{x.open("GET",path,true);x.send();}catch(e){cb(0,"");}}
function trim(s){return String(s||"").replace(/^\s+|\s+$/g,"");}
function lower(s){return trim(s).toLowerCase();}
function has(arr,k){return arr.indexOf(k)>=0;}
function favorKey(c){return c.source+":"+c.code+":"+lower(c.name);}
function saveFav(){try{localStorage.setItem(STORE,JSON.stringify(favorites));}catch(e){}}
function loadFav(){try{var a=JSON.parse(localStorage.getItem(STORE)||"[]");if(Object.prototype.toString.call(a)==="[object Array]")favorites=a;}catch(e){}}
function sourceName(){for(var i=0;i<SOURCES.length;i++)if(SOURCES[i].id===source)return SOURCES[i].title;return "Lista IPTV";}
function countryName(code){for(var i=0;i<COUNTRY.length;i++)if(COUNTRY[i][0]===code)return COUNTRY[i][1];return code;}
function dataAttr(s,k){var m=new RegExp("(?:^|\\s)"+k+'="([^"]*)"',"i").exec(s);return m?m[1]:"";}
function inferCountry(meta,group,name,defaultCode){
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
  for(var k=1;k<COUNTRY.length;k++)if(COUNTRY[k][0]===code)return code;
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
    var genre=source==="lista-3"?"news":source==="lista-4"?"sports":SPORTS.test(name+" "+group)?"sports":NEWS.test(name+" "+group)?"news":"other";
    var premium=PREMIUM.test(name),k=code+"|"+lower(name),orig=dedupe[k];
    if(orig){if(!orig.premium&&orig.urls.length<3&&!has(orig.urls,ln))orig.urls.push(ln);continue;}
    var item={id:source+":"+k,source:source,name:name,code:code,genre:genre,group:group,premium:premium,urls:premium?[]:[ln]};
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
function drawCountries(){
  var area=D("country-items");clear(area);
  for(var i=0;i<COUNTRY.length;i++){(function(c){
    var btn=E("button","country-btn"+(country===c[0]?" active":""),c[1]);
    btn.type="button";btn.setAttribute("data-country",c[0]);
    on(btn,"click",function(){
      if(country===c[0])return;
      country=c[0];limit=60;drawCountries();
      selectNewCountryFocus(c[0]);
      if(source==="lista-2")loadChannels();else renderChannels();
    });
    area.appendChild(btn);
  }(COUNTRY[i]));}
}
function drawCategories(){
  var area=D("category-items"),btns=area.getElementsByTagName("button");
  for(var i=0;i<btns.length;i++){
    var b=btns[i];
    b.className="filter-btn"+(b.getAttribute("data-category")===category?" active":"");
  }
}
function refresh(){
  cache={};loadChannels();
}
function findNamed(term){
  var needsLoad=source!=="lista-2"||country!=="BR"||!channels.length;
  source="lista-2";country="BR";category="all";search=lower(term);limit=60;
  D("search").value=term;
  T(D("head-source"),sourceName());
  drawSources();drawCountries();drawCategories();
  if(needsLoad)loadChannels();else renderChannels();
}
function findGlobo(){findNamed("Globo");}
function selectSource(id){
  if(source===id&&channels.length)return;
  source=id;country=id==="lista-2"?"BR":"ALL";
  category="all";search="";D("search").value="";limit=60;
  T(D("head-source"),sourceName());
  drawSources();drawCountries();drawCategories();
  selectNewSourceFocus(id);
  loadChannels();
}
function loadChannels(){
  serial++;var seq=serial,code=source==="lista-2"?country:"ALL";
  var cacheKey=source+":"+code;
  T(D("catalog-title"),sourceName().replace(/^Lista\s*\d+\s*•\s*/,""));
  T(D("catalog-subtitle"),country==="ALL"?"Todos os países":countryName(country));
  T(D("catalog-status"),"Carregando canais…");
  T(D("result-count"),"Carregando");
  clear(D("channel-items"));visibleEl(D("show-more"),false);
  if(cache[cacheKey]){
    channels=cache[cacheKey];T(D("catalog-status"),"Catálogo público · sinais não verificados");renderChannels();return;
  }
  http("/stream/catalog?list="+encodeURIComponent(source)+"&country="+encodeURIComponent(code),function(st,body){
    if(seq!==serial)return;
    if(st!==200){
      channels=[];renderChannels();
      T(D("catalog-status"),"A fonte não carregou nesta TV (erro "+st+"). Tente Atualizar ou escolha outra lista.");
      return;
    }
    channels=parse(body,source==="lista-2"&&code!=="ALL"?code:"ALL");
    cache[cacheKey]=channels;
    T(D("catalog-status"),"Lista pública · reprodução ainda não verificada nesta TV.");
    renderChannels();
  });
}
function fits(c){
  if(country!=="ALL" && source!=="lista-2" && c.code!==country)return false;
  if(country==="OTHER" && source==="lista-2" && c.code!=="OTHER")return false;
  if(category!=="all"&&category!=="fav"&&c.genre!==category)return false;
  if(category==="fav"&&!has(favorites,favorKey(c)))return false;
  if(search && lower(c.name+" "+c.group).indexOf(search)<0)return false;
  return true;
}
function toggleFavorite(c){
  var k=favorKey(c),idx=favorites.indexOf(k);
  if(idx>=0)favorites.splice(idx,1);else favorites.push(k);
  saveFav();updateFavButton();renderChannels();
}
function updateFavButton(){
  var b=D("player-favorite");b.disabled=!selected;
  T(b,selected&&has(favorites,favorKey(selected))?"★ Favoritado":"☆ Favoritar");
}
function renderChannels(){
  var all=[],i,area=D("channel-items");clear(area);
  for(i=0;i<channels.length;i++)if(fits(channels[i]))all.push(channels[i]);
  all.sort(function(a,b){var x=lower(a.name),y=lower(b.name);return x<y?-1:x>y?1:0;});
  visible=all;
  T(D("result-count"),visible.length+" canais");
  if(!all.length){
    var emptyText=channels.length?"Nenhum canal neste filtro.":"Nenhum canal disponível nesta fonte.";
    if(search&&source==="lista-2"&&country==="BR")
      emptyText="Nenhum resultado para "+D("search").value+" nesta lista. Experimente escolher outra lista à esquerda.";
    area.appendChild(E("p","loading",emptyText));
  }
  for(i=0;i<all.length&&i<limit;i++){(function(c,j){
    var row=E("div","channel-row"+(selected&&selected.id===c.id?" current":""));
    row.appendChild(E("span","channel-number",String(j+1)));
    var btn=E("button","channel-btn");btn.type="button";
    btn.appendChild(E("strong","",c.name));
    btn.appendChild(E("small","",countryName(c.code)+" · "+(c.genre==="news"?"Notícias":c.genre==="sports"?"Esportes":"Outros")+(c.premium?" · Acesso oficial necessário":"")));
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
function play(c){
  if(c.premium){
    try{video.pause();video.removeAttribute("src");video.load();}catch(e){}
    selected=c;T(D("now-name"),c.name);
    T(D("now-meta"),countryName(c.code)+" · Listado, sem autorização de transmissão verificada");
    T(D("play-status"),"Acesso oficial necessário");
    visibleEl(D("player-empty"),true);visibleEl(video,false);
    T(D("player-error"),"Este canal aparece numa lista pública, mas o link não comprova autorização. Use o serviço oficial ou a assinatura aplicável.");
    visibleEl(D("player-error"),true);
    D("player-retry").disabled=true;D("player-fullscreen").disabled=true;
    updateFavButton();renderChannels();focusChannelAfterRender(c.id,false);return;
  }
  selected=c;T(D("now-name"),c.name);
  T(D("now-meta"),countryName(c.code)+" · "+(c.group||"Ao vivo")+" · verificando reprodução…");
  T(D("play-status"),"Conectando…");updateFavButton();
  visibleEl(D("player-empty"),false);visibleEl(video,true);visibleEl(D("player-error"),false);
  D("player-retry").disabled=false;D("player-fullscreen").disabled=false;
  try{video.pause();video.src=c.urls[0];video.load();
    var task=video.play();
    if(task&&typeof task.catch==="function")task.catch(function(){T(D("player-error"),"Toque no Play do vídeo. A origem também pode bloquear reprodução nesta TV.");visibleEl(D("player-error"),true);});
  }catch(e){T(D("player-error"),"Formato ou sinal não suportado neste navegador Samsung.");visibleEl(D("player-error"),true);}
  renderChannels();
  focusChannelAfterRender(c.id,false);
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
  var nodes=col.querySelectorAll(".source-btn,.country-btn,.filter-btn,.channel-btn,.fav-btn,#search,#clear-search,#find-globo,#find-sportv,#find-espn,#globo-official,#refresh,#show-more,#player-favorite,#player-retry,#player-fullscreen,#video");
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
function init(){
  loadFav();initRemote();
  on(D("search"),"keyup",function(){search=lower(D("search").value);limit=60;renderChannels();});
  on(D("search"),"input",function(){search=lower(D("search").value);limit=60;renderChannels();});
  on(D("clear-search"),"click",function(){D("search").value="";search="";renderChannels();});
  on(D("refresh"),"click",refresh);
  on(D("find-globo"),"click",findGlobo);
  on(D("find-sportv"),"click",function(){findNamed("SporTV");});
  on(D("find-espn"),"click",function(){findNamed("ESPN");});
  on(D("show-more"),"click",function(){
    var next=visible[limit];
    limit+=60;renderChannels();
    if(next)focusChannelAfterRender(next.id,false);
  });
  on(D("player-favorite"),"click",function(){if(selected)toggleFavorite(selected);});
  on(D("player-retry"),"click",function(){if(selected)play(selected);});
  on(D("player-fullscreen"),"click",function(){
    var fn=video.requestFullscreen||video.webkitRequestFullscreen||video.webkitEnterFullscreen;
    if(fn)try{fn.call(video);}catch(e){}
  });
  on(video,"playing",function(){
    T(D("play-status"),"● Reproduzindo");
    if(selected&&!selected.premium)T(D("now-meta"),countryName(selected.code)+" · Reprodução confirmada nesta sessão");
    visibleEl(D("player-error"),false);
  });
  on(video,"error",function(){
    if(!selected||selected.premium)return;
    T(D("play-status"),"Sinal indisponível");
    T(D("player-error"),"O sinal não reproduziu nesta TV. Pode haver incompatibilidade de formato, bloqueio ou indisponibilidade.");
    visibleEl(D("player-error"),true);
  });
  var btns=D("category-items").getElementsByTagName("button");
  for(var i=0;i<btns.length;i++){(function(b){
    on(b,"click",function(){category=b.getAttribute("data-category");limit=60;drawCategories();renderChannels();});
  }(btns[i]));}
  http("/stream/session",function(code,body){
    if(code!==200||body.indexOf('"allowed":true')<0){
      visibleEl(D("tv-layout"),false);visibleEl(D("tv-error"),true);return;
    }
    session=true;
    http("/stream/listas/sources.json",function(st,raw){
      if(st!==200){T(D("catalog-status"),"Não foi possível abrir a biblioteca. Tente Atualizar.");return;}
      try{var d=JSON.parse(raw);SOURCES=d.sources||[];}catch(e){SOURCES=[];}
      var verified=[];for(var j=0;j<SOURCES.length;j++)if(/^lista-[1-7]$/.test(SOURCES[j].id))verified.push(SOURCES[j]);
      SOURCES=verified;drawSources();drawCountries();drawCategories();
      if(!SOURCES.length){T(D("catalog-status"),"Biblioteca sem fontes cadastradas.");return;}
      selectSource("lista-2");
    });
  });
}
init();
}());
