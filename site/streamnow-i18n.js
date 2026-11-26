/* Stream Now — ES5-compatible interface localization.
 * Does not touch channel metadata, catalog URLs, account sessions or favorites.
 * Dynamic messages without vetted translations remain in their original language.
 */
(function(){
"use strict";
var TEXT={
 "pt": {
  "countries": "Países e categorias",
  "guideMobile": "Guia e busca",
  "recent": "RECÉM VISITADO",
  "favorites": "FAVORITOS",
  "home": "Início",
  "countriesChannels": "01 · PAÍSES E CANAIS",
  "guide": "02 · GUIA DE CANAIS",
  "chooseCountry": "Escolha um país",
  "countryHelp": "Clique em um país à esquerda para abrir os canais.",
  "all": "Todos",
  "news": "Notícias",
  "sports": "Esportes",
  "other": "Outros",
  "favoriteFilter": "★ Favoritos",
  "searchPlaceholder": "Buscar em todos os países e listas…",
  "waiting": "Aguardando seleção",
  "refresh": "↻ Atualizar",
  "loading": "Carregando biblioteca…",
  "more": "Mostrar mais canais",
  "playback": "▶ REPRODUÇÃO",
  "ready": "Pronto",
  "chooseChannel": "Escolha um canal",
  "channelHelp": "A transmissão aparece aqui.",
  "guideRemains": "O guia permanece visível ao lado.",
  "now": "AGORA NA TELA",
  "none": "Nenhum canal selecionado",
  "selectFromGuide": "Escolha um canal na coluna da esquerda ou no guia.",
  "favoriteAction": "☆ Favoritar",
  "reload": "↻ Recarregar",
  "fullscreen": "⛶ Tela cheia",
  "official": "Abrir transmissão no site oficial",
  "provider": "▸ Plataformas por assinatura",
  "technical": "▸ Fontes técnicas (listas)",
  "backup": "↓ Fazer backup dos meus favoritos",
  "loginNeeded": "Acesso pessoal necessário",
  "login": "Entrar no Stream Now",
  "lang": "Idioma"
 },
 "en": {
  "countries": "Countries & Categories",
  "guideMobile": "Guide & Search",
  "recent": "RECENTLY VIEWED",
  "favorites": "FAVORITES",
  "home": "Home",
  "countriesChannels": "01 · COUNTRIES & CHANNELS",
  "guide": "02 · CHANNEL GUIDE",
  "chooseCountry": "Choose a country",
  "countryHelp": "Choose a country on the left to view channels.",
  "all": "All",
  "news": "News",
  "sports": "Sports",
  "other": "Other",
  "favoriteFilter": "★ Favorites",
  "searchPlaceholder": "Search all countries and lists…",
  "waiting": "Waiting for selection",
  "refresh": "↻ Refresh",
  "loading": "Loading library…",
  "more": "Show more channels",
  "playback": "▶ PLAYBACK",
  "ready": "Ready",
  "chooseChannel": "Choose a channel",
  "channelHelp": "The stream appears here.",
  "guideRemains": "The guide stays visible alongside.",
  "now": "NOW PLAYING",
  "none": "No channel selected",
  "selectFromGuide": "Choose a channel from the left column or the guide.",
  "favoriteAction": "☆ Favorite",
  "reload": "↻ Reload",
  "fullscreen": "⛶ Fullscreen",
  "official": "Open stream on official website",
  "provider": "▸ Subscription platforms",
  "technical": "▸ Technical sources (lists)",
  "backup": "↓ Back up my favorites",
  "loginNeeded": "Personal access required",
  "login": "Sign in to Stream Now",
  "lang": "Language"
 },
 "es": {
  "countries": "Países y categorías",
  "guideMobile": "Guía y búsqueda",
  "recent": "VISTOS RECIENTEMENTE",
  "favorites": "FAVORITOS",
  "home": "Inicio",
  "countriesChannels": "01 · PAÍSES Y CANALES",
  "guide": "02 · GUÍA DE CANALES",
  "chooseCountry": "Elige un país",
  "countryHelp": "Elige un país a la izquierda para ver los canales.",
  "all": "Todos",
  "news": "Noticias",
  "sports": "Deportes",
  "other": "Otros",
  "favoriteFilter": "★ Favoritos",
  "searchPlaceholder": "Buscar en todos los países y listas…",
  "waiting": "Esperando selección",
  "refresh": "↻ Actualizar",
  "loading": "Cargando biblioteca…",
  "more": "Mostrar más canales",
  "playback": "▶ REPRODUCCIÓN",
  "ready": "Listo",
  "chooseChannel": "Elige un canal",
  "channelHelp": "La transmisión aparece aquí.",
  "guideRemains": "La guía permanece visible al lado.",
  "now": "EN PANTALLA",
  "none": "Ningún canal seleccionado",
  "selectFromGuide": "Elige un canal de la columna izquierda o la guía.",
  "favoriteAction": "☆ Favorito",
  "reload": "↻ Recargar",
  "fullscreen": "⛶ Pantalla completa",
  "official": "Abrir transmisión en el sitio oficial",
  "provider": "▸ Plataformas de suscripción",
  "technical": "▸ Fuentes técnicas (listas)",
  "backup": "↓ Guardar copia de mis favoritos",
  "loginNeeded": "Se requiere acceso personal",
  "login": "Entrar en Stream Now",
  "lang": "Idioma"
 },
 "fr": {
  "countries": "Pays et catégories",
  "guideMobile": "Guide et recherche",
  "recent": "VUS RÉCEMMENT",
  "favorites": "FAVORIS",
  "home": "Accueil",
  "countriesChannels": "01 · PAYS ET CHAÎNES",
  "guide": "02 · GUIDE DES CHAÎNES",
  "chooseCountry": "Choisissez un pays",
  "countryHelp": "Choisissez un pays à gauche pour afficher les chaînes.",
  "all": "Tous",
  "news": "Actualités",
  "sports": "Sports",
  "other": "Autres",
  "favoriteFilter": "★ Favoris",
  "searchPlaceholder": "Rechercher dans tous les pays et listes…",
  "waiting": "En attente de sélection",
  "refresh": "↻ Actualiser",
  "loading": "Chargement de la bibliothèque…",
  "more": "Afficher plus de chaînes",
  "playback": "▶ LECTURE",
  "ready": "Prêt",
  "chooseChannel": "Choisissez une chaîne",
  "channelHelp": "La diffusion apparaît ici.",
  "guideRemains": "Le guide reste visible à côté.",
  "now": "À L’ÉCRAN",
  "none": "Aucune chaîne sélectionnée",
  "selectFromGuide": "Choisissez une chaîne à gauche ou dans le guide.",
  "favoriteAction": "☆ Favori",
  "reload": "↻ Recharger",
  "fullscreen": "⛶ Plein écran",
  "official": "Ouvrir le flux sur le site officiel",
  "provider": "▸ Plateformes payantes",
  "technical": "▸ Sources techniques (listes)",
  "backup": "↓ Sauvegarder mes favoris",
  "loginNeeded": "Accès personnel requis",
  "login": "Se connecter à Stream Now",
  "lang": "Langue"
 },
 "de": {
  "countries": "Länder und Kategorien",
  "guideMobile": "Programmübersicht und Suche",
  "recent": "ZULETZT ANGESEHEN",
  "favorites": "FAVORITEN",
  "home": "Startseite",
  "countriesChannels": "01 · LÄNDER UND SENDER",
  "guide": "02 · SENDERÜBERSICHT",
  "chooseCountry": "Land auswählen",
  "countryHelp": "Links ein Land auswählen, um Sender anzuzeigen.",
  "all": "Alle",
  "news": "Nachrichten",
  "sports": "Sport",
  "other": "Andere",
  "favoriteFilter": "★ Favoriten",
  "searchPlaceholder": "Alle Länder und Listen durchsuchen…",
  "waiting": "Warte auf Auswahl",
  "refresh": "↻ Aktualisieren",
  "loading": "Bibliothek wird geladen…",
  "more": "Weitere Sender anzeigen",
  "playback": "▶ WIEDERGABE",
  "ready": "Bereit",
  "chooseChannel": "Sender auswählen",
  "channelHelp": "Der Stream erscheint hier.",
  "guideRemains": "Die Übersicht bleibt daneben sichtbar.",
  "now": "JETZT AUF DEM BILDSCHIRM",
  "none": "Kein Sender ausgewählt",
  "selectFromGuide": "Sender links oder in der Übersicht auswählen.",
  "favoriteAction": "☆ Favorit",
  "reload": "↻ Neu laden",
  "fullscreen": "⛶ Vollbild",
  "official": "Stream auf der offiziellen Website öffnen",
  "provider": "▸ Abo-Plattformen",
  "technical": "▸ Technische Quellen (Listen)",
  "backup": "↓ Meine Favoriten sichern",
  "loginNeeded": "Persönlicher Zugriff erforderlich",
  "login": "Bei Stream Now anmelden",
  "lang": "Sprache"
 },
 "it": {
  "countries": "Paesi e categorie",
  "guideMobile": "Guida e ricerca",
  "recent": "VISTI DI RECENTE",
  "favorites": "PREFERITI",
  "home": "Home",
  "countriesChannels": "01 · PAESI E CANALI",
  "guide": "02 · GUIDA CANALI",
  "chooseCountry": "Scegli un paese",
  "countryHelp": "Scegli un paese a sinistra per vedere i canali.",
  "all": "Tutti",
  "news": "Notizie",
  "sports": "Sport",
  "other": "Altri",
  "favoriteFilter": "★ Preferiti",
  "searchPlaceholder": "Cerca in tutti i paesi e le liste…",
  "waiting": "In attesa di selezione",
  "refresh": "↻ Aggiorna",
  "loading": "Caricamento libreria…",
  "more": "Mostra altri canali",
  "playback": "▶ RIPRODUZIONE",
  "ready": "Pronto",
  "chooseChannel": "Scegli un canale",
  "channelHelp": "Lo streaming appare qui.",
  "guideRemains": "La guida rimane visibile accanto.",
  "now": "ORA SULLO SCHERMO",
  "none": "Nessun canale selezionato",
  "selectFromGuide": "Scegli un canale a sinistra o nella guida.",
  "favoriteAction": "☆ Preferito",
  "reload": "↻ Ricarica",
  "fullscreen": "⛶ Schermo intero",
  "official": "Apri lo streaming sul sito ufficiale",
  "provider": "▸ Piattaforme in abbonamento",
  "technical": "▸ Fonti tecniche (liste)",
  "backup": "↓ Salva i miei preferiti",
  "loginNeeded": "Accesso personale richiesto",
  "login": "Accedi a Stream Now",
  "lang": "Lingua"
 },
 "ja": {
  "countries": "国とカテゴリー",
  "guideMobile": "ガイドと検索",
  "recent": "最近見たチャンネル",
  "favorites": "お気に入り",
  "home": "ホーム",
  "countriesChannels": "01 · 国とチャンネル",
  "guide": "02 · チャンネルガイド",
  "chooseCountry": "国を選択",
  "countryHelp": "左側の国を選択してチャンネルを表示します。",
  "all": "すべて",
  "news": "ニュース",
  "sports": "スポーツ",
  "other": "その他",
  "favoriteFilter": "★ お気に入り",
  "searchPlaceholder": "すべての国とリストを検索…",
  "waiting": "選択待ち",
  "refresh": "↻ 更新",
  "loading": "ライブラリを読み込み中…",
  "more": "チャンネルをもっと表示",
  "playback": "▶ 再生",
  "ready": "準備完了",
  "chooseChannel": "チャンネルを選択",
  "channelHelp": "配信はここに表示されます。",
  "guideRemains": "ガイドは横に表示されます。",
  "now": "再生中",
  "none": "チャンネル未選択",
  "selectFromGuide": "左の列またはガイドからチャンネルを選択してください。",
  "favoriteAction": "☆ お気に入り",
  "reload": "↻ 再読み込み",
  "fullscreen": "⛶ 全画面",
  "official": "公式サイトで配信を開く",
  "provider": "▸ 有料プラットフォーム",
  "technical": "▸ 技術的なソース（リスト）",
  "backup": "↓ お気に入りをバックアップ",
  "loginNeeded": "個人アクセスが必要です",
  "login": "Stream Now にログイン",
  "lang": "言語"
 },
 "nl": {
  "countries": "Landen en categorieën",
  "guideMobile": "Gids en zoeken",
  "recent": "RECENT BEKEKEN",
  "favorites": "FAVORIETEN",
  "home": "Home",
  "countriesChannels": "01 · LANDEN EN ZENDERS",
  "guide": "02 · ZENDERGIDS",
  "chooseCountry": "Kies een land",
  "countryHelp": "Kies links een land om zenders te bekijken.",
  "all": "Alles",
  "news": "Nieuws",
  "sports": "Sport",
  "other": "Overig",
  "favoriteFilter": "★ Favorieten",
  "searchPlaceholder": "Zoeken in alle landen en lijsten…",
  "waiting": "Wachten op selectie",
  "refresh": "↻ Vernieuwen",
  "loading": "Bibliotheek laden…",
  "more": "Meer zenders tonen",
  "playback": "▶ AFSPELEN",
  "ready": "Gereed",
  "chooseChannel": "Kies een zender",
  "channelHelp": "De stream verschijnt hier.",
  "guideRemains": "De gids blijft ernaast zichtbaar.",
  "now": "NU OP SCHERM",
  "none": "Geen zender geselecteerd",
  "selectFromGuide": "Kies een zender links of in de gids.",
  "favoriteAction": "☆ Favoriet",
  "reload": "↻ Opnieuw laden",
  "fullscreen": "⛶ Volledig scherm",
  "official": "Open stream op officiële website",
  "provider": "▸ Abonnementsplatforms",
  "technical": "▸ Technische bronnen (lijsten)",
  "backup": "↓ Back-up van mijn favorieten",
  "loginNeeded": "Persoonlijke toegang vereist",
  "login": "Inloggen bij Stream Now",
  "lang": "Taal"
 }
};
var LANGS={"pt":"Português","en":"English","es":"Español","fr":"Français","de":"Deutsch","it":"Italiano","ja":"日本語","nl":"Nederlands"};
var KEY="streamnow-ui-language-v1";
var ids={
"mobile-countries":"countries","mobile-guide":"guideMobile",
"home-link":"home","catalog-title":"chooseCountry","catalog-subtitle":"countryHelp",
"result-count":"waiting","refresh":"refresh","catalog-status":"loading",
"show-more":"more","play-status":"ready","now-name":"none",
"now-meta":"selectFromGuide","player-favorite":"favoriteAction",
"player-retry":"reload","player-fullscreen":"fullscreen",
"official-open":"official","export-favorites-backup":"backup"
};
var selectors={
".catalog-header .overline":"guide",
".player-caption span:first-child":"playback",
".now-playing .overline":"now",
".player-empty strong":"chooseChannel",
"#tv-error h2":"loginNeeded","#tv-error a":"login",
".filter-btn[data-category=all]":"all",
".filter-btn[data-category=news]":"news",
".filter-btn[data-category=sports]":"sports",
".filter-btn[data-category=other]":"other",
".filter-btn[data-category=fav]":"favoriteFilter",
"#provider-toggle":"provider","#technical-toggle":"technical"
};
var current="pt",working=false,observer=null;
function node(id){return document.getElementById(id);}
function saved(){
 try{var value=localStorage.getItem(KEY);if(value&&TEXT[value])return value;}catch(e){}
 var lang=String(navigator.language||navigator.userLanguage||"pt").split("-")[0].toLowerCase();
 return TEXT[lang]?lang:"pt";
}
function textFor(k,lang){return TEXT[lang]&&TEXT[lang][k]||TEXT.pt[k]||"";}
/* Never override dynamic text except when it equals one of our known literal labels.
 * This avoids changing catalog channel names, status/error detail or saved metadata.
 */
function applyLeaf(el,key){
 if(!el)return;
 var value=textFor(key,current),old=value;
 for(var lang in TEXT)if(Object.prototype.hasOwnProperty.call(TEXT,lang)&&
  el.textContent===TEXT[lang][key]){old=el.textContent;break;}
 if(el.textContent!==value&&
   (el.textContent===old||el.getAttribute("data-i18n-static")==="1")){
  el.textContent=value;
 }
}
function applyLabel(el,key){
 if(!el)return;
 var tokens=el.childNodes;
 for(var i=0;i<tokens.length;i++){
  var part=tokens[i];
  if(part.nodeType!==3)continue;
  var value=part.nodeValue.replace(/^\s+|\s+$/g,"");
  for(var lang in TEXT)if(TEXT[lang][key]===value){
   var leading=part.nodeValue.match(/^\s*/)[0],trailing=part.nodeValue.match(/\s*$/)[0];
   var next=leading+textFor(key,current)+trailing;
   if(part.nodeValue!==next)part.nodeValue=next;
   return;
  }
 }
}
function apply(){
 if(working)return;
 working=true;
 try{
  document.documentElement.lang=current==="pt"?"pt-BR":current;
  for(var id in ids)if(Object.prototype.hasOwnProperty.call(ids,id))
   applyLeaf(node(id),ids[id]);
  for(var sel in selectors)if(Object.prototype.hasOwnProperty.call(selectors,sel))
   applyLeaf(document.querySelector(sel),selectors[sel]);
  applyLabel(node("recent-toggle"),"recent");
  applyLabel(node("favorite-toggle"),"favorites");
  applyLabel(document.querySelector(".section-title"),"countriesChannels");
  var empty=document.querySelector(".player-empty p");
  if(empty){
   var parts=empty.childNodes;
   for(var j=0;j<parts.length;j++)
    if(parts[j].nodeType===3){
     for(var key in TEXT.pt){
      if(key!=="channelHelp"&&key!=="guideRemains")continue;
      var raw=parts[j].nodeValue.trim();
      for(var code in TEXT)if(raw===TEXT[code][key]){
       var next=textFor(key,current);
       if(parts[j].nodeValue!==next)parts[j].nodeValue=next;
      }
     }
    }
  }
  var input=node("search");if(input)input.placeholder=textFor("searchPlaceholder",current);
  var language=node("streamnow-language");
  if(language){language.value=current;language.setAttribute("aria-label",textFor("lang",current));language.title=textFor("lang",current);}
 }finally{working=false;}
}
function setLanguage(next){
 if(!TEXT[next])return;
 current=next;
 try{localStorage.setItem(KEY,current);}catch(e){}
 apply();
}
function setup(){
 current=saved();
 var select=node("streamnow-language");
 if(select){
  for(var code in LANGS)if(Object.prototype.hasOwnProperty.call(LANGS,code)){
   var option=document.createElement("option");option.value=code;
   option.appendChild(document.createTextNode(LANGS[code]));select.appendChild(option);
  }
  select.value=current;
  select.onchange=function(){setLanguage(select.value);};
 }
 apply();
 // Only text labels are ever adjusted; page video/player/channel nodes are not replaced.
 if(typeof MutationObserver!=="undefined"){
  var root=node("tv-shell");if(root){
   observer=new MutationObserver(function(){apply();});
   observer.observe(root,{childList:true,characterData:true,subtree:true});
  }
 }
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setup);
else setup();
window.StreamNowI18n={getLanguage:function(){return current;},setLanguage:setLanguage,
 text:function(key){return textFor(key,current);}};
}());
