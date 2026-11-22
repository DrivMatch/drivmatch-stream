/* DrivMatch Stream • Samsung and older TV browser compatibility (ES5).
 * Private login stays server-side. Playback is attempted natively;
 * cataloguing is not proof that a stream will play or is licensed.
 */
(function () {
  "use strict";
  var byId = function (id) { return document.getElementById(id); };
  var countryDefs = [
    ["BR","Brasil"],["PT","Portugal"],["ES","Espanha"],["US","Estados Unidos"],
    ["AR","Argentina"],["JP","Japão"],["CN","China"],["UK","Reino Unido"],
    ["BE","Bélgica"],["IT","Itália"],["FR","França"],["DE","Alemanha"]
  ];
  var countries = [["ALL","Todos os países"]].concat(countryDefs);
  var genreSports = /sports?|esport|deport|futebol|football|soccer|calcio|sportivo/i;
  var genreNews = /news|not[ií]cias|noticiero|jornal|journal|nachrichten|nieuws|actualidad|informaci[oó]n/i;
  var premium = /\b(espn|premiere|combate|sky\s*sports?|bein\s*sports?|tnt\s*sports?|(?:spor\s*tv|sport\s*tv)|dazn|canal\+|fox\s*sports?|ppv|pay.per.view)\b/i;
  var country = "BR", category = "live", search = "", favoritesOnly = false;
  var channels = [], favorites = [], selected = null, limit = 60, playing = false;
  var favStore = "drivmatch-stream-favorites-v1";
  var cache = {};
  var video = byId("video");
  var serial = 0;

  function show(el, visible) { if(el){el.style.display = visible ? "" : "none";el.hidden = !visible;} }
  function text(el, value) { if(el){el.textContent = value;} }
  function make(tag, cls, value) {
    var el = document.createElement(tag);
    if(cls)el.className = cls;
    if(typeof value === "string")text(el,value);
    return el;
  }
  function empty(el) { while(el.firstChild)el.removeChild(el.firstChild); }
  function on(el,event,handler) { if(el && el.addEventListener)el.addEventListener(event,handler,false); }
  function req(url,done) {
    var x = new XMLHttpRequest();
    x.onreadystatechange = function () {
      if(x.readyState === 4)done(x.status,x.responseText || "");
    };
    x.onerror = function () { done(0,""); };
    try{x.open("GET",url,true);x.setRequestHeader("Accept","text/plain,application/json");x.send(null);}
    catch(e){done(0,"");}
  }
  function state(value,label) {
    var el=byId("player-state");
    if(el)el.setAttribute("data-state",value);
    text(byId("player-state-text"),label);
  }
  function status(s) { text(byId("catalog-status"),s); }
  function key(c) { return c.code+":"+c.name.toLowerCase().replace(/\s+/g," ").replace(/^\s+|\s+$/g,""); }
  function readFavorites() {
    try{
      var v=JSON.parse(localStorage.getItem(favStore)||"[]");
      return Object.prototype.toString.call(v)==="[object Array]"?v:[];
    }catch(e){return [];}
  }
  function contains(a,s) {for(var i=0;i<a.length;i++)if(a[i]===s)return true;return false;}
  function toggleFav(c) {
    if(!c)return;
    var k=key(c),i=favorites.indexOf(k);
    if(i>=0)favorites.splice(i,1);else favorites.push(k);
    try{localStorage.setItem(favStore,JSON.stringify(favorites));}catch(e){}
    updateNowFav();render();
  }
  function updateNowFav() {
    var el=byId("player-favorite"),chosen=selected&&contains(favorites,key(selected));
    if(!el)return;
    el.disabled=!selected;
    text(el,chosen?"★":"☆");
    el.className="icon-button"+(chosen?" is-favorite":"");
  }
  function parsePlaylist(raw,code) {
    var lines=raw.split(/\r?\n/),list=[],inf="",found={};
    for(var i=0;i<lines.length;i++){
      var line=lines[i].replace(/^\s+|\s+$/g,"");
      if(line.indexOf("#EXTINF:")===0){inf=line;continue;}
      if(!inf || !line || line.charAt(0)==="#")continue;
      var idx=inf.lastIndexOf(","),name=idx>=0?inf.substring(idx+1).replace(/^\s+|\s+$/g,""):"";
      var group=(/group-title="([^"]*)"/i.exec(inf)||[])[1]||"";
      inf="";
      if(!name || /\[(?:geo.blocked|blocked)\]/i.test(name))continue;
      var needsOfficial=premium.test(name);
      if(!/^https:\/\//i.test(line) || !/\.m3u8(?:[?#]|$)/i.test(line))continue;
      var genre=genreSports.test(name+" "+group)?"sports":genreNews.test(name+" "+group)?"news":"general";
      var dedupe=code+":"+name.toLowerCase();
      if(found[dedupe])continue;
      found[dedupe]=true;
      list.push({code:code,name:name,genre:genre,premium:needsOfficial,url:needsOfficial?"":line});
    }
    return list;
  }
  function appendCountrySelector() {
    var area=byId("countries");empty(area);
    for(var i=0;i<countries.length;i++){
      (function (c) {
        var btn=make("button",c[0]===country?"chosen":"",c[1]);
        btn.type="button";
        btn.setAttribute("data-country",c[0]);
        on(btn,"click",function () {
          country=c[0];limit=60;
          appendCountrySelector();loadCountry();
        });
        area.appendChild(btn);
      }(countries[i]));
    }
  }
  function updateCategoryButtons() {
    var area=byId("categories"),btns=area.getElementsByTagName("button");
    for(var i=0;i<btns.length;i++){
      var b=btns[i],k=b.getAttribute("data-category");
      b.className=((k && k===category) ||
        (b.id==="favorites-only" && favoritesOnly))?"chosen":"";
    }
  }
  function bindFilters() {
    var area=byId("categories"),btns=area.getElementsByTagName("button");
    for(var i=0;i<btns.length;i++){
      (function (b){
        on(b,"click",function () {
          var k=b.getAttribute("data-category");
          if(k){category=k;favoritesOnly=false;}
          else if(b.id==="favorites-only"){favoritesOnly=!favoritesOnly;category="live";}
          updateCategoryButtons();limit=60;render();
        });
      }(btns[i]));
    }
    on(byId("search"),"input",function () {
      search=byId("search").value.toLowerCase();limit=60;show(byId("clear-search"),!!search);render();
    });
    on(byId("search"),"keyup",function () {
      search=byId("search").value.toLowerCase();limit=60;show(byId("clear-search"),!!search);render();
    });
    on(byId("clear-search"),"click",function () {
      byId("search").value="";search="";limit=60;show(byId("clear-search"),false);render();
    });
    on(byId("more-channels"),"click",function (){limit+=60;render();});
    on(byId("refresh-channels"),"click",function (){
      cache={};loadCountry();
    });
    on(byId("player-favorite"),"click",function (){toggleFav(selected);});
    on(byId("retry-channel"),"click",function (){if(selected)playChannel(selected);});
    on(byId("full-screen"),"click",function () {
      var fn=video.requestFullscreen||video.webkitRequestFullscreen||video.webkitEnterFullscreen;
      if(fn)try{fn.call(video);}catch(e){}
    });
    on(video,"playing",function () {
      playing=true;state("playing","Reproduzindo");
      text(byId("current-country"),countryName(selected.code)+" · Reprodução confirmada nesta sessão");
      show(byId("player-error"),false);
    });
    on(video,"error",function () {
      if(!selected)return;
      state("failed","Sinal indisponível");
      text(byId("player-error"),"Este canal não reproduziu nesta TV. Pode existir bloqueio regional, formato incompatível ou indisponibilidade da fonte.");
      show(byId("player-error"),true);
    });
    on(video,"waiting",function () {
      if(selected && playing)state("loading","Carregando vídeo");
    });
  }
  function countryName(code) {
    for(var i=0;i<countryDefs.length;i++)if(countryDefs[i][0]===code)return countryDefs[i][1];
    return code;
  }
  function showError(msg) {
    text(byId("player-error"),msg);show(byId("player-error"),true);
  }
  function playChannel(c) {
    if(c.premium){
      try{video.pause();video.removeAttribute("src");video.load();}catch(e){}
      selected=c;playing=false;
      text(byId("current-channel"),c.name);
      text(byId("current-country"),"Catálogo público · acesso oficial necessário");
      state("failed","Acesso oficial necessário");updateNowFav();
      show(video,false);show(byId("screen-message"),true);
      byId("full-screen").disabled=true;byId("retry-channel").disabled=true;
      showError("Canal listado, mas link sem autorização comprovada. Use o serviço oficial ou a assinatura aplicável.");
      render();return;
    }
    selected=c;playing=false;
    text(byId("current-channel"),c.name);
    text(byId("current-country"),countryName(c.code)+" · Verificando sinal…");
    state("loading","Conectando");
    updateNowFav();
    show(byId("screen-message"),false);
    show(video,true);
    byId("full-screen").disabled=false;
    byId("retry-channel").disabled=false;
    show(byId("player-error"),false);
    try{
      video.pause();video.removeAttribute("src");
      video.src=c.url;
      video.load();
      if(video.play){
        var result=video.play();
        if(result && typeof result.catch==="function"){
          result.catch(function(){if(selected===c)showError("Selecione Play no vídeo para iniciar a transmissão.");});
        }
      }
    }catch(e){showError("O navegador desta TV não suporta esta reprodução. Experimente outro canal.");}
    render();
  }
  function render() {
    var area=byId("channels");empty(area);
    show(byId("ppv-notice"),category==="ppv");
    if(category==="ppv"){
      text(byId("result-count"),"0 eventos");
      show(byId("more-channels"),false);
      return;
    }
    var visible=[];
    for(var i=0;i<channels.length;i++){
      var c=channels[i];
      if(category!=="live" && c.genre!==category)continue;
      if(favoritesOnly&&!contains(favorites,key(c)))continue;
      if(search && c.name.toLowerCase().indexOf(search)===-1)continue;
      visible.push(c);
    }
    visible.sort(function (a,b) {return a.name.localeCompare(b.name);});
    text(byId("result-count"),visible.length+" opções");
    var count=Math.min(visible.length,limit);
    for(var j=0;j<count;j++){
      (function (c) {
        var row=make("div","channel"+(selected===c?" active":""));
        var avatar=make("span","channel-avatar",c.name.substring(0,2).toUpperCase());
        avatar.setAttribute("aria-hidden","true");
        var pick=make("button","pick");
        pick.type="button";
        var title=make("strong","",c.name);
        var meta=make("small","",countryName(c.code)+" · "+
          (c.genre==="sports"?"Esportes":c.genre==="news"?"Notícias":"Geral")+
          (c.premium?" · Acesso oficial necessário":" · Sinal não verificado"));
        pick.appendChild(title);pick.appendChild(meta);
        on(pick,"click",function (){playChannel(c);});
        var favorite=contains(favorites,key(c));
        var fav=make("button","fav"+(favorite?" marked":""),favorite?"★":"☆");
        fav.type="button";
        fav.setAttribute("aria-label",(favorite?"Remover favorito ":"Favoritar ")+c.name);
        on(fav,"click",function (){toggleFav(c);});
        row.appendChild(avatar);row.appendChild(pick);row.appendChild(fav);
        area.appendChild(row);
      }(visible[j]));
    }
    if(!visible.length){
      var emptyMessage=make("p","status",channels.length?"Nenhum canal encontrado neste filtro.":"Nenhum canal encontrado nesta lista.");
      area.appendChild(emptyMessage);
    }
    show(byId("more-channels"),visible.length>limit);
    text(byId("more-channels"),"Mostrar mais canais ("+Math.min(60,visible.length-limit)+")");
  }
  function loadCountry() {
    var code=country==="ALL"?"BR":country;
    serial++;
    var n=serial;
    status("Carregando canais de "+countryName(code)+"…");
    text(byId("result-count"),"Carregando…");
    empty(byId("channels"));
    if(country==="ALL"){
      status("Modo TV: selecione um país para ver a lista. Brasil mostrado inicialmente.");
    }
    if(cache[code]){channels=cache[code];status("Canais catalogados, não verificados");render();return;}
    req("./catalog?country="+encodeURIComponent(code),function (codeStatus,raw){
      if(n!==serial)return;
      if(codeStatus!==200){
        channels=[];render();
        status("Não foi possível carregar esta lista na TV ("+codeStatus+"). Tente Atualizar.");
        return;
      }
      channels=parsePlaylist(raw,code);
      cache[code]=channels;
      status("Catálogo público · reprodução depende do sinal e desta TV");
      render();
    });
  }
  function init() {
    document.body.className+=(document.body.className?" ":"")+"tv-legacy";
    byId("search").setAttribute("placeholder","Buscar canal nesta lista…");
    byId("gate-message").textContent="Verificando sessão na Samsung TV…";
    req("./session",function (code,body) {
      if(code!==200 || body.indexOf('"allowed":true')<0){
        text(byId("gate-message"),
          "A sessão desta TV não foi confirmada. Abra novamente /stream/ e digite seu PIN de 8 números.");
        return;
      }
      show(byId("gate"),false);show(byId("tv"),true);
      favorites=readFavorites();
      appendCountrySelector();
      bindFilters();
      updateNowFav();
      updateCategoryButtons();
      loadCountry();
    });
  }
  init();
}());
