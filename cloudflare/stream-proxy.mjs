import {countryIndex,mergedCatalog,searchCatalog} from "./catalog-merge.mjs";
/**
 * Stream Now personal TV — independent password gate, no Zero Trust plan.
 * Password is held in Worker secret STREAM_ACCESS_PASSWORD, never shipped to
 * public GitHub Pages. Uses signed HttpOnly session cookies, expires in 7 days.
 * This worker does not handle /news or /TV.
 */
const ORIGIN="https://drivmatch.github.io/drivmatch-stream/";
const FILES={"/":"tv.html","/stream/":"index.html","/stream/index.html":"index.html",
  "/stream/stream.css":"stream.css","/stream/stream.js":"stream.js",
  "/stream/graphite.css":"streamnow-graphite.css",
  "/stream/brand.webp":"streamnow-brand.webp",
  "/stream/icon.webp":"streamnow-icon.webp",
  "/stream/stream-boot.js":"stream-boot.js","/stream/stream-tv.js":"stream-tv.js",
  "/stream/tv/":"tv.html","/stream/tv/index.html":"tv.html",
  "/stream/tv/tv.css":"tv.css","/stream/tv/tv.js":"tv.js",
  "/stream/listas/":"listas.html", "/stream/listas/index.html":"listas.html",
  "/stream/listas/listas.js":"listas.js", "/stream/listas/listas.css":"listas.css",
  "/stream/listas/sources.json":"playlist-sources.json",
  "/stream/listas/brasil-servicos.json":"brasil-servicos.json",
  "/stream/official-access.json":"official-access.json"};

const TV_SOURCE_URLS={
  "lista-1":"https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8",
  "lista-3":"https://iptv-org.github.io/iptv/categories/news.m3u",
  "lista-4":"https://iptv-org.github.io/iptv/categories/sports.m3u",
  "lista-5":"https://nexonic-technologies.github.io/nexonic-iptv/playlists/verified.m3u",
  "lista-6":"https://biskyt.github.io/legalFreeIPTVplaylist/live.m3u",
  "lista-7":"https://raw.githubusercontent.com/freecasthub/public-iptv/main/playlist.m3u",
  "lista-8":"https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_brazil.m3u8",
  "lista-9":"https://raw.githubusercontent.com/SamuelSantos-R/cattv-playlist/main/playlist/br.m3u",
  "lista-10":"https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_zz_movies.m3u8",
  "lista-11":"https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_zz_news_en.m3u8",
  "lista-12":"https://drivmatch.github.io/drivmatch-stream/daily-autopilot.m3u8",
  "lista-13":"https://iptv.coldopen.dev/channels.m3u",
  "lista-14":"https://broadcastatlas.com/official.m3u"
};
/* Lista 9: no known subscription-network links; HLS health is not a rights audit. */
const BR9_PUBLIC=new Set(["agrocanal","agrobrasil tv","bem mais tv","canal educacao","canal futura","canal gov","canal saude","canal do boi","canal uol","cultura fast","futura","istv","rede brasil","rede minas","rede ngt","rede vida","rede familia","sbt nacional","sesc tv","tv brasil","tv camara","tv cultura","tv justica","tv senado","tve rs","tve bahia","tv vicosa","tv gazeta","tv a critica","tv brasil oeste","tv cidade verde cuiaba","tv show fortaleza","tv comunitaria","tv sao raimundo","tv vila real","record news","tv guara","amazon sat","cindie tv","classique tv","mytime movie network"]);
function publicBrazilPlaylist(raw){
  const lines=String(raw||"").split(/\r?\n/),out=["#EXTM3U"];
  let ext="";
  for(const value of lines){
    const line=value.trim();
    if(line.startsWith("#EXTINF:")){ext=line;continue;}
    if(!ext||!line||line.startsWith("#"))continue;
    const match=/,([^,\r\n]+)$/.exec(ext);
    const name=match?match[1].normalize("NFD")
      .replace(/[\u0300-\u036f]/g,"").toLowerCase().trim():"";
    if(BR9_PUBLIC.has(name)&&/^https:\/\//i.test(line)&&/\.m3u8(?:[?#]|$)/i.test(line))
      out.push(ext,line);
    ext="";
  }
  return out.join("\n");
}
const TV_COUNTRIES=["br","pt","es","jp","cn","us","ar","uk","be","it","fr","de"];
async function curatedCatalogue(url,id){
  const body=await publicCatalogue(url);
  return id==="lista-9"?publicBrazilPlaylist(body):body;
}
async function publicCatalogue(address){
  const upstream=await fetch(address,{redirect:"follow",headers:{"Accept":"text/plain,application/x-mpegURL,*/*"}});
  if(!upstream.ok)throw Error("upstream unavailable");
  const size=Number(upstream.headers.get("content-length")||"0");
  if(size>6_000_000)throw Error("catalogue too large");
  const data=await upstream.text();
  if(data.length>6_000_000)throw Error("catalogue too large");
  return data;
}
const COOKIE="dm_stream_session", MAXAGE=604800, encoder=new TextEncoder();
const baseHeaders={"Cache-Control":"private, no-store",
  "X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY",
  "Referrer-Policy":"no-referrer",
  "Permissions-Policy":"camera=(), microphone=(), geolocation=()"};
const appHeaders={...baseHeaders,
  "Content-Security-Policy":"default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; "+
   "style-src 'self'; connect-src 'self' https:; media-src 'self' https: blob:; "+
   "worker-src blob:; img-src 'self' https: data:; "+
   "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.twitch.tv; frame-ancestors 'none'; "+
   "base-uri 'none'; form-action 'self'"};
function plain(status,msg){return new Response(msg,{status,
  headers:{...baseHeaders,"Content-Type":"text/plain; charset=utf-8"}});}
function loginPage(error=false,method="GET",pinMode=false,accountMode=false){
 const html=[
 '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">',
 '<meta name="viewport" content="width=device-width,initial-scale=1">',
 '<meta name="robots" content="noindex,nofollow,noarchive">',
 '<title>Stream Now · Entrar</title><link rel="icon" href="/stream/icon.webp" type="image/webp"><style>',
 '*{box-sizing:border-box}body{margin:0;min-height:100vh;background:linear-gradient(150deg,#141414,#080808 68%,#191919);color:#fff;display:grid;place-items:center;font-family:system-ui,-apple-system,sans-serif;padding:20px}',
 'main{width:min(440px,100%);padding:38px 30px;background:#191919;border:1px solid #494949;border-radius:24px}',
 '.eyebrow{font-size:.8rem;color:#e8e8e8;letter-spacing:1.6px;font-weight:750}',
 'h1{font-size:2rem;margin:14px 0}p{color:#bfbfbf;line-height:1.55}',
 'label{display:block;font-weight:650;margin:24px 0 8px}',
 'input{width:100%;font-size:1.1rem;border:1px solid #606060;border-radius:12px;padding:14px;background:#252525;color:#f6f6f6}',
 'button{width:100%;padding:15px;border:0;border-radius:12px;background:linear-gradient(110deg,#92001d,#d0002d);color:white;font-size:1rem;font-weight:700;margin-top:18px}',
 '.alert{color:#f0f0f0;font-weight:600}small{display:block;margin-top:20px;color:#bcbcbc}.brand-logo{display:block;width:min(250px,88%);height:auto;margin:0 auto 20px}.eyebrow{text-align:center}label{color:#f1f1f1}',
 '</style></head><body><main><img class="brand-logo" src="/stream/brand.webp" width="220" height="62" alt="Stream Now"><div class="eyebrow">STREAM NOW</div>',
 '<h1>Entrar</h1>',
 accountMode?'<p>Entre com o e-mail e a senha da sua conta.</p>':
 pinMode?'<p>Informe o PIN configurado para este dispositivo.</p>':
 '<p>Informe o código de acesso configurado.</p>',
 error?'<p role="alert" class="alert">'+(accountMode?'E-mail ou senha não reconhecidos.':pinMode?'PIN incorreto.':'Senha incorreta.')+' Tente novamente.</p>':'',
 '<form method="post" action="/stream/login">',
 accountMode?'<label for="email">E-mail</label><input id="email" type="email" name="email" autocomplete="username" inputmode="email" maxlength="254" required autofocus>':'',
 '<label for="password">'+(accountMode?'Senha':pinMode?'PIN de 8 números':'Senha de acesso')+'</label>',
 pinMode?'<input id="password" type="password" inputmode="numeric" pattern="[0-9]{8}" name="password" autocomplete="off" required autofocus maxlength="8">':
 '<input id="password" type="password" name="password" autocomplete="current-password" required autofocus maxlength="256">',
 '<button type="submit">Entrar</button></form>',
 '<small>Stream Now</small></main></body></html>'
 ].join("");
 return new Response(method==="HEAD"?null:html,{status:error?401:200,
 headers:{...baseHeaders,"Content-Type":"text/html; charset=utf-8",
 "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"}});
}
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"");
function decode64(s){try{
 if(!/^[A-Za-z0-9_-]+$/.test(s)||s.length>128)return null;
 return Uint8Array.from(atob(s.replaceAll("-","+").replaceAll("_","/")),c=>c.charCodeAt(0));
}catch{return null;}}
const signingKey=p=>crypto.subtle.importKey("raw",encoder.encode("dm-stream-cookie-v1:"+p),
 {name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
async function issueCookie(p,cookiePath="/stream"){
 const exp=Math.floor(Date.now()/1000)+MAXAGE;
 const raw="v1."+exp+"."+b64(crypto.getRandomValues(new Uint8Array(16)));
 const mac=await crypto.subtle.sign("HMAC",await signingKey(p),encoder.encode(raw));
 return COOKIE+"="+raw+"."+b64(new Uint8Array(mac))+
   "; Path="+cookiePath+"; Max-Age="+MAXAGE+"; HttpOnly; Secure; SameSite=Strict";
}
async function authenticated(request,p){
 const cookie=(request.headers.get("Cookie")||"").split(";").map(s=>s.trim())
   .find(s=>s.startsWith(COOKIE+"="));
 if(!cookie||cookie.length>500)return false;
 const m=/^v1\.(\d{10})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/
   .exec(cookie.slice(COOKIE.length+1));
 if(!m)return false;
 const now=Math.floor(Date.now()/1000),exp=Number(m[1]);
 if(!Number.isSafeInteger(exp)||exp<=now||exp>now+MAXAGE)return false;
 const sig=decode64(m[3]);if(!sig||sig.length!==32)return false;
 return crypto.subtle.verify("HMAC",await signingKey(p),sig,
   encoder.encode("v1."+m[1]+"."+m[2]));
}
async function samePassword(candidate,p){
 if(typeof candidate!=="string"||candidate.length>256)return false;
 const a=new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(candidate)));
 const b=new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(p)));
 let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
}
const USER_COOKIE="sn_account";
const ACCOUNT_TTL=86400;
function supabaseConfig(env){
  const base=env?.STREAM_SUPABASE_URL, key=env?.STREAM_SUPABASE_PUBLIC_KEY;
  if(typeof base!=="string"||typeof key!=="string"||key.length<15)return null;
  try{
    const u=new URL(base);
    if(u.protocol!=="https:"||!u.hostname.endsWith(".supabase.co")||u.username||u.password||u.search||u.hash)return null;
    return {url:u.origin,key};
  }catch{return null;}
}
async function verifySupabaseCredentials(env,email,password){
  const settings=supabaseConfig(env);
  if(!settings)throw Error("Supabase unavailable");
  if(typeof email!=="string"||email.length>254||!/^\S+@\S+\.\S+$/.test(email)
     ||typeof password!=="string"||password.length<1||password.length>256)return null;
  const resp=await fetch(settings.url+"/auth/v1/token?grant_type=password",{
    method:"POST",redirect:"error",
    headers:{"Content-Type":"application/json","apikey":settings.key,"Accept":"application/json"},
    body:JSON.stringify({email:email.trim(),password})
  });
  if(resp.status===400||resp.status===401||resp.status===422)return null;
  if(!resp.ok)throw Error("Supabase auth failed "+resp.status);
  const data=await resp.json();
  if(!data?.access_token||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(data?.user?.id||""))return null;
  return data.user.id.toLowerCase();
}
async function issueAccountCookie(secret,userId){
  const exp=Math.floor(Date.now()/1000)+ACCOUNT_TTL,nonce=b64(crypto.getRandomValues(new Uint8Array(16)));
  const raw="v2."+exp+"."+userId+"."+nonce;
  const mac=await crypto.subtle.sign("HMAC",await signingKey(secret),encoder.encode(raw));
  return USER_COOKIE+"="+raw+"."+b64(new Uint8Array(mac))+"; Path=/; Max-Age="+ACCOUNT_TTL+"; HttpOnly; Secure; SameSite=Strict";
}
async function authenticatedAccount(request,secret){
  const cookie=(request.headers.get("Cookie")||"").split(";").map(s=>s.trim())
    .find(s=>s.startsWith(USER_COOKIE+"="));
  if(!cookie||cookie.length>600)return false;
  const v=cookie.slice(USER_COOKIE.length+1);
  const m=/^v2\.(\d{10})\.([0-9a-f-]{36})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(v);
  if(!m)return false;
  const now=Math.floor(Date.now()/1000),exp=Number(m[1]);
  if(!Number.isSafeInteger(exp)||exp<=now||exp>now+ACCOUNT_TTL)return false;
  const sig=decode64(m[4]);
  if(!sig||sig.length!==32)return false;
  return crypto.subtle.verify("HMAC",await signingKey(secret),sig,encoder.encode("v2."+m[1]+"."+m[2]+"."+m[3]));
}
function goHome(url,cookie){
 return new Response(null,{status:303,headers:{...baseHeaders,
 "Location":new URL((url.hostname==="streamnow.pages.dev"||url.hostname==="streamnow-2o1.pages.dev")?"/":"/stream/",url.origin).toString(),
 ...(cookie?{"Set-Cookie":cookie}:{})}});
}
export default {async fetch(request,env){
 try{
 const url=new URL(request.url),host=url.hostname.toLowerCase();
 const preview=host==="drivmatch-stream-proxy.drivmatch.workers.dev";
 const pagesHost=host==="streamnow.pages.dev"||host==="streamnow-2o1.pages.dev";
 const localPlaylist=new URL("/daily-autopilot.m3u8",url.origin).toString();
 const tvUrls=pagesHost?{...TV_SOURCE_URLS,"lista-12":localPlaylist}:TV_SOURCE_URLS;
 const loadCatalogue=pagesHost?async (address,id)=>{
   if(address===localPlaylist){
     if(!env?.ASSETS)throw Error("Local catalogue unavailable");
     const res=await env.ASSETS.fetch(new Request(new URL("/daily-autopilot.m3u8",url.origin)));
     if(!res.ok)throw Error("Local catalogue unavailable");
     const data=await res.text();
     if(data.length>6_000_000)throw Error("Local catalogue too large");
     return data;
   }
   return curatedCatalogue(address,id);
 }:curatedCatalogue;
 if(host!=="drivmatch.com"&&!preview&&!pagesHost)return plain(404,"Not Found");
 const path=preview&&url.pathname==="/"?"/stream/":url.pathname;
 if(path!=="/stream/brand.webp"&&path!=="/stream/icon.webp"&&path!=="/"&&path!=="/daily-autopilot.m3u8"&&path!=="/stream"&&path!=="/stream/tv"&&path!=="/stream/listas"&&path!=="/stream/catalog"&&path!=="/stream/session"&&path!=="/stream/login"&&
    path!=="/stream/logout"&&path!=="/stream/countries"&&path!=="/stream/search"&&!Object.hasOwn(FILES,path))return plain(404,"Not Found");
 if((path==="/stream/tv"||path==="/stream/listas")&&
    (request.method==="GET"||request.method==="HEAD"))
   return Response.redirect(new URL(path+"/",url.origin),308);
 if(path==="/stream"&&(request.method==="GET"||request.method==="HEAD"))
   return Response.redirect(new URL("/stream/",url.origin),308);
 if(path==="/stream/brand.webp"||path==="/stream/icon.webp"){
   const assetFile=path==="/stream/icon.webp"?"streamnow-icon.webp":"streamnow-brand.webp";
   if(request.method!=="GET"&&request.method!=="HEAD")return plain(405,"Method Not Allowed");
   try{
     const response=pagesHost
       ?(env?.ASSETS?await env.ASSETS.fetch(new Request(new URL("/"+assetFile,url.origin),{method:request.method})):plain(503,"Asset missing"))
       :await fetch(ORIGIN+assetFile,{method:request.method,redirect:"manual"});
     if(!response.ok)return plain(502,"Logo temporarily unavailable");
     return new Response(request.method==="HEAD"?null:response.body,{status:200,headers:{
       "Content-Type":"image/webp","Cache-Control":"public,max-age=86400",
       "X-Content-Type-Options":"nosniff","Cross-Origin-Resource-Policy":"same-origin"}});
   }catch{return plain(502,"Logo temporarily unavailable");}
 }
 if(path==="/daily-autopilot.m3u8"){
   if(!pagesHost||!env?.ASSETS||(request.method!=="GET"&&request.method!=="HEAD"))return plain(404,"Not Found");
   try{
     const asset=await env.ASSETS.fetch(new Request(new URL("/daily-autopilot.m3u8",url.origin),{method:request.method}));
     if(!asset.ok)return plain(502,"Playlist temporarily unavailable");
     return new Response(request.method==="HEAD"?null:asset.body,{status:200,
       headers:{"Content-Type":"application/vnd.apple.mpegurl; charset=utf-8",
         "Cache-Control":"public,max-age=300","X-Content-Type-Options":"nosniff"}});
   }catch{return plain(502,"Playlist temporarily unavailable");}
 }
 const password=env?.STREAM_ACCESS_PASSWORD;
 if(typeof password!=="string"||password.length<16||password.length>256)
   return plain(503,"Acesso pessoal ainda não configurado.");
 const pin=env?.STREAM_TV_PIN;
 const pinMode=typeof pin==="string"&&pin.length>0;
 if(pinMode&&!/^[0-9]{8}$/.test(pin))return plain(503,"PIN pessoal mal configurado.");
 // Keep high-entropy original secret as the session HMAC signing key.
 // Bind each session to the current PIN so rotation expires older sessions.
 const sessionSecret=pagesHost?password+"::supabase::"+(env.STREAM_SUPABASE_URL||""):pinMode?password+"::tv-pin::"+pin:password;
 if(pagesHost&&!supabaseConfig(env))return plain(503,"Login com e-mail temporariamente indisponível.");
 if(path==="/stream/login"&&request.method==="POST"){
   // A valid private password is the sole credential for login.
   // Some mobile in-app browsers send Origin: null or a wrapper origin;
   // rejecting them here incorrectly blocks legitimate users.
   if(!(request.headers.get("Content-Type")||"").startsWith("application/x-www-form-urlencoded"))
     return plain(415,"Unsupported Media Type");
   if(Number(request.headers.get("Content-Length")||"0")>2048)return plain(413,"Payload Too Large");
   let submitted;
   try{
     const text=await request.text();
     if(text.length>2048)return plain(413,"Payload Too Large");
     submitted=new URLSearchParams(text).get("password");
   }catch{return plain(400,"Bad Request");}
   if(pagesHost){
     const origin=request.headers.get("Origin");
     if(origin&&origin!==url.origin)return plain(403,"Forbidden");
     const params=new URLSearchParams(text);
     const email=params.get("email");
     let userId;
     try{userId=await verifySupabaseCredentials(env,email,submitted);}
     catch{return plain(502,"Não foi possível validar o acesso. Tente novamente.");}
     if(!userId)return loginPage(true,"GET",false,true);
     return goHome(url,await issueAccountCookie(sessionSecret,userId));
   }
   if(pinMode){
     // Short numeric PIN requires an effective login limiter; deny if unavailable.
     if(!env?.STREAM_LOGIN_LIMITER?.limit)return plain(503,"Proteção de PIN indisponível.");
     let allowed;
     try{allowed=await env.STREAM_LOGIN_LIMITER.limit({key:"drivmatch-stream-private-pin"});}
     catch{return plain(503,"Proteção de PIN temporariamente indisponível.");}
     if(!allowed?.success)return plain(429,"Muitas tentativas. Aguarde um minuto e tente novamente.");
   }
   if(!await samePassword(submitted,pinMode?pin:password))return loginPage(true,"GET",pinMode);
   return goHome(url,await issueCookie(sessionSecret,pagesHost?"/":"/stream"));
 }
 if(path==="/stream/logout"&&request.method==="POST"){
   const origin=request.headers.get("Origin");
   if(origin&&origin!==url.origin)return plain(403,"Forbidden");
   return goHome(url,(pagesHost?USER_COOKIE:COOKIE)+"=; Path="+(pagesHost?"/":"/stream")+"; Max-Age=0; HttpOnly; Secure; SameSite=Strict");
 }
 if(request.method!=="GET"&&request.method!=="HEAD")
   return new Response("Method Not Allowed",{status:405,headers:{...baseHeaders,Allow:"GET, HEAD"}});
 if(!(pagesHost?await authenticatedAccount(request,sessionSecret):await authenticated(request,sessionSecret))){
   if(path==="/"||path==="/stream/"||path==="/stream/index.html"||path==="/stream/tv/"||
      path==="/stream/tv/index.html"||path==="/stream/listas/"||
      path==="/stream/listas/index.html"||path==="/stream/login")
     return loginPage(false,request.method,pagesHost?false:pinMode,pagesHost);
   return plain(403,"Autenticação necessária.");
 }
 if(path==="/stream/session")
   return new Response(request.method==="HEAD"?null:JSON.stringify({allowed:true}),{
     status:200,headers:{...appHeaders,"Content-Type":"application/json; charset=utf-8"}});
 if(path==="/stream/login")return Response.redirect(new URL("/stream/",url.origin),303);
 if(path==="/stream/countries"){
   if(url.searchParams.get("list")!=="lista-2")return plain(400,"Unsupported list");
   try{
     const result=await countryIndex(tvUrls,TV_COUNTRIES,loadCatalogue);
     return new Response(request.method==="HEAD"?null:JSON.stringify(result),{
       status:200,headers:{...appHeaders,"Content-Type":"application/json; charset=utf-8"}});
   }catch{return plain(502,"Country index temporarily unavailable");}
 }
 if(path==="/stream/search"){
   // Authenticated, bounded search of known sources; no arbitrary URL proxy.
   const q=(url.searchParams.get("q")||"").trim();
   if(q.length<2||q.length>60||!/^[\p{L}\p{N} ._+\-–—()'&]+$/u.test(q))
     return plain(400,"Invalid search query");
   try{
     const result=await searchCatalog(q,tvUrls,TV_COUNTRIES,loadCatalogue);
     return new Response(request.method==="HEAD"?null:result,{
       status:200,headers:{...appHeaders,"Content-Type":"text/plain; charset=utf-8"}});
   }catch{return plain(502,"Global search temporarily unavailable");}
 }
 if(path==="/stream/catalog"){
   // Private, fixed-list source catalog only. Never proxy arbitrary URLs or video.
   const list=url.searchParams.get("list");
   const code=(url.searchParams.get("country")||"").toLowerCase();
   try{
     let body;
     if(list==="lista-2"){
       if(!/^[a-z]{2}$/.test(code)&&code!=="all"&&code!=="other")
         return plain(400,"Unsupported country");
       body=await mergedCatalog(code.toUpperCase(),tvUrls,TV_COUNTRIES,loadCatalogue);
     }else if(Object.hasOwn(tvUrls,list||"")){
       body=await loadCatalogue(tvUrls[list],list);
        if(list==="lista-9")body=publicBrazilPlaylist(body);
     }else if(!list){
       // Keep compatibility with the earlier Samsung TV browser catalogue requests.
       if(!TV_COUNTRIES.includes(code))return plain(400,"Unsupported country");
       body=await publicCatalogue("https://iptv-org.github.io/iptv/countries/"+code+".m3u");
     }else return plain(400,"Unsupported list");
     if(body.length>9_000_000)return plain(502,"Catalogue too large");
     return new Response(request.method==="HEAD"?null:body,{
       status:200,headers:{...appHeaders,"Content-Type":"text/plain; charset=utf-8"}});
   }catch{return plain(502,"Catalogue temporarily unavailable");}
 }

 try{
   const file=FILES[path];
   const upstream=pagesHost
     ?(env?.ASSETS?await env.ASSETS.fetch(new Request(new URL("/"+file,url.origin),{method:request.method})):plain(503,"Pages assets missing"))
     :await fetch(ORIGIN+file,{method:request.method,redirect:"manual"});
   if(!upstream.ok)return plain(upstream.status===404?404:502,"Stream indisponível");
   const kind=file.endsWith(".js")?"text/javascript; charset=utf-8":
     file.endsWith(".css")?"text/css; charset=utf-8":
     file.endsWith(".json")?"application/json; charset=utf-8":
     file.endsWith(".webp")?"image/webp":"text/html; charset=utf-8";
   return new Response(request.method==="HEAD"?null:upstream.body,{
     status:200,headers:{...appHeaders,
       ...(file==="tv.html"?{"Referrer-Policy":"strict-origin-when-cross-origin"}:{}),
       "Content-Type":kind}});
 }catch{return plain(502,"Stream temporariamente indisponível");}
 }catch{return plain(503,"Stream Now temporariamente indisponível");}
}};