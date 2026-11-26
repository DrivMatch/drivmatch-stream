import test from "node:test";
import assert from "node:assert/strict";
import pages from "../cloudflare/streamnow-pages.mjs";

const official="https://streamnow-2o1.pages.dev";
const preview="https://contas-compartilhadas.streamnow-2o1.pages.dev";
const request=(origin,path,options)=>new Request(origin+path,options);

test("the root opens the existing account Worker under the Pages origin",async()=>{
  for(const origin of [official,preview]){
    const response=await pages.fetch(request(origin,"/"),{});
    assert.equal(response.status,303);
    assert.equal(new URL(response.headers.get("Location"),origin).href,origin+"/stream/");
  }
});

test("login, favorites and tasting go through one authority without replacing the browser origin",async()=>{
  const env={STREAM_ACCOUNTS:{async fetch(req){
    assert.equal(new URL(req.url).origin,official);
    assert.equal(req.headers.get("Cookie"),"dm_stream_user=fixture");
    if(req.method==="POST"){
      assert.equal(req.headers.get("Origin"),official);
      assert.equal(await req.text(),"example");
    }
    return new Response("from the existing Worker");
  }}};
  for(const path of ["/stream/login","/stream/signup","/stream/favorites","/stream/degustacao"]){
    const response=await pages.fetch(request(official,path,{
      method:"POST",headers:{Cookie:"dm_stream_user=fixture",Origin:official},body:"example"
    }),env);
    assert.equal(await response.text(),"from the existing Worker");
  }
});

test("a missing binding never falls back to a different private session",async()=>{
  assert.equal((await pages.fetch(request(official,"/stream/tv/"),{})).status,503);
  assert.equal((await pages.fetch(request(official,"/tv.html"),{})).status,404);
});

test("the Pages deployments continue to serve their original brand and published catalog",async()=>{
  const paths=[];
  const env={ASSETS:{async fetch(req){
    const url=new URL(req.url);
    paths.push(url.pathname);
    assert.equal(url.origin,official);
    return new Response("existing Pages asset");
  }}};
  for(const origin of [official,preview]){
    for(const path of ["/stream/brand.webp","/stream/icon.webp","/daily-autopilot.m3u8"]){
      const response=await pages.fetch(request(origin,path),env);
      assert.equal(response.status,200);
      if(path==="/stream/brand.webp")assert.equal(response.headers.get("Cross-Origin-Resource-Policy"),"cross-origin");
      if(path==="/stream/icon.webp")assert.equal(response.headers.get("Cross-Origin-Resource-Policy"),"same-origin");
    }
  }
  assert.deepEqual(paths,Array(2).fill(["/streamnow-brand.webp","/streamnow-icon.webp","/daily-autopilot.m3u8"]).flat());
});

test("authenticated TV HTML and JS come from the current Pages deployment, not the old account Worker bundle",async()=>{
 const calls=[];
 const env={STREAM_ACCOUNTS:{async fetch(req){calls.push(new URL(req.url).pathname);assert.equal(req.headers.get("Cookie"),"dm_stream_user=fixture");return Response.json({allowed:true,user_id:"fixture-user"});}},ASSETS:{async fetch(req){return new Response("current:"+new URL(req.url).pathname);}}};
 for(const [route,file] of [["/stream/tv/","/tv.html"],["/stream/tv/tv.js","/tv.js"]]){
  const res=await pages.fetch(request(official,route,{headers:{Cookie:"dm_stream_user=fixture"}}),env);
  assert.equal(res.status,200);assert.equal(await res.text(),"current:"+file);assert.equal(res.headers.get("X-StreamNow-UI"),"pages-p0-direct-favorites-v3");
 }
 assert.deepEqual(calls,["/stream/session","/stream/session"]);
});
test("anonymous TV requests never receive protected Pages assets",async()=>{
 let accessed=false;
 const env={STREAM_ACCOUNTS:{async fetch(req){return new Response("login",{status:new URL(req.url).pathname==="/stream/session"?401:200});}},ASSETS:{async fetch(){accessed=true;throw Error("auth bypass");}}};
 const res=await pages.fetch(request(official,"/stream/tv/"),env);
 assert.equal(await res.text(),"login");assert.equal(accessed,false);
});
