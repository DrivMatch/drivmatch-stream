import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const DOMAIN="streamnow-2o1.pages.dev";
const OLD="streamnow.pages.dev";
test("Android APK native WebView loads ONLY the production free Pages host",()=>{
 const java=read("android/app/src/main/java/com/streamnow/app/MainActivity.java");
 const gradle=read("android/app/build.gradle");
 const flow=read(".github/workflows/streamnow-android-apk.yml");
 for(const src of [java,gradle,flow]){
   assert.ok(src.includes(DOMAIN), "Actual Cloudflare hostname required");
   assert.ok(!src.includes("https://"+OLD+"/"),"Unavailable hostname is not permitted");
 }
 assert.match(java,/HOME\s*=\s*"https:\/\/streamnow-2o1\.pages\.dev\/"/);
 assert.match(java,/"streamnow-2o1\.pages\.dev"\.equalsIgnoreCase\(uri\.getHost\(\)\)/);
 assert.match(gradle,/versionCode 5/);
 assert.match(gradle,/versionName "0\.3\.2-test"/);
 assert.match(flow,/streamnow-android-v0\.3\.2-test/);
});
test("Pages routing and deployed auth use real Cloudflare hostname, with no spoofed alias",()=>{
 const worker=read("cloudflare/stream-proxy.mjs");
 const deploy=read(".github/workflows/streamnow-pages.yml");
 assert.match(worker,/const STREAM_NOW_HOST="streamnow-2o1\.pages\.dev"/);
 assert.match(worker,/const pagesHost=host===STREAM_NOW_HOST/);
 assert.doesNotMatch(worker,/host==="streamnow\.pages\.dev"/);
 assert.match(deploy,/origin=https:\/\/streamnow-2o1\.pages\.dev\b/);
 assert.match(deploy,/name='email'/);
 assert.match(read("cloudflare/streamnow-pages.mjs"),/env\.STREAM_ACCOUNTS\.fetch\(request\)/);
 assert.match(read("wrangler.streamnow.jsonc"),/"binding": "STREAM_ACCOUNTS"/);
 assert.match(deploy,/stream\/session/);
 assert.match(deploy,/STREAM_SUPABASE_PUBLIC_KEY/);
 assert.doesNotMatch(deploy,/SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE/i);
});
test("Public brand name remains Stream Now and no invented access copy",()=>{
 const files=["site/index.html","site/tv.html","site/listas.html","cloudflare/stream-proxy.mjs"];
 for(const path of files){
  const s=read(path);
  assert.doesNotMatch(s,/Sua TV, do seu jeito|Área pessoal|senha particular/i,path);
 }
 assert.match(read("README.md"),/https:\/\/streamnow-2o1\.pages\.dev\//);
});
