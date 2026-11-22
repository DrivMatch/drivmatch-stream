/* Tests: no-card private password gate, server-side cookie, route isolation. */
import assert from "node:assert/strict";
import test from "node:test";
import stream from "../cloudflare/stream-proxy.mjs";
const origin="https://drivmatch.com/stream/", preview="https://drivmatch-stream-proxy.drivmatch.workers.dev/stream/";
const password="test-passphrase-only-dont-use-in-production-123";
const env={STREAM_ACCESS_PASSWORD:password};
async function login(where=origin,passwordInput=password,headers={}){
 return stream.fetch(new Request(where+"login",{method:"POST",
   headers:{"Content-Type":"application/x-www-form-urlencoded",...headers},
   body:new URLSearchParams({password:passwordInput}).toString()}),env);
}
async function cookie(){const r=await login();assert.equal(r.status,303);return r.headers.get("set-cookie").split(";")[0];}
test("missing and short secrets deny all viewers",async()=>{
 for(const e of [{},{STREAM_ACCESS_PASSWORD:"1234"}]){
  const r=await stream.fetch(new Request(origin),e);
  assert.equal(r.status,503);
 }
});
test("login form exists on both permitted hosts",async()=>{
 for(const where of [origin,preview]){
  const r=await stream.fetch(new Request(where),env);
  assert.equal(r.status,200);assert.match(await r.text(),/Senha de acesso/);
 }
});
test("wrong password denied, no cookie",async()=>{
 const r=await login(origin,"wrong");assert.equal(r.status,401);
 assert.equal(r.headers.get("set-cookie"),null);
});
test("correct password issues secure signed cookie",async()=>{
 const r=await login();assert.equal(r.status,303);
 assert.equal(r.headers.get("location"),origin);
 assert.match(r.headers.get("set-cookie"),/HttpOnly; Secure; SameSite=Strict/);
});
test("session endpoint requires authentic cookie",async()=>{
 const no=await stream.fetch(new Request(origin+"session"),env);assert.equal(no.status,403);
 const yes=await stream.fetch(new Request(origin+"session",{headers:{Cookie:await cookie()}}),env);
 assert.equal(yes.status,200);assert.deepEqual(await yes.json(),{allowed:true});
});
test("forged headers never grant access",async()=>{
 const r=await stream.fetch(new Request(origin+"session",{headers:{"cf-access-authenticated-user-email":"drivmatch@proton.me"}}),env);
 assert.equal(r.status,403);
});
test("cookie tampering rejected",async()=>{
 const original=await cookie(),tweaked=original.slice(0,-2)+"ZZ";
 const r=await stream.fetch(new Request(origin+"session",{headers:{Cookie:tweaked}}),env);
 assert.equal(r.status,403);
});
test("password rotation revokes sessions",async()=>{
 const r=await stream.fetch(new Request(origin+"session",{headers:{Cookie:await cookie()}}),
 {STREAM_ACCESS_PASSWORD:"new-private-password-not-same-abcdef"});
 assert.equal(r.status,403);
});
test("authenticated viewer receives only the approved source files",async()=>{
 const c=await cookie(),before=globalThis.fetch,seen=[];
 try{
  globalThis.fetch=async u=>{seen.push(String(u));return new Response("ok",{status:200});};
  for(const path of ["","stream.js","stream.css"]){
   const res=await stream.fetch(new Request(origin+path,{headers:{Cookie:c}}),env);
   assert.equal(res.status,200);assert.equal(await res.text(),"ok");
  }
  assert.deepEqual(seen,["index.html","stream.js","stream.css"].map(f=>"https://drivmatch.github.io/drivmatch-stream/"+f));
 }finally{globalThis.fetch=before;}
});
test("news and original TV never routed",async()=>{
 const c=await cookie();
 for(const p of ["/news","/news/","/TV","/TV/","/stream-collision","/stream/config.js"]){
   const r=await stream.fetch(new Request("https://drivmatch.com"+p,{headers:{Cookie:c}}),env);
   assert.equal(r.status,404,p);
 }
});
test("mobile in-app browser Origin:null can sign in with private password",async()=>{
 const r=await login(preview,password,{Origin:"null"});
 assert.equal(r.status,303);
 assert.match(r.headers.get("set-cookie"),/HttpOnly/);
});
test("mobile wrapper Origin can sign in only with valid password",async()=>{
 const denied=await login(preview,"wrong",{Origin:"https://external-wrapper.example"});
 assert.equal(denied.status,401);
 assert.equal(denied.headers.get("set-cookie"),null);
 const allowed=await login(preview,password,{Origin:"https://external-wrapper.example"});
 assert.equal(allowed.status,303);
});
test("cross-origin logout remains denied",async()=>{
 const r=await stream.fetch(new Request(origin+"logout",{method:"POST",
 headers:{Origin:"https://attacker.example"}}),env);
 assert.equal(r.status,403);
});
test("logout expires cookie",async()=>{
 const r=await stream.fetch(new Request(origin+"logout",{method:"POST"}),env);
 assert.equal(r.status,303);assert.match(r.headers.get("set-cookie"),/Max-Age=0/);
});
test("unexpected methods denied",async()=>{
 const r=await stream.fetch(new Request(origin,{method:"PUT"}),env);
 assert.equal(r.status,405);
});

test("independent IPTV library is protected by the same signed session",async()=>{
 const entry=await stream.fetch(new Request(origin+"listas/"),env);
 assert.equal(entry.status,200);
 assert.match(await entry.text(),/Senha de acesso/);
 const denied=await stream.fetch(new Request(origin+"listas/sources.json"),env);
 assert.equal(denied.status,403);
 const c=await cookie(),before=globalThis.fetch,seen=[];
 try{
   globalThis.fetch=async url=>{
     seen.push(String(url));return new Response("mock",{status:200});
   };
   for(const [path,kind] of [
     ["listas/","text/html"],["listas/listas.js","text/javascript"],
     ["listas/listas.css","text/css"],["listas/sources.json","application/json"]
   ]){
     const r=await stream.fetch(new Request(origin+path,{headers:{Cookie:c}}),env);
     assert.equal(r.status,200,path);
     assert.match(r.headers.get("content-type"),new RegExp(kind),path);
     assert.equal(await r.text(),"mock");
   }
   assert.deepEqual(seen,[
     "listas.html","listas.js","listas.css","playlist-sources.json"
   ].map(s=>"https://drivmatch.github.io/drivmatch-stream/"+s));
 }finally{globalThis.fetch=before;}
});
test("library unrelated paths are not exposed",async()=>{
 const c=await cookie();
 for(const path of ["listas/private.json","listas/.env","listas/secret.m3u"]){
   const r=await stream.fetch(new Request(origin+path,{headers:{Cookie:c}}),env);
   assert.equal(r.status,404,path);
 }
});

test("short TV PIN is easy to enter, but needs strong signing secret and limiter",async()=>{
  const e={...env,STREAM_TV_PIN:"82741639",STREAM_LOGIN_LIMITER:{limit:async()=>({success:true})}};
  const form=new URLSearchParams({password:e.STREAM_TV_PIN}).toString();
  const entered=await stream.fetch(new Request(origin+"login",{
    method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form}),e);
  assert.equal(entered.status,303);
  assert.match(entered.headers.get("set-cookie"),/HttpOnly; Secure/);
  const page=await stream.fetch(new Request(origin),e);
  assert.match(await page.text(),/PIN de 8 números/);
  const cookie=entered.headers.get("set-cookie").split(";")[0];
  const accepted=await stream.fetch(new Request(origin+"session",{headers:{Cookie:cookie}}),e);
  assert.equal(accepted.status,200);
  const oldPinRejected=await stream.fetch(new Request(origin+"session",{headers:{Cookie:cookie}}),{...e,STREAM_TV_PIN:"92518436"});
  assert.equal(oldPinRejected.status,403);
});
test("wrong TV PIN rejects without revealing signed session",async()=>{
  const e={...env,STREAM_TV_PIN:"82741639",STREAM_LOGIN_LIMITER:{limit:async()=>({success:true})}};
  const r=await stream.fetch(new Request(origin+"login",{
    method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:"password=11111111"}),e);
  assert.equal(r.status,401);
  assert.equal(r.headers.get("set-cookie"),null);
});
test("PIN login fails closed if rate limiting is missing or exceeded",async()=>{
  const base={...env,STREAM_TV_PIN:"82741639"};
  const body="password=82741639",headers={"Content-Type":"application/x-www-form-urlencoded"};
  const missing=await stream.fetch(new Request(origin+"login",{method:"POST",headers,body}),base);
  assert.equal(missing.status,503);
  const blocked=await stream.fetch(new Request(origin+"login",{method:"POST",headers,body}),{
    ...base,STREAM_LOGIN_LIMITER:{limit:async()=>({success:false})}});
  assert.equal(blocked.status,429);
});
test("malformed TV PIN configuration never permits login",async()=>{
  const r=await stream.fetch(new Request(origin),{...env,STREAM_TV_PIN:"1234567"});
  assert.equal(r.status,503);
});

test("private Samsung TV bootstrap and legacy script are access-protected",async()=>{
 const before=globalThis.fetch,c=await cookie(),seen=[];
 try{
   globalThis.fetch=async url=>{seen.push(String(url));return new Response("legacy script",{status:200});};
   for(const file of ["stream-boot.js","stream-tv.js"]){
     const deny=await stream.fetch(new Request(origin+file),env);
     assert.equal(deny.status,403);
     const ok=await stream.fetch(new Request(origin+file,{headers:{Cookie:c}}),env);
     assert.equal(ok.status,200);assert.match(ok.headers.get("Content-Type"),/javascript/);
   }
   assert.deepEqual(seen,["stream-boot.js","stream-tv.js"].map(f=>"https://drivmatch.github.io/drivmatch-stream/"+f));
 }finally{globalThis.fetch=before;}
});
test("Samsung TV country catalogue is same-origin, private and country-allowlisted",async()=>{
 const c=await cookie(),before=globalThis.fetch,seen=[];
 try{
   globalThis.fetch=async url=>{seen.push(String(url));return new Response("#EXTM3U",{status:200});};
   const deny=await stream.fetch(new Request(origin+"catalog?country=BR"),env);
   assert.equal(deny.status,403);
   const bad=await stream.fetch(new Request(origin+"catalog?country=../../secret",{headers:{Cookie:c}}),env);
   assert.equal(bad.status,400);
   const good=await stream.fetch(new Request(origin+"catalog?country=BR",{headers:{Cookie:c}}),env);
   assert.equal(good.status,200);
   assert.equal(good.headers.get("Content-Type"),"text/plain; charset=utf-8");
   assert.equal(await good.text(),"#EXTM3U");
   assert.deepEqual(seen,["https://iptv-org.github.io/iptv/countries/br.m3u"]);
 }finally{globalThis.fetch=before;}
});

test("Samsung TV lounge page is private and served from fixed worker route",async()=>{
 const c=await cookie(),before=globalThis.fetch,seen=[];
 try{
  globalThis.fetch=async u=>{seen.push(String(u));return new Response("tv-layout",{status:200});};
  const locked=await stream.fetch(new Request(origin+"tv/"),env);
  assert.equal(locked.status,200);assert.match(await locked.text(),/Senha de acesso/);
  const redirect=await stream.fetch(new Request(origin+"tv"),env);
  assert.equal(redirect.status,308);assert.match(redirect.headers.get("location"),/\/stream\/tv\/$/);
  for(const path of ["tv/","tv/tv.css","tv/tv.js"]){
   const res=await stream.fetch(new Request(origin+path,{headers:{Cookie:c}}),env);
   assert.equal(res.status,200,path);assert.equal(await res.text(),"tv-layout");
  }
  assert.deepEqual(seen,["tv.html","tv.css","tv.js"].map(f=>"https://drivmatch.github.io/drivmatch-stream/"+f));
 }finally{globalThis.fetch=before;}
});
test("all 7 public IPTV catalogs are whitelisted and authenticated",async()=>{
 const c=await cookie(),before=globalThis.fetch,seen=[];
 try{
  globalThis.fetch=async u=>{seen.push(String(u));return new Response("#EXTM3U\n#EXTINF:-1,News TV\nhttps://example.org/news.m3u8",{status:200});};
  const blocked=await stream.fetch(new Request(origin+"catalog?list=lista-1&country=ALL"),env);
  assert.equal(blocked.status,403);
  for(const id of ["lista-1","lista-3","lista-4","lista-5","lista-6","lista-7"]){
   const res=await stream.fetch(new Request(origin+"catalog?list="+id+"&country=ALL",{headers:{Cookie:c}}),env);
   assert.equal(res.status,200,id);
  }
  const list2=await stream.fetch(new Request(origin+"catalog?list=lista-2&country=BR",{headers:{Cookie:c}}),env);
  assert.equal(list2.status,200);assert.match(await list2.text(),/#DM_COUNTRY:BR/);
  const all=await stream.fetch(new Request(origin+"catalog?list=lista-2&country=ALL",{headers:{Cookie:c}}),env);
  assert.equal(all.status,200);assert.match(await all.text(),/#DM_COUNTRY:PT/);
  for(const list of ["lista-8","../../admin","https://example.org/playlist.m3u"]){
    const res=await stream.fetch(new Request(origin+"catalog?list="+encodeURIComponent(list),{headers:{Cookie:c}}),env);
    assert.equal(res.status,400);
  }
  assert.equal(seen.length,19);
 }finally{globalThis.fetch=before;}
});
