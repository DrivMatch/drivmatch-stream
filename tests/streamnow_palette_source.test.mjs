import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const paths=["site/tv.css","site/stream.css","site/listas.css","site/streamnow-graphite.css"];
function isAllowed(rgb){
 const [r,g,b]=rgb;
 const neutral=Math.max(r,g,b)-Math.min(r,g,b)<=15;
 const red=r>=28&&r>g*1.6&&r>b*1.27&&g<=r*.42&&b<=(r<=85?r*.5:r*.28);
 return neutral||red;
}
function hexRGB(hex){
 let x=hex.slice(1);
 if(x.length===3||x.length===4)x=x.slice(0,3).split("").map(c=>c+c).join("");
 if(x.length===8)x=x.slice(0,6);
 return [0,2,4].map(i=>parseInt(x.slice(i,i+2),16));
}
for(const path of paths){
 test("no blue, green or purple fallback in "+path,()=>{
  const css=readFileSync(new URL("../"+path,import.meta.url),"utf8");
  const hex=[...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(x=>x[0]);
  const rgb=[...css.matchAll(/\brgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/gi)]
   .map(x=>[+x[1],+x[2],+x[3]]);
  const disallowedHex=hex.filter(s=>!isAllowed(hexRGB(s)));
  const disallowedRGB=rgb.filter(s=>!isAllowed(s));
  assert.deepEqual(disallowedHex,[],path+" has chromatic non-red hex colors");
  assert.deepEqual(disallowedRGB,[],path+" has chromatic non-red rgb colors");
  assert.ok(hex.length>15,"Unexpectedly empty stylesheet");
 });
}
test("canonical raster logo is exempt; only UI colors are constrained",()=>{
 const manifest=JSON.parse(readFileSync(new URL("../00_CANONICO/STREAM_NOW_CANONICAL_MANIFEST_v1.json",import.meta.url),"utf8"));
 assert.equal(manifest.status,"LOCKED_REFERENCE");
 assert.equal(manifest.derived_assets.length,2);
});

test("text labels in the guide and fallbacks do not render colored emoji",()=>{
 const files=["site/tv.html","site/tv.js","site/index.html","site/stream.js",
  "site/stream-tv.js","site/listas.html","site/listas.js"];
 for(const path of files){
  const text=readFileSync(new URL("../"+path,import.meta.url),"utf8");
  assert.doesNotMatch(text,/\p{Emoji_Presentation}|\uFE0F/u,path);
 }
});
