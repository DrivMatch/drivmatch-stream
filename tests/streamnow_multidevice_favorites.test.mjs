import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const script=read("site/account-favorites.js");
function fixture(serverKeys=[],localKeys=[],fail=false) {
 const db=new Set(serverKeys);
 const storage=new Map([["drivmatch-stream-favorites-v1",JSON.stringify(localKeys)]]);
 const history=[],requestLog=[];
 const scope={};
 scope.window=scope;
 scope.localStorage={getItem(k){return storage.get(k)??null;},setItem(k,v){storage.set(k,v);}};
 scope.StreamNowFavoritesSafety={read(k){return{ok:true,list:JSON.parse(storage.get(k)||"[]")};}};
 scope.XMLHttpRequest=function(){
  this.headers={};this.open=(method,url)=>{this.method=method;this.url=url;};
  this.setRequestHeader=(name,value)=>{this.headers[name]=value;};
  this.send=body=>{
   requestLog.push({user:this.headers["X-Stream-Account"],method:this.method,body});
   if(fail){this.status=503;this.responseText="unavailable";}
   else if(this.method==="GET"){this.status=200;this.responseText=JSON.stringify({favorites:[...db]});}
   else{
    const payload=JSON.parse(body);
    assert.notEqual(payload.operation,"remove","delete forbidden");
    if(payload.operation==="add")db.add(payload.key);
    else if(payload.operation==="import"){
      assert.ok(payload.keys.length<=20);
      payload.keys.forEach(k=>db.add(k));
    }
    this.status=200;this.responseText=JSON.stringify({ok:true});
   }
   this.readyState=4;this.onreadystatechange();
  };
 };
 vm.runInNewContext(script,scope);
 let client=scope.StreamNowAccountFavorites.create({
  store:"drivmatch-stream-favorites-v1",
  onChange:(keys,ready)=>history.push({keys,ready}),
  onStatus:()=>{},onPending:()=>{}
 });
 return {db,storage,history,requestLog,client};
}
test("any device signed into the same user sees all 93 server favorites without localStorage",()=>{
 const records=Array.from({length:93},(_,i)=>"lista-2:BR:canal "+i);
 const one=fixture(records);one.client.init("user-1");
 assert.equal(one.client.favorites().length,93);
 const another=fixture(records);another.client.init("user-1");
 assert.equal(another.client.favorites().length,93);
 assert.equal(another.storage.get("drivmatch-stream-favorites-v1"),"[]");
 assert.ok(another.client.contains("BR:canal 40"),"legacy/modern identifiers must match");
});
test("account favorites union with browser-only 153 requires consent, and never deletes",()=>{
 const old=Array.from({length:153},(_,i)=>"BR:legacy "+i);
 const f=fixture(["lista-2:BR:existing"],old);
 f.client.init("user-1");
 assert.equal(f.db.size,1);
 assert.equal(f.client.pending().length,153);
 f.client.importLocal(false);assert.equal(f.db.size,1);
 f.client.importLocal(true);
 assert.equal(f.db.size,154);
 assert.equal(f.client.pending().length,0);
 assert.equal(f.storage.get("drivmatch-stream-favorites-v1"),JSON.stringify(old),"legacy must remain");
 assert.equal(f.requestLog.filter(x=>x.method==="POST").length,8);
});
test("same browser may not automatically import favorites from a different account",()=>{
 const f=fixture([],["BR:private"]);
 f.storage.set("streamnow-universal-favorites-owner-v1:drivmatch-stream-favorites-v1","user-1");
 f.client.init("user-2");
 assert.equal(f.client.pending().length,0);
 f.client.importLocal(true);
 assert.equal(f.db.size,0);
});
test("server offline prevents writes and does not overwrite local favorites",()=>{
 const f=fixture([],["BR:private"],true);
 f.client.init("user-1");f.client.add("BR:test");
 assert.equal(f.requestLog.filter(x=>x.method==="POST").length,0);
 assert.equal(f.storage.get("drivmatch-stream-favorites-v1"),'["BR:private"]');
});
test("all three client apps load shared module before their platform-specific engines",()=>{
 const modern=read("site/index.html"),library=read("site/listas.html");
 for(const html of [modern,library]){
  assert.match(html,/account-favorites\.js/);
  assert.ok(html.indexOf("account-favorites.js")>html.indexOf("favorites-safety.js"));
 }
 const backend=read("cloudflare/independent-access.mjs");
 assert.match(backend,/"\/stream\/account-favorites\.js":"account-favorites.js"/);
 for(const file of ["site/stream.js","site/listas.js","site/stream-tv.js"]){
  const js=read(file);
  assert.match(js,/StreamNowAccountFavorites/);
  assert.match(js,/accountFavorites\.add/);
  assert.doesNotMatch(js,/localStorage\.clear\(/);
 }
});
