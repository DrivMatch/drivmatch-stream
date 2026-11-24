import test from "node:test";
import assert from "node:assert/strict";
import worker from "../cloudflare/stream-proxy.mjs";
const base="https://streamnow.pages.dev";
const secret="local-testing-credential-123456789";
const seen=[];
const env={STREAM_ACCESS_PASSWORD:secret,ASSETS:{fetch:async r=>{
 const p=new URL(r.url).pathname;seen.push(p);return new Response(p,{status:200});
}}};
test("root gated and no original branding",async()=>{
 const r=await worker.fetch(new Request(base+"/"),env);
 assert.equal(r.status,200);
 assert.match(await r.text(),/Stream Now/);
 assert.equal(seen.length,0);
});
test("root session allows bundled local assets",async()=>{
 const r=await worker.fetch(new Request(base+"/stream/login",{method:"POST",
 headers:{"Content-Type":"application/x-www-form-urlencoded"},
 body:new URLSearchParams({password:secret}).toString()}),env);
 assert.equal(r.status,303);
 assert.equal(r.headers.get("location"),base+"/");
 assert.ok(r.headers.get("set-cookie").includes("Path=/;"));
 const cookie=r.headers.get("set-cookie").split(";")[0];
 seen.length=0;
 const page=await worker.fetch(new Request(base+"/",{headers:{Cookie:cookie}}),env);
 assert.equal(page.status,200);
 assert.equal(await page.text(),"/tv.html");
 assert.deepEqual(seen,["/tv.html"]);
});
test("direct assets cannot bypass login",async()=>{
 for(const p of ["/tv.html","/_worker.js","/stream/tv/tv.js"]){
 const r=await worker.fetch(new Request(base+p),env);
 assert.equal(r.status,p.startsWith("/stream/")?403:404,p);
 }
});
test("public daily playlist is allowlisted",async()=>{
 const r=await worker.fetch(new Request(base+"/daily-autopilot.m3u8"),env);
 assert.equal(r.status,200);
 assert.equal(await r.text(),"/daily-autopilot.m3u8");
});

test("canonical brand images are public without exposing app APIs",async()=>{
 for(const [path,file] of [["/stream/brand.webp","/streamnow-brand.webp"],["/stream/icon.webp","/streamnow-icon.webp"]]){
  const response=await worker.fetch(new Request(base+path),env);
  assert.equal(response.status,200,path);
  assert.equal(response.headers.get("content-type"),"image/webp");
  assert.equal(await response.text(),file);
 }
 assert.equal((await worker.fetch(new Request(base+"/stream/catalog?list=lista-1"),env)).status,403);
});

test("Cloudflare-assigned suffix runs same gated application as staging",async()=>{
 const staging="https://streamnow-2o1.pages.dev";
 seen.length=0;
 const login=await worker.fetch(new Request(staging+"/"),env);
 assert.equal(login.status,200);
 assert.match(await login.text(),/Stream Now/);
 assert.equal(seen.length,0);
 const submitted=await worker.fetch(new Request(staging+"/stream/login",{
  method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
  body:new URLSearchParams({password:secret}).toString()}),env);
 assert.equal(submitted.status,303);
 assert.equal(submitted.headers.get("location"),staging+"/");
 assert.match(submitted.headers.get("set-cookie"),/Path=\/;/);
 const cookie=submitted.headers.get("set-cookie").split(";")[0];
 const screen=await worker.fetch(new Request(staging+"/",{headers:{Cookie:cookie}}),env);
 assert.equal(screen.status,200);
 assert.equal(await screen.text(),"/tv.html");
 seen.length=0;
 const playlist=await worker.fetch(new Request(staging+"/stream/catalog?list=lista-12",{headers:{Cookie:cookie}}),env);
 assert.equal(playlist.status,200);
 assert.deepEqual(seen,["/daily-autopilot.m3u8"]);
});
test("unapproved pages.dev host remains inaccessible",async()=>{
 const r=await worker.fetch(new Request("https://streamnow-guess.pages.dev/"),env);
 assert.equal(r.status,404);
});
