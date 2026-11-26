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

test('favorite resolves legacy and cross-source aliases without rewriting stored keys',()=>{
 const begin=src.indexOf('function favoriteIdentity(key){');
 const end=src.indexOf('function drawQuickGroup',begin);
 const c={oldFavoriteSnapshot:ctx.oldFavoriteSnapshot,lower:s=>String(s||'').trim().toLowerCase(),has:(a,k)=>a.includes(k),favorKey:x=>x.source+':'+x.code+':'+x.name.toLowerCase(),favorites:['BR:record news'],selected:null,cache:{'lista-12:BR':[{source:'lista-12',code:'BR',name:'Record News',urls:['https://example.org/live.m3u8']}]}};
 vm.runInNewContext(src.slice(begin,end),c);
 assert.equal(c.isFavorited(c.cache['lista-12:BR'][0]),true);
 assert.equal(c.findKnown('BR:record news','BR','record news').source,'lista-12');
 assert.equal(c.findKnown('lista-2:BR:record news','BR','record news').source,'lista-12');
 assert.equal(c.findKnown('US:record news','US','record news'),null);
 assert.equal(c.favorites[0],'BR:record news');
});
test('subscription platform footer is removed and backup controls remain',()=>{
 const html=fs.readFileSync(new URL('../site/tv.html',import.meta.url),'utf8');
 assert.doesNotMatch(html,/id="provider-toggle"/);
 assert.match(html,/id="export-favorites-backup"/);
 assert.match(html,/id="account-import-favorites"/);
});
