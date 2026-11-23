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
