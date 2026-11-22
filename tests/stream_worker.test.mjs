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
test("cross-origin form submit rejected",async()=>{
 for(const action of ["login","logout"]){
  const r=await stream.fetch(new Request(origin+action,{method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded",Origin:"https://attacker.example"},body:"password="+password}),env);
  assert.equal(r.status,403);
 }
});
test("logout expires cookie",async()=>{
 const r=await stream.fetch(new Request(origin+"logout",{method:"POST"}),env);
 assert.equal(r.status,303);assert.match(r.headers.get("set-cookie"),/Max-Age=0/);
});
test("unexpected methods denied",async()=>{
 const r=await stream.fetch(new Request(origin,{method:"PUT"}),env);
 assert.equal(r.status,405);
});