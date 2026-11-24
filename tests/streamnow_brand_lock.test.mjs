/* Stream Now canonical v1 — fail closed if the approved identity silently drifts. */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";

const utf8=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const manifest=JSON.parse(utf8("00_CANONICO/STREAM_NOW_CANONICAL_MANIFEST_v1.json"));
const sourceHashes={
 PRIMARY_LOGO:"703a88042b16208c46d7a904a82eea444fa9c2e9e3511dfa3b387482770e7186",
 VISUAL_GUIDE:"1eb23c5d10f34b2110bf12111c32f4bf577b8c0c3d970cacedab484a491008d2"
};
function gitBlobSha(path){
 const bytes=readFileSync(new URL("../"+path,import.meta.url));
 return createHash("sha1").update("blob "+bytes.length+"\\0").update(bytes).digest("hex");
}
test("canonical v1 source references remain exactly approved",()=>{
 assert.equal(manifest.schema,"streamnow.canonical.brand.v1");
 assert.equal(manifest.status,"LOCKED_REFERENCE");
 assert.equal(manifest.brand,"Stream Now");
 assert.equal(manifest.canonical_date,"2026-11-23");
 assert.equal(manifest.source_assets.length,2);
 for(const entry of manifest.source_assets){
  assert.equal(entry.sha256,sourceHashes[entry.role],entry.role);
  assert.equal(entry.original_mime_detected,"image/jpeg");
 }
 assert.equal(manifest.policy.source_asset_overwrite,false);
 assert.equal(manifest.policy.redraw_existing_mark,false);
 assert.equal(manifest.policy.public_brand_drivmatch,false);
});
test("canonical source palette is locked",()=>{
 assert.deepEqual(manifest.tokens,{
  primary_red:"#FF003C",secondary_pink:"#FF1478",accent_purple:"#9C00FF",
  background_dark:"#080114",background_secondary:"#1A0E2A",
  white:"#FFFFFF",ui_font_family:"Montserrat"
 });
});
test("production mark/icon remain reference-derived approved Git blobs",()=>{
 const expected={
  "site/streamnow-brand.webp":"df287f3b1ab8b237e9d0e164b06989c0d0f58381",
  "site/streamnow-icon.webp":"3ce257e386ae6e717f60c84bdb5179162a4c3062"
 };
 assert.equal(manifest.derived_assets.length,2);
 for(const asset of manifest.derived_assets){
  assert.equal(asset.git_blob_sha1,expected[asset.path],asset.path);
  assert.equal(gitBlobSha(asset.path),expected[asset.path],asset.path+" modified without canonical version");
 }
});
test("public brand must remain Stream Now; legacy display mark is not allowed",()=>{
 for(const p of ["site/index.html","site/tv.html","site/listas.html"]){
  const body=utf8(p);
  assert.match(body,/Stream Now/);
  assert.doesNotMatch(body,/(?:DrivMatch Stream|DRIVMATCH · ACESSO PESSOAL|<b>SN<\/b>)/i,p);
  assert.match(body,/\/stream\/brand\.webp/,p);
  assert.match(body,/\/stream\/icon\.webp/,p);
 }
});
test("source of truth is linked and old version is preserved",()=>{
 const text=utf8("00_CANONICO/README_STREAM_NOW_v1.md");
 assert.match(text,/703a88042b16208c46d7a904a82eea444fa9c2e9e3511dfa3b387482770e7186/);
 assert.match(text,/1eb23c5d10f34b2110bf12111c32f4bf577b8c0c3d970cacedab484a491008d2/);
 assert.match(text,/CANÔNICA E CONGELADA/);
});
