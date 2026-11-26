import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src=fs.readFileSync(new URL('../site/tv.js',import.meta.url),'utf8');
const from=src.indexOf('function oldFavoriteSnapshot(key){');
const to=src.indexOf('function loadQuickHistory(){',from);
assert.ok(from>=0&&to>from,'favorite parser must exist');
const ctx={};
vm.runInNewContext(src.slice(from,to),ctx);

test('legacy BR:record news resolves country BR without altering the key',()=>{
 const key='BR:record news',r=ctx.oldFavoriteSnapshot(key);
 assert.equal(r.key,key);
 assert.equal(r.code,'BR');
 assert.equal(r.name,'record news');
 assert.equal(r.origin,'lista-2');
});
test('new lista-12:US:Example resolves original source',()=>{
 const key='lista-12:US:Example';
 const r=ctx.oldFavoriteSnapshot(key);
 assert.equal(r.key,key);
 assert.equal(r.code,'US');
 assert.equal(r.name,'Example');
 assert.equal(r.origin,'lista-12');
});
test('invalid keys remain non-destructively unresolved',()=>{
 const r=ctx.oldFavoriteSnapshot('nonsense');
 assert.equal(r.key,'nonsense');
 assert.equal(r.code,'OTHER');
});

test('playlist parser retains forced source when loading a saved lista-12 favorite',()=>{
 const start=src.indexOf('function parse(raw,forcedCode,forcedSource){');
 const end=src.indexOf('function drawSources(){',start);
 assert.ok(start>=0&&end>start,'source-aware parser must exist');
 const context={
  MAX_CHANNELS:15000,source:'lista-2',PREMIUM:/(?!)/,trim:(v)=>String(v||'').trim(),
  lower:(v)=>String(v||'').toLowerCase(),
  dataAttr:()=>'',inferCountry:()=> 'BR',channelGenre:()=> 'news',
  channelAlias:(name)=>name,detectLanguage:()=>'',has:(list,key)=>list.includes(key)
 };
 vm.runInNewContext(src.slice(start,end),context);
 const rows=context.parse('#EXTM3U\n#EXTINF:-1,Record News\nhttps://example.com/record.m3u8\n','BR','lista-12');
 assert.equal(rows.length,1);
 assert.equal(rows[0].code,'BR');
 assert.equal(rows[0].source,'lista-12');
 assert.equal(rows[0].id,'lista-12:BR|record news');
});
