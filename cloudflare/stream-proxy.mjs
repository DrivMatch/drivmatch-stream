/**
 * DrivMatch Stream personal TV — independent password gate, no Zero Trust plan.
 * Password is held in Worker secret STREAM_ACCESS_PASSWORD, never shipped to
 * public GitHub Pages. Uses signed HttpOnly session cookies, expires in 7 days.
 * This worker does not handle /news or /TV.
 */
const ORIGIN="https://drivmatch.github.io/drivmatch-stream/";
const FILES={"/stream/":"index.html","/stream/index.html":"index.html",
  "/stream/stream.css":"stream.css","/stream/stream.js":"stream.js"};
const COOKIE="dm_stream_session", MAXAGE=604800, encoder=new TextEncoder();
const baseHeaders={"Cache-Control":"private, no-store",
  "X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY",
  "Referrer-Policy":"no-referrer",
  "Permissions-Policy":"camera=(), microphone=(), geolocation=()"};
const appHeaders={...baseHeaders,
  "Content-Security-Policy":"default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; "+
   "style-src 'self'; connect-src 'self' https:; media-src 'self' https: blob:; "+
   "worker-src blob:; img-src 'self' https: data:; frame-ancestors 'none'; "+
   "base-uri 'none'; form-action 'self'"};
function plain(status,msg){return new Response(msg,{status,
  headers:{...baseHeaders,"Content-Type":"text/plain; charset=utf-8"}});}
function loginPage(error=false,method="GET"){
 const html=[
 '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">',
 '<meta name="viewport" content="width=device-width,initial-scale=1">',
 '<meta name="robots" content="noindex,nofollow,noarchive">',
 '<title>DrivMatch Stream · Acesso pessoal</title><style>',
 '*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#f6f8fa;color:#091a2b;display:grid;place-items:center;font-family:system-ui,-apple-system,sans-serif;padding:20px}',
 'main{width:min(440px,100%);padding:38px 30px;background:white;border:1px solid #dfe6ed;border-radius:24px}',
 '.eyebrow{font-size:.8rem;color:#167ade;letter-spacing:1.6px;font-weight:750}',
 'h1{font-size:2rem;margin:14px 0}p{color:#536273;line-height:1.55}',
 'label{display:block;font-weight:650;margin:24px 0 8px}',
 'input{width:100%;font-size:1.1rem;border:1px solid #aabacb;border-radius:12px;padding:14px;background:#fff}',
 'button{width:100%;padding:15px;border:0;border-radius:12px;background:#091a2b;color:white;font-size:1rem;font-weight:700;margin-top:18px}',
 '.alert{color:#a81f25;font-weight:600}small{display:block;margin-top:20px;color:#667788}',
 '</style></head><body><main><div class="eyebrow">DRIVMATCH · ACESSO PESSOAL</div>',
 '<h1>Minha TV Internacional</h1><p>Digite sua senha particular para assistir aos canais.</p>',
 error?'<p role="alert" class="alert">Senha incorreta. Tente novamente.</p>':'',
 '<form method="post" action="/stream/login">',
 '<label for="password">Senha de acesso</label>',
 '<input id="password" type="password" name="password" autocomplete="current-password" required autofocus maxlength="256">',
 '<button type="submit">Entrar no Stream</button></form>',
 '<small>Área pessoal · DrivMatch Stream</small></main></body></html>'
 ].join("");
 return new Response(method==="HEAD"?null:html,{status:error?401:200,
 headers:{...baseHeaders,"Content-Type":"text/html; charset=utf-8",
 "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"}});
}
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"");
function decode64(s){try{
 if(!/^[A-Za-z0-9_-]+$/.test(s)||s.length>128)return null;
 return Uint8Array.from(atob(s.replaceAll("-","+").replaceAll("_","/")),c=>c.charCodeAt(0));
}catch{return null;}}
const signingKey=p=>crypto.subtle.importKey("raw",encoder.encode("dm-stream-cookie-v1:"+p),
 {name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
async function issueCookie(p){
 const exp=Math.floor(Date.now()/1000)+MAXAGE;
 const raw="v1."+exp+"."+b64(crypto.getRandomValues(new Uint8Array(16)));
 const mac=await crypto.subtle.sign("HMAC",await signingKey(p),encoder.encode(raw));
 return COOKIE+"="+raw+"."+b64(new Uint8Array(mac))+
   "; Path=/stream; Max-Age="+MAXAGE+"; HttpOnly; Secure; SameSite=Strict";
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
function goHome(url,cookie){
 return new Response(null,{status:303,headers:{...baseHeaders,
 "Location":new URL("/stream/",url.origin).toString(),
 ...(cookie?{"Set-Cookie":cookie}:{})}});
}
export default {async fetch(request,env){
 const url=new URL(request.url),host=url.hostname.toLowerCase();
 const preview=host==="drivmatch-stream-proxy.drivmatch.workers.dev";
 if(host!=="drivmatch.com"&&!preview)return plain(404,"Not Found");
 const path=preview&&url.pathname==="/"?"/stream/":url.pathname;
 if(path!=="/stream"&&path!=="/stream/session"&&path!=="/stream/login"&&
    path!=="/stream/logout"&&!Object.hasOwn(FILES,path))return plain(404,"Not Found");
 if(path==="/stream"&&(request.method==="GET"||request.method==="HEAD"))
   return Response.redirect(new URL("/stream/",url.origin),308);
 const password=env?.STREAM_ACCESS_PASSWORD;
 if(typeof password!=="string"||password.length<16||password.length>256)
   return plain(503,"Acesso pessoal ainda não configurado.");
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
   if(!await samePassword(submitted,password))return loginPage(true);
   return goHome(url,await issueCookie(password));
 }
 if(path==="/stream/logout"&&request.method==="POST"){
   const origin=request.headers.get("Origin");
   if(origin&&origin!==url.origin)return plain(403,"Forbidden");
   return goHome(url,COOKIE+"=; Path=/stream; Max-Age=0; HttpOnly; Secure; SameSite=Strict");
 }
 if(request.method!=="GET"&&request.method!=="HEAD")
   return new Response("Method Not Allowed",{status:405,headers:{...baseHeaders,Allow:"GET, HEAD"}});
 if(!await authenticated(request,password)){
   if(path==="/stream/"||path==="/stream/index.html"||path==="/stream/login")
     return loginPage(false,request.method);
   return plain(403,"Acesso pessoal não autorizado.");
 }
 if(path==="/stream/session")
   return new Response(request.method==="HEAD"?null:JSON.stringify({allowed:true}),{
     status:200,headers:{...appHeaders,"Content-Type":"application/json; charset=utf-8"}});
 if(path==="/stream/login")return Response.redirect(new URL("/stream/",url.origin),303);
 try{
   const file=FILES[path];
   const upstream=await fetch(ORIGIN+file,{method:request.method,redirect:"manual"});
   if(!upstream.ok)return plain(upstream.status===404?404:502,"Stream indisponível");
   const kind=file.endsWith(".js")?"text/javascript; charset=utf-8":
     file.endsWith(".css")?"text/css; charset=utf-8":"text/html; charset=utf-8";
   return new Response(request.method==="HEAD"?null:upstream.body,{
     status:200,headers:{...appHeaders,"Content-Type":kind}});
 }catch{return plain(502,"Stream temporariamente indisponível");}
}};