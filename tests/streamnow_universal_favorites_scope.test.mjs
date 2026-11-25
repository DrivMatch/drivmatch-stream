import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const guard=read("site/favorites-safety.js");
const KEY="drivmatch-stream-favorites-v1";
const list=n=>Array.from({length:n},(_,i)=>"BR:canal "+i);
function context(initial){
 const saved=new Map();
 if(initial!==undefined)saved.set(KEY,JSON.stringify(initial));
 const localStorage={getItem:k=>saved.has(k)?saved.get(k):null,setItem:(k,v)=>{saved.set(k,String(v));}};
 const context={window:{localStorage},JSON};
 vm.createContext(context);vm.runInContext(guard,context);
 return {saved,api:context.window.StreamNowFavoritesSafety};
}
test("ES5 guard protects all web-wrapped interfaces and their backups",()=>{
 const {saved,api}=context(list(153)),before=api.read(KEY);
 assert.equal(before.ok,true);
 assert.equal(before.list.length,153);
 assert.equal(api.commit(KEY,before.list,[]),false);
 assert.equal(api.commit(KEY,before.list,[...before.list,"BR:novo"]),true);
 assert.equal(JSON.parse(saved.get(KEY)).length,154);
 assert.equal(JSON.parse(saved.get(KEY+"-foundation")).length,153);
 assert.equal(JSON.parse(saved.get(KEY+"-previous")).length,153);
});
test("empty local list cannot hide 153 favorites in backup",()=>{
 const {saved,api}=context([]);
 saved.set(KEY+"-foundation",JSON.stringify(list(153)));
 saved.set(KEY+"-previous",JSON.stringify([]));
 const state=api.read(KEY);
 assert.equal(state.ok,false);
 assert.equal(state.reason,"empty-main-with-nonempty-backup");
 assert.equal(api.commit(KEY,[],["BR:new"]),false);
 assert.equal(JSON.parse(saved.get(KEY+"-foundation")).length,153);
});
test("concurrent or corrupt lists are never overwritten",()=>{
 const {saved,api}=context(list(153)),old=api.read(KEY);
 saved.set(KEY,JSON.stringify(list(155)));
 assert.equal(api.commit(KEY,old.list,[...old.list,"BR:nova"]),false);
 saved.set(KEY,"invalid-json");
 assert.equal(api.read(KEY).ok,false);
 assert.equal(api.commit(KEY,[],[]),false);
 assert.equal(saved.get(KEY),"invalid-json");
});
test("all current clients load the same guard before their guide engines",()=>{
 for(const [path,tag] of [
  ["site/tv.html","/stream/tv/tv.js"],
  ["site/index.html","stream-boot.js"],
  ["site/listas.html","/stream/listas/listas.js"]]){
   const s=read(path);
   const safety=s.indexOf("/stream/favorites-safety.js"),engine=s.indexOf(tag);
   assert(safety>0&&engine>safety,path);
 }
 for(const path of ["site/stream.js","site/stream-tv.js","site/listas.js"]){
   assert.match(read(path),/StreamNowFavoritesSafety/,path);
 }
 assert.match(read("cloudflare/stream-proxy.mjs"),/\/stream\/favorites-safety\.js/);
});
test("release policy explicitly covers every delivery surface and protects channel discovery",()=>{
 const d=read("docs/STREAMNOW_FAVORITES_DATA_CONSTITUTION.md");
 for(const word of ["APK","AAB","Samsung","LG","desktop","iPad","iPhone","Android","celular","webOS","Tizen"]){
  assert(d.includes(word),"missing "+word);
 }
 const jobs=[".github/workflows/streamnow-pages.yml",
 ".github/workflows/streamnow-android-apk.yml",
 ".github/workflows/streamnow-android-production.yml",
 ".github/workflows/streamnow-tv-store-packages.yml",
 ".github/workflows/daily-channel-autopilot.yml",
 ".github/workflows/daily-channel-audits.yml"];
 for(const job of jobs)
  assert(read(job).includes("streamnow_universal_favorites_scope.test.mjs"),job+" gate missing");
});
