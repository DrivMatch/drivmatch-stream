import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("TV landing screen exposes publisher-backed playable channel choices, not blank select-a-country",()=>{
 const js=read("site/tv.js");
 assert.match(js,/function drawOfficialHome\(\)/);
 assert.match(js,/Canais oficiais para assistir/);
 assert.match(js,/if\(country==="ALL"&&!globalSearchMode\)drawOfficialHome\(\)/);
 assert.match(js,/on\(btn,"click",function\(\)\{play\(c\);\}\)/);
 assert.match(js,/youtube\.com\/embed\/live_stream\?channel=/);
 assert.match(js,/toggleFavorite\(c\)/);
});
test("channel directory contains official anchors and verified-source URL fallback",()=>{
 const data=JSON.parse(read("site/official-access.json"));
 for(const id of ["br-cazetv","br-getv","br-cnn-brasil-live","br-times-brasil-cnbc-live","us-bloomberg-tv-live","br-goat","br-xsports"]){
  const c=data.free.find(x=>x.id===id);
  assert.ok(c,"official source missing: "+id);
  assert.match(c.url,/^https:\/\//);
  assert.match(c.notes,/disponibilidade|live|incorporação|programação|Canal/i);
 }
 const withEmbeds=["br-cazetv","br-cnn-brasil-live","us-bloomberg-tv-live"];
 for(const id of withEmbeds){
  const c=data.free.find(x=>x.id===id);
  assert.equal(c.embed.provider,"youtube_live_channel");
  assert.match(c.embed.channelId,/^UC[A-Za-z0-9_-]{22}$/);
 }
});
test("favorites and personal storage are not erased during official-channel catalog update",()=>{
 const tv=read("site/tv.js"),api=read("cloudflare/independent-access.mjs");
 assert.match(api,/FAVORITES_DELETION_LOCKED/);
 assert.doesNotMatch(tv,/localStorage\.clear\(/);
 assert.doesNotMatch(tv,/localStorage\.removeItem\(STORE\)/);
 assert.match(tv,/accountRequest\("POST",\{operation:"add",key:k\}/);
});
