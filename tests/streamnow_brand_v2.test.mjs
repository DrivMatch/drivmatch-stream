import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
const source=p=>readFileSync(new URL("../"+p,import.meta.url));
const read=p=>source(p).toString("utf8");
const SHA={
 "site/streamnow-brand.webp":"ea7de4183830abee6372d46b33365bbe7967f27a",
 "site/streamnow-icon.webp":"b48d97462001f4eb6d40ff1291782bb8b6e460c2",
 "android/app/src/main/res/drawable-nodpi/streamnow_icon.webp":"b48d97462001f4eb6d40ff1291782bb8b6e460c2",
 "android/app/src/main/res/drawable-nodpi/streamnow_wordmark.webp":"ea7de4183830abee6372d46b33365bbe7967f27a"
};
function gitHash(path){const b=source(path);return createHash("sha1").update("blob "+b.length).update(Buffer.from([0])).update(b).digest("hex");}
test("derivative v2 integrity and transparency-ready assets",()=>{
 const m=JSON.parse(read("00_CANONICO/STREAM_NOW_DERIVED_ASSETS_v2.json"));
 assert.equal(m.schema,"streamnow.visual.derivatives.v2");
 assert.deepEqual(m.production_assets.map(x=>x.path),Object.keys(SHA));
 for(const a of m.production_assets){
  assert.equal(a.git_blob_sha1,SHA[a.path]);
  assert.equal(gitHash(a.path),SHA[a.path]);
  assert.ok(source(a.path).length>10000,"asset too small: "+a.path);
  assert.equal(source(a.path).subarray(0,4).toString(),"RIFF");
  assert.equal(source(a.path).subarray(8,12).toString(),"WEBP");
 }
});
test("all UI surfaces use official assets and no invented slogans",()=>{
 for(const path of ["site/tv.html","site/index.html","site/listas.html"]){
  const html=read(path);
  assert.match(html,/\/stream\/brand\.webp/);
  assert.match(html,/\/stream\/icon\.webp/);
  assert.doesNotMatch(html,/Sua TV, do seu jeito|Área pessoal|ACESSO PESSOAL|senha particular/i,path);
  assert.match(html,/\/stream\/graphite\.css/);
 }
 const worker=read("cloudflare/stream-proxy.mjs");
 assert.doesNotMatch(worker,/Sua TV, do seu jeito|Área pessoal|ACESSO PESSOAL|senha particular/i);
 assert.match(worker,/brand\.webp/);
 const java=read("android/app/src/main/java/com/streamnow/app/MainActivity.java");
 assert.match(java,/R\.drawable\.streamnow_wordmark/);
 assert.match(java,/Color\.rgb\(9,9,9\)/);
 assert.match(java,/Color\.rgb\(184,0,40\)/);
 assert.doesNotMatch(java,/drivmatch/i);
 const email=read("emails/streamnow-invite.html");
 assert.match(email,/BRAND_LOGO_URL/);
 assert.doesNotMatch(email,/Área pessoal|Sua TV, do seu jeito|CONVITE PESSOAL/i);
});
test("original v1 assets preserved separately; cannot overwrite historical reference",()=>{
 const old={
  "00_CANONICO/DERIVADOS_V1/streamnow-brand-v1.webp":"df287f3b1ab8b237e9d0e164b06989c0d0f58381",
  "00_CANONICO/DERIVADOS_V1/streamnow-icon-v1.webp":"3ce257e386ae6e717f60c84bdb5179162a4c3062"
 };
 for(const [p,sha] of Object.entries(old))assert.equal(gitHash(p),sha,p);
});