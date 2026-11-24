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
      assert.equal((await pages.fetch(request(origin,path),env)).status,200);
    }
  }
  assert.deepEqual(paths,Array(2).fill(["/streamnow-brand.webp","/streamnow-icon.webp","/daily-autopilot.m3u8"]).flat());
});
