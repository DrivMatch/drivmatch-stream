/* Stream Now cross-platform favorites safety, ES5 for Samsung/LG legacy browsers.
 * No network, no account sync, no implicit destructive migration.
 * Shared by desktop, phone, iPad, Android WebView, Samsung and LG web views. */
(function(root){
"use strict";
function valid(a){
 if(Object.prototype.toString.call(a)!=="[object Array]"||a.length>15000)return false;
 var seen={};
 for(var i=0;i<a.length;i++){
  if(typeof a[i]!=="string"||!a[i]||a[i].length>320||seen["!"+a[i]])return false;
  seen["!"+a[i]]=true;
 }
 return true;
}
function read(key){
 try{
  var raw=root.localStorage.getItem(key),foundation=root.localStorage.getItem(key+"-foundation"),
      previous=root.localStorage.getItem(key+"-previous");
  if(raw===null){
   if(foundation!==null||previous!==null)return {ok:false,list:[],reason:"backup-without-main"};
   return {ok:true,list:[],reason:"new-list"};
  }
  var parsed=JSON.parse(raw);
  if(!valid(parsed))return {ok:false,list:[],reason:"invalid-main"};
  // Empty main list while snapshots contain favorites is suspected data loss.
  // Never normalize that situation to a brand-new empty user list.
  if(!parsed.length && (foundation!==null||previous!==null)){
   var backup=previous||foundation;
   try{if(valid(JSON.parse(backup))&&JSON.parse(backup).length)
     return {ok:false,list:[],reason:"empty-main-with-nonempty-backup"};}catch(e){
     return {ok:false,list:[],reason:"backup-unreadable"};
   }
  }
  if(parsed.length){
   if(foundation===null){
    root.localStorage.setItem(key+"-foundation",raw);
    if(root.localStorage.getItem(key+"-foundation")!==raw)throw Error("foundation");
   }
   if(previous===null){
    root.localStorage.setItem(key+"-previous",raw);
    if(root.localStorage.getItem(key+"-previous")!==raw)throw Error("previous");
   }
  }
  return {ok:true,list:parsed,reason:"loaded"};
 }catch(e){return {ok:false,list:[],reason:"storage-failure"};}
}
function commit(key,before,after){
 if(!valid(before)||!valid(after))return false;
 try{
  var raw=root.localStorage.getItem(key);
  if(raw===null){
   if(root.localStorage.getItem(key+"-foundation")!==null||
      root.localStorage.getItem(key+"-previous")!==null||before.length)return false;
  }else{
   var stored=JSON.parse(raw);
   if(!valid(stored)||JSON.stringify(stored)!==JSON.stringify(before))return false;
   if(!stored.length){
    var backup=root.localStorage.getItem(key+"-previous")||root.localStorage.getItem(key+"-foundation");
    if(backup){try{if(JSON.parse(backup).length)return false;}catch(e){return false;}}
   }
   var removed=0;
   for(var i=0;i<stored.length;i++)if(after.indexOf(stored[i])<0)removed++;
   if(removed>1)return false;
   if(stored.length&&!root.localStorage.getItem(key+"-foundation")){
    root.localStorage.setItem(key+"-foundation",raw);
    if(root.localStorage.getItem(key+"-foundation")!==raw)return false;
   }
   root.localStorage.setItem(key+"-previous",raw);
   if(root.localStorage.getItem(key+"-previous")!==raw)return false;
  }
  var next=JSON.stringify(after);
  root.localStorage.setItem(key,next);
  return root.localStorage.getItem(key)===next;
 }catch(e){return false;}
}
root.StreamNowFavoritesSafety={read:read,commit:commit,valid:valid};
}(window));
