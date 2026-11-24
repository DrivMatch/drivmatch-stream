import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import worker from "../cloudflare/stream-proxy.mjs";

const read=(p)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const stylesheet=read("site/streamnow-graphite.css");
const allowedHue=color=>{
  let h=color.slice(1).toLowerCase();
  if(h.length===3||h.length===4)h=h.split("").map(x=>x+x).join("");
  if(h.length===8)h=h.slice(0,6);
  const rgb=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16));
  const mx=Math.max(...rgb),mn=Math.min(...rgb);
  const neutral=mx-mn<=15;
  const redFamily=rgb[0]>rgb[1]&&rgb[0]>rgb[2]&&rgb[1]<=rgb[0]*0.35&&rgb[2]<=(rgb[0]>=125?rgb[0]*0.32:rgb[0]*0.55);
  return neutral||redFamily;
};
test("graphite theme only uses achromatic or red-family hex colors",()=>{
  const colors=[...stylesheet.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(x=>x[0]);
  assert.ok(colors.length>50,"theme should have explicit color definitions");
  assert.deepEqual(colors.filter(x=>!allowedHue(x)),[],"no blue/green/purple hex allowed");
});
test("Samsung, desktop and library explicitly load the same last-in-cascade theme",()=>{
 for(const p of ["site/tv.html","site/index.html","site/listas.html"]){
  const html=read(p),links=[...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+>/g)].map(x=>x[0]);
  assert.ok(links.length>=2,p);
  assert.match(links.at(-1),/\/stream\/graphite\.css\?v=20261123-graphite1/,p);
  assert.match(html,/Stream Now/,p);
 }
});
test("brand asset remains untouched and invite is not misleading",()=>{
 const email=read("emails/streamnow-invite.html");
 assert.match(email,/Seu acesso ao/);
 assert.match(email,/\{\{BRAND_LOGO_URL\}\}/);
 assert.match(email,/\{\{ACCESS_URL\}\}/);
 assert.doesNotMatch(email,/DrivMatch|suporte@streamnow|filmes e séries/i);
});
test("new graphite CSS remains private to authenticated Supabase accounts",async()=>{
 const base="https://streamnow-2o1.pages.dev",password="a-strong-password-123456789",email="viewer@example.test";
 const userId="25c8f362-3e8e-488c-a1f2-0a1c4ad60a85";
 const paths=[];
 const env={STREAM_ACCESS_PASSWORD:password,STREAM_SUPABASE_URL:"https://project-test.supabase.co",
   STREAM_SUPABASE_PUBLIC_KEY:"test-public-key-123456789",
   ASSETS:{fetch:async r=>{paths.push(new URL(r.url).pathname);return new Response(stylesheet,{status:200,headers:{"Content-Type":"text/css"}})}}};
 const denied=await worker.fetch(new Request(base+"/stream/graphite.css"),env);
 assert.equal(denied.status,403);
 assert.deepEqual(paths,[]);
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async (uri,opts)=>{
   assert.ok(String(uri).includes("supabase.co/auth/v1/token"));
   assert.equal(JSON.parse(opts.body).email,email);
   return new Response(JSON.stringify({access_token:"test-token",user:{id:userId}}),{status:200,headers:{"Content-Type":"application/json"}});
  };
  const auth=await worker.fetch(new Request(base+"/stream/login",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","Origin":base},body:new URLSearchParams({email,password}).toString()}),env);
  assert.equal(auth.status,303);
  const cookie=auth.headers.get("set-cookie").split(";")[0];
  const response=await worker.fetch(new Request(base+"/stream/graphite.css",{headers:{Cookie:cookie}}),env);
  assert.equal(response.status,200);
  assert.deepEqual(paths,["/streamnow-graphite.css"]);
  assert.equal(response.headers.get("content-type"),"text/css; charset=utf-8");
 }finally{globalThis.fetch=original;}
});
