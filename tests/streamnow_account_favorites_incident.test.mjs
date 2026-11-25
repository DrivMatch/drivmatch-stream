import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const js=readFileSync(new URL("../site/tv.js",import.meta.url),"utf8");
const start=js.indexOf("/* CRITICAL: account favorites");
const end=js.indexOf("/* FAVORITES DATA SAFETY GATE:",start);
assert.ok(start>0&&end>start);
const source=js.slice(start,end);
const make=n=>Array.from({length:n},(_,i)=>"lista-2:BR:canal-"+i);
function fixture(server=[],local=[],opts={}){
 const db=new Set(server),storage=new Map();
 if(opts.owner!==undefined)storage.set("streamnow-tv-favorites-owner-v1",opts.owner);
 const nodes={};
 function D(id){return nodes[id]||(nodes[id]={hidden:true,textContent:""});}
 const calls=[],ctx={
  favorites:local.slice(),favoriteMeta:{},D,T:(e,s)=>{e.textContent=s;},
  has:(a,v)=>a.indexOf(v)>=0,drawQuickLists:()=>{},updateFavButton:()=>{},
  noteFavStorage:()=>{},window:{confirm:()=>opts.confirm??false},
  localStorage:{getItem:k=>storage.has(k)?storage.get(k):null,
    setItem:(k,v)=>{storage.set(k,String(v));}},
  XMLHttpRequest:function(){
   this.status=0;this.readyState=0;this.responseText="";
   this.open=(method,url)=>{this.method=method;this.url=url;};
   this.setRequestHeader=()=>{};
   this.send=(body)=>{
    calls.push({method:this.method,url:this.url,body});
    if(opts.offline){this.status=503;this.responseText="unavailable";}
    else if(this.method==="GET"){
     this.status=200;this.responseText=JSON.stringify({favorites:[...db]});
    }else{
     const value=JSON.parse(body);
     this.status=200;this.responseText=JSON.stringify({ok:true});
     if(value.operation==="import")for(const key of value.keys)db.add(key);
     if(value.operation==="add")db.add(value.key);
    }
    this.readyState=4;this.onreadystatechange();
   };
  },
 };
 vm.createContext(ctx);vm.runInContext(source,ctx);
 return {ctx,calls,db,storage,D};
}
test("153 saved on account appear on a browser whose local storage is empty",()=>{
 const f=fixture(make(153));
 f.ctx.loadAccountFavorites("user-a");
 assert.equal(f.ctx.favorites.length,153);
 assert.equal(f.D("favorite-count").textContent,"153");
 assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].method,"GET");
 assert.equal(f.storage.size,0,"server read must not overwrite local data");
});
test("empty server response never deletes 153 local favorites",()=>{
 const f=fixture([],make(153));
 f.ctx.loadAccountFavorites("user-a");
 assert.equal(f.db.size,0);
 assert.equal(f.ctx.accountFavoritesMissing.length,153);
 assert.equal(f.D("account-import-favorites").hidden,false);
 assert.equal(f.calls.length,1);
 assert.match(f.D("account-favorites-status").textContent,/153/);
 assert.equal(f.D("favorite-count").textContent,"0 + 153 locais");
 assert.equal(f.storage.size,0);
});
test("only explicit owner consent imports 153 additively in batches of 20",()=>{
 const f=fixture(make(3),make(153),{confirm:true});
 f.ctx.loadAccountFavorites("user-a");
 f.ctx.importLocalAccountFavorites();
 assert.equal(f.db.size,153);
 assert.equal(f.calls.filter(x=>x.method==="POST").length,8);
 assert.equal(f.storage.get("streamnow-tv-favorites-owner-v1"),"user-a");
 assert.equal(f.ctx.favorites.length,153);
 assert.equal(f.calls.filter(x=>x.method==="POST").every(x=>JSON.parse(x.body).operation==="import"),true);
});
test("browser local favorites belonging to another account are never leaked or imported",()=>{
 const f=fixture([],make(153),{owner:"other-user",confirm:true});
 f.ctx.loadAccountFavorites("user-a");
 assert.equal(f.ctx.favorites.length,0);
 assert.equal(f.ctx.accountFavoritesMissing.length,0);
 f.ctx.importLocalAccountFavorites();
 assert.equal(f.calls.filter(x=>x.method==="POST").length,0);
});
test("server failure preserves local list and forbids import/write",()=>{
 const f=fixture(make(153),make(3),{offline:true,confirm:true});
 f.ctx.loadAccountFavorites("user-a");
 assert.equal(f.ctx.favorites.length,3);
 assert.equal(f.ctx.accountFavoritesReady,false);
 f.ctx.importLocalAccountFavorites();
 assert.equal(f.calls.filter(x=>x.method==="POST").length,0);
});
test("backend never serves a deletion request, archive/triggers are defined",()=>{
 const backend=readFileSync(new URL("../cloudflare/independent-access.mjs",import.meta.url),"utf8");
 assert.match(backend,/FAVORITES_DELETION_LOCKED/);
 assert.doesNotMatch(backend,/DELETE FROM stream_favorites WHERE user_id/);
 const migration=readFileSync(new URL("../migrations/0009_stream_favorites_immutable_archive.sql",import.meta.url),"utf8");
 assert.match(migration,/INSERT OR IGNORE INTO stream_favorites_archive/);
 assert.match(migration,/BEFORE DELETE ON stream_favorites/);
 assert.match(migration,/BEFORE UPDATE ON stream_favorites/);
});
