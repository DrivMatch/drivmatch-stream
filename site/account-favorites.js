/* Stream Now: per-account favorites bridge. ES5 for older Smart TV browsers.
 * Local favorites are never cleared, deleted, replaced, or auto-imported.
 * Accounts are scoped by authenticated server user_id, never typed e-mail.
 * All saved keys remain in D1; explicit opt-in imports browser-only items.
 */
(function(root){
 "use strict";
 function unique(xs){
  if(Object.prototype.toString.call(xs)!=="[object Array]")return null;
  var out=[],seen={};
  for(var i=0;i<xs.length;i++){
   var k=xs[i];if(typeof k!=="string"||k.length<2||k.length>400)return null;
   if(!seen["#"+k]){out.push(k);seen["#"+k]=true;}
  }return out;
 }
 function xhr(method,user,payload,callback){
  var x=new XMLHttpRequest(),done=false;
  function finish(code,text){
   if(done)return;done=true;
   var body=null;try{body=JSON.parse(text||"");}catch(e){}
   callback(code,body);
  }
  x.onreadystatechange=function(){if(x.readyState===4)finish(x.status,x.responseText);};
  x.onerror=function(){finish(0,"");};
  try{
   x.open(method,"/stream/favorites",true);
   x.setRequestHeader("X-Stream-Account",user);
   if(method==="POST")x.setRequestHeader("Content-Type","application/json");
   x.send(payload?JSON.stringify(payload):null);
  }catch(e){finish(0,"");}
 }
 function create(opts){
  opts=opts||{};
  var user="",all=[],ready=false,pending=[],busy=false,local=[],owner="";
  var ownerKey="streamnow-universal-favorites-owner-v1:"+String(opts.store||"unknown");
  function tell(message){if(opts.onStatus)opts.onStatus(message);}
  function draw(){if(opts.onChange)opts.onChange(all.slice(0),ready);}
  function refresh(){
   if(!user)return;
   ready=false;
   xhr("GET",user,null,function(status,data){
    if(status!==200||!data||!unique(data.favorites)){
     tell("Não foi possível ler os favoritos da conta. Nenhuma lista foi apagada e novas alterações foram bloqueadas.");
     draw();return;
    }
    all=unique(data.favorites);ready=true;pending=[];
    if(owner===""||owner===user)
     for(var i=0;i<local.length;i++)if(all.indexOf(local[i])<0)pending.push(local[i]);
    if(owner!==""&&owner!==user)tell("Há favoritos de outra conta neste navegador. Importação bloqueada.");
    else if(pending.length)tell(pending.length+" favoritos antigos neste navegador aguardam sua confirmação para vincular à conta.");
    else tell("Favoritos da conta carregados ("+all.length+"). Disponíveis neste login em todos os aparelhos.");
    draw();
    if(opts.onPending)opts.onPending(pending.slice(0),ready);
   });
  }
  function init(userId){
   if(typeof userId!=="string"||!userId){tell("Conta não identificada. Favoritos protegidos.");return;}
   user=userId;
   var reader=root.StreamNowFavoritesSafety;
   var result=reader&&reader.read?reader.read(opts.store):null;
   if(!result||!result.ok){tell("Favoritos deste navegador ilegíveis; nenhuma alteração será feita.");local=[];}
   else local=result.list.slice(0);
   try{owner=root.localStorage.getItem(ownerKey)||"";}catch(e){owner="BLOCKED";}
   refresh();
  }
  function importLocal(confirm){
   if(!ready||busy||!pending.length||owner&&owner!==user)return;
   if(!confirm)return;
   busy=true;
   var todo=pending.slice(0),i=0;
   function next(){
    if(i>=todo.length){busy=false;
     xhr("GET",user,null,function(st,data){
      var actual=st===200&&data?unique(data.favorites):null,verified=!!actual;
      if(verified)for(var j=0;j<todo.length;j++)if(actual.indexOf(todo[j])<0)verified=false;
      if(verified){
       try{root.localStorage.setItem(ownerKey,user);}catch(e){}
       owner=user;all=actual;pending=[];ready=true;
       tell(todo.length+" favoritos antigos confirmados na conta, sem exclusões.");draw();
       if(opts.onPending)opts.onPending([],true);
      }else{tell("Importação não confirmada no servidor. Dados antigos preservados.");refresh();}
     });return;
    }
    xhr("POST",user,{operation:"import",keys:todo.slice(i,i+20)},function(st,data){
     if(st!==200||!data||!data.ok){busy=false;tell("A importação parou; os dados locais não foram apagados.");refresh();return;}
     i+=20;next();
    });
   }next();
  }
  function add(key,callback){
   if(!ready||!user||typeof key!=="string"||key.length<2||key.length>400){
    tell("Conta não confirmada. Não foi possível adicionar sem risco.");if(callback)callback(false);return;
   }
   if(all.indexOf(key)>=0){if(callback)callback(true);return;}
   xhr("POST",user,{operation:"add",key:key},function(st,data){
    if(st===200&&data&&data.ok){all.push(key);draw();tell("Favorito salvo na conta.");if(callback)callback(true);}
    else{tell("Falha ao salvar no servidor. Nenhum favorito existente foi alterado.");if(callback)callback(false);}
   });
  }
  return {init:init,refresh:refresh,add:add,importLocal:importLocal,
   ready:function(){return ready;},favorites:function(){return all.slice(0);},
   pending:function(){return pending.slice(0);},user:function(){return user;}};
 }
 root.StreamNowAccountFavorites={create:create};
})(window);
