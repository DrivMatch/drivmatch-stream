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
