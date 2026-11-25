import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const source=readFileSync(new URL("../site/tv.js",import.meta.url),"utf8");
const start=source.indexOf('var LEGACY_FAV_STORE=');
const end=source.indexOf('/* Only minimal channel identity',start);
assert.ok(start>0&&end>start,"ES5 safety module present");
const snippet=source.slice(start,end);

function setup(original=null){
  const data=new Map();
  if(original!==null)data.set("drivmatch-tv-guide-favorites-v1",JSON.stringify(original));
  const dom={status:{hidden:true,textContent:""},recover:{hidden:true}};
  const storage={
    getItem(k){return data.has(k)?data.get(k):null;},
    setItem(k,v){data.set(k,String(v));},
  };
  const ctx={
    localStorage:storage,STORE:"drivmatch-tv-guide-favorites-v1",
    FAV_META_STORE:"drivmatch-tv-favorite-meta-v1",
    favorites:[],favoriteMeta:{},has:(a,k)=>a.indexOf(k)>=0,
    D:id=>id==="recover-favorites-status"?dom.status:id==="recover-backup-favorites"?dom.recover:null,
    T:(el,text)=>{el.textContent=text;},drawQuickLists:()=>{},
    window:{location:{origin:"https://example.test"}},Blob,JSON,Date,
  };
  vm.createContext(ctx);vm.runInContext(snippet,ctx);
  return {data,ctx,storage,dom};
}
const saved=n=>Array.from({length:n},(_,i)=>"lista-2:BR:canal-"+i);
test("153 favorites survive load and a single explicit addition",()=>{
 const {ctx,data}=setup(saved(153));
 ctx.loadFav();
 assert.equal(ctx.favorites.length,153);
 assert.equal(ctx.persistFavoriteChange([...ctx.favorites,"lista-2:BR:novo"]),true);
 assert.equal(JSON.parse(data.get(ctx.STORE)).length,154);
 assert.equal(JSON.parse(data.get(ctx.FAV_FOUNDATION_BACKUP)).length,153);
 assert.equal(JSON.parse(data.get(ctx.FAV_PREVIOUS_BACKUP)).length,153);
});
test("mass wipe and even two-item removal are blocked without destroying 153",()=>{
 const {ctx,data}=setup(saved(153));ctx.loadFav();
 assert.equal(ctx.persistFavoriteChange([]),false);
 assert.equal(ctx.persistFavoriteChange(ctx.favorites.slice(2)),false);
 assert.equal(JSON.parse(data.get(ctx.STORE)).length,153);
 assert.equal(ctx.persistFavoriteChange(ctx.favorites.slice(1)),true);
 assert.equal(JSON.parse(data.get(ctx.STORE)).length,152);
});
test("stale updates do not overwrite changes made in another tab",()=>{
 const {ctx,data,storage}=setup(saved(153));ctx.loadFav();
 const other=saved(154);storage.setItem(ctx.STORE,JSON.stringify(other));
 assert.equal(ctx.persistFavoriteChange(ctx.favorites.slice(1)),false);
 assert.equal(JSON.parse(data.get(ctx.STORE)).length,154);
});
test("malformed favorite state blocks writes and stays untouched",()=>{
 const {ctx,data,storage}=setup();storage.setItem(ctx.STORE,"{damaged");
 ctx.loadFav();
 assert.equal(ctx.favStorageSafe,false);
 assert.equal(ctx.persistFavoriteChange(["lista-2:BR:new"]),false);
 assert.equal(data.get(ctx.STORE),"{damaged");
});
test("missing main record with a backup blocks empty initialization, supports recovery",()=>{
 const {ctx,data,storage}=setup();
 storage.setItem(ctx.FAV_PREVIOUS_BACKUP,JSON.stringify(saved(153)));
 ctx.loadFav();
 assert.equal(ctx.favStorageSafe,false);
 assert.equal(ctx.persistFavoriteChange([]),false);
 assert.equal(ctx.recoverFavoriteBackup(),true);
 assert.equal(ctx.favorites.length,153);
 assert.equal(JSON.parse(data.get(ctx.STORE)).length,153);
});
test("failed backup prevents modifying existing favorites",()=>{
 const {ctx,data,storage}=setup(saved(153));ctx.loadFav();
 const original=storage.setItem;
 storage.setItem=(k,v)=>{
   if(k===ctx.FAV_PREVIOUS_BACKUP)throw Error("quota exceeded");
   original(k,v);
 };
 assert.equal(ctx.persistFavoriteChange([...ctx.favorites,"lista-2:BR:add"]),false);
 assert.equal(JSON.parse(data.get(ctx.STORE)).length,153);
});
test("153 preserved in backup block suspicious empty main and can be restored",()=>{
 const {ctx,data,storage}=setup([]);
 storage.setItem(ctx.FAV_FOUNDATION_BACKUP,JSON.stringify(saved(153)));
 ctx.loadFav();
 assert.equal(ctx.favStorageSafe,false);
 assert.equal(ctx.persistFavoriteChange(["lista-2:BR:new"]),false);
 assert.equal(ctx.recoverFavoriteBackup(),true);
 assert.equal(ctx.favorites.length,153);
 assert.equal(JSON.parse(data.get(ctx.STORE)).length,153);
});
test("no automatic destructive clear path in TV, legacy TV or library",()=>{
 for(const file of ["site/tv.js","site/stream-tv.js","site/listas.js"]){
  const text=readFileSync(new URL("../"+file,import.meta.url),"utf8");
  assert.doesNotMatch(text,/localStorage\.clear\s*\(/);
  assert.doesNotMatch(text,/localStorage\.removeItem\s*\(\s*(?:STORE|favStore|["']drivmatch-[^"']*fav)/);
 }
 const html=readFileSync(new URL("../site/tv.html",import.meta.url),"utf8");
 assert.match(html,/id="export-favorites-backup"/);
 assert.match(html,/id="recover-backup-favorites"/);
});
