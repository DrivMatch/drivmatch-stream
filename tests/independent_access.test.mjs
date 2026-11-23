import test from "node:test";
import assert from "node:assert/strict";
import worker from "../cloudflare/independent-access.mjs";

const base = "https://example.workers.dev";
const users = [
  {id:"admin-1", email:"owner@example.test", password:"Admin-test-password-123", role:"admin"},
  {id:"viewer-2", email:"brother@example.test", password:"Brother-test-password-123", role:"viewer"}
];

function testEnvironment() {
  const accounts = new Map(users.map(x=>[x.id,{
    user_id:x.id,email:x.email,role:x.role,status:"active",
    created_at:Math.floor(Date.now()/1000)-86400,first_login_at:null,last_login_at:null,
    activated_at:null,canceled_invite_at:null
  }]));
  const sessions = new Map();
  const favorites = new Map();
  const events = [];
  const db = {
    prepare(statement){
      let args=[];
      return {
        bind(...values){args=values;return this;},
        async first(){
          if(statement.includes("FROM stream_sessions s")) {
            const session=sessions.get(args[0]);
            if(!session || session.expires_at <= args[1])return null;
            const user=accounts.get(session.user_id);
            return user?.status==="active"?{...user}:null;
          }
          if(statement.includes("WHERE user_id=? AND email=? AND status='active'")) {
            const user=accounts.get(args[0]);
            return user?.email===args[1]&&user.status==="active"?{...user}:null;
          }
          if(statement.includes("WHERE user_id=? AND email=?")) {
            const user=accounts.get(args[0]);
            return user?.email===args[1]?{...user}:null;
          }
          if(statement.includes("FROM stream_users WHERE user_id=?"))return accounts.get(args[0])||null;
          if(statement.includes("FROM stream_users WHERE email=?"))
            return [...accounts.values()].find(u=>u.email===args[0])||null;
          throw Error("Unhandled first: "+statement);
        },
        async all(){
          if(statement.includes("FROM stream_favorites")) {
            const list=favorites.get(args[0])||new Set();
            return {results:[...list].map(favorite_key=>({favorite_key}))};
          }
          if(statement.includes("FROM stream_users ORDER")) return {results:[...accounts.values()]};
          if(statement.includes("FROM stream_admin_events e"))
            return {results:events.map(e=>({...e,subject_email:accounts.get(e.subject)?.email||null})).reverse()};
          if(statement.includes("FROM stream_sessions WHERE expires_at>?")) {
            const counts=new Map();
            for(const session of sessions.values()){
              if(session.expires_at>args[0])counts.set(session.user_id,(counts.get(session.user_id)||0)+1);
            }
            return {results:[...counts].map(([user_id,total])=>({user_id,total}))};
          }
          throw Error("Unhandled all: "+statement);
        },
        async run(){
          if(statement.startsWith("INSERT INTO stream_sessions")) {
            sessions.set(args[0],{user_id:args[1],expires_at:args[2]});
          } else if(statement.startsWith("DELETE FROM stream_sessions WHERE token_hash")) {
            sessions.delete(args[0]);
          } else if(statement.startsWith("DELETE FROM stream_sessions WHERE user_id")) {
            for(const [key,s] of sessions)if(s.user_id===args[0])sessions.delete(key);
          } else if(statement.startsWith("INSERT OR IGNORE INTO stream_favorites")) {
            if(!favorites.has(args[0]))favorites.set(args[0],new Set());
            favorites.get(args[0]).add(args[1]);
          } else if(statement.startsWith("DELETE FROM stream_favorites")) {
            favorites.get(args[0])?.delete(args[1]);
          } else if(statement.startsWith("UPDATE stream_users SET first_login_at=")) {
            const account=accounts.get(args[2]);
            if(account?.status==="active"){
              account.first_login_at??=args[0];account.last_login_at=args[1];
            }
          } else if(statement.startsWith("UPDATE stream_users SET status=?")) {
            const account=accounts.get(args[3]);
            if(account?.status===args[4]){
              account.status=args[0];account.canceled_invite_at=args[2];
            }
          } else if(statement.startsWith("UPDATE stream_users SET status='active'")) {
            const account=accounts.get(args[2]);
            if(account?.status==="invited"){
              account.status="active";account.activated_at??=args[0];
            }
          } else if(statement.startsWith("INSERT INTO stream_admin_events")){
            events.push({admin:args[1],action:args[2],subject:args[3],
              created_at:Math.floor(Date.now()/1000)});
          } else if(statement.startsWith("INSERT INTO stream_users")) {
            accounts.set(args[0],{user_id:args[0],email:args[1],role:"viewer",status:"invited",
              created_at:Math.floor(Date.now()/1000),activated_at:null,first_login_at:null,
              last_login_at:null,canceled_invite_at:null});
          } else throw Error("Unhandled run: "+statement);
          return {success:true};
        }
      };
    },
    async batch(statements){ for(const stmt of statements)await stmt.run();return [];}
  };
  const env={
    STREAM_USERS_DB:db,
    STREAM_LOGIN_LIMITER:{async limit(){return {success:true};}},
    SUPABASE_URL:"https://example.supabase.co",
    SUPABASE_PUBLIC_KEY:"testing-public-key",
    SUPABASE_SECRET_KEY:"testing-secret-key",
    STREAM_ACCESS_PASSWORD:"very-long-private-legacy-secret"
  };
  return {env,accounts,sessions,favorites,events};
}
function req(path,options={}){
  return new Request(base+path,{...options,headers:{
    Origin:base,...options.headers
  }});
}
async function getForm(path,env,session="") {
  const response=await worker.fetch(req(path,{headers:session?{Cookie:session}:{}}),env);
  assert.equal(response.status,200,"form GET must succeed");
  const html=await response.text();
  const token=html.match(/name='_csrf' value='([^']+)'/)?.[1];
  const csrfCookie=response.headers.get("Set-Cookie")?.split(";")[0];
  assert.match(token||"",/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/);
  assert.match(csrfCookie||"",/^__Host-dm_stream_form_csrf=/);
  return {token,cookie:csrfCookie,html};
}
async function login(email,password,env) {
  const form=await getForm("/stream/login",env);
  return worker.fetch(req("/stream/login",{
    method:"POST",headers:{Cookie:form.cookie,"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({email,password,_csrf:form.token}).toString()
  }),env);
}
function cookie(res) {
  const value=res.headers.get("Set-Cookie")?.split(";")[0];
  assert.match(value||"",/^dm_stream_user=[A-Za-z0-9_-]{43}$/);
  return value;
}
async function withFakeSupabase(fn) {
  const original=globalThis.fetch;
  globalThis.fetch=async(request,options)=>{
    const u=new URL(request);
    const body=options?.body?JSON.parse(options.body):{};
    if(u.pathname==="/auth/v1/token") {
      assert.equal(options.headers.apikey,"testing-public-key");
      assert.equal(options.headers.Authorization,undefined,
        "Opaque Supabase publishable key must not be used as Bearer JWT");
      const match=users.find(x=>x.email===body.email&&x.password===body.password);
      return Response.json(match?{user:{id:match.id,email:match.email}}:{error:"invalid"},{
        status:match?200:400});
    }
    if(u.pathname==="/auth/v1/recover"){
      assert.equal(options.headers.Authorization,undefined);
      assert.equal(options.headers.apikey,"testing-public-key");
      return Response.json({});
    }
    if(u.pathname==="/auth/v1/invite"){
      assert.equal(options.headers.apikey,"testing-secret-key");
      assert.equal(options.headers.Authorization,undefined,
        "Opaque Supabase secret key must not be used as Bearer JWT");
      return Response.json({id:"new-invite",email:body.email});
    }
    if(u.pathname==="/auth/v1/user"&&options?.method==="GET")
      return Response.json({id:"new-invite",email:"invited@example.test"});
    if(u.pathname==="/auth/v1/user"&&options?.method==="PUT")return Response.json({id:"new-invite"});
    throw Error("Unexpected external request: "+u);
  };
  try {await fn();} finally {globalThis.fetch=original;}
}
test("closed when not configured",async()=>{
  const res=await worker.fetch(req("/stream/session"),{});
  assert.equal(res.status,503);
});
test("unauthenticated private data denied and login has no signup",async()=>{
  const {env}=testEnvironment();
  assert.equal((await worker.fetch(req("/stream/favorites"),env)).status,401);
  const loginPage=await worker.fetch(req("/stream/login"),env);
  assert.equal(loginPage.status,200);
  assert.equal(loginPage.headers.get("Referrer-Policy"),"same-origin",
    "HTML forms require same-origin policy to avoid Chrome Origin:null");
  const html=await loginPage.text();
  assert.match(html,/Esqueci minha senha/);
  assert.doesNotMatch(html,/Cadastre-se/);
});
test("separate accounts cannot access one another's favorites",async()=>{
  await withFakeSupabase(async()=>{
    const {env,favorites}=testEnvironment();
    const a=cookie(await login(users[0].email,users[0].password,env));
    const b=cookie(await login(users[1].email,users[1].password,env));
    const post=await worker.fetch(req("/stream/favorites",{
      method:"POST",headers:{Cookie:a,"Content-Type":"application/json"},
      body:JSON.stringify({operation:"add",key:"BR:programa-a",user_id:users[1].id})
    }),env);
    assert.equal(post.status,200);
    const readA=await worker.fetch(req("/stream/favorites",{headers:{Cookie:a}}),env);
    const readB=await worker.fetch(req("/stream/favorites",{headers:{Cookie:b}}),env);
    assert.deepEqual((await readA.json()).favorites,["BR:programa-a"]);
    assert.deepEqual((await readB.json()).favorites,[]);
    assert.deepEqual([...favorites.get(users[0].id)],["BR:programa-a"]);
    assert.equal(favorites.get(users[1].id),undefined);
    const admin=await worker.fetch(req("/stream/admin",{headers:{Cookie:b}}),env);
    assert.equal(admin.status,403);
  });
});
test("suspending account immediately blocks an active session",async()=>{
  await withFakeSupabase(async()=>{
    const {env}=testEnvironment();
    const a=cookie(await login(users[0].email,users[0].password,env));
    const b=cookie(await login(users[1].email,users[1].password,env));
    const form=await getForm("/stream/admin",env,a);
    const suspended=await worker.fetch(req("/stream/admin/status",{
      method:"POST",headers:{Cookie:a+"; "+form.cookie,"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({user_id:users[1].id,status:"suspended",_csrf:form.token}).toString()
    }),env);
    assert.equal(suspended.status,303);
    assert.equal((await worker.fetch(req("/stream/session",{headers:{Cookie:b}}),env)).status,401);
    assert.equal((await worker.fetch(req("/stream/session",{headers:{Cookie:a}}),env)).status,200);
  });
});
test("CSRF check denies forged favorite writes and logout revokes session",async()=>{
  await withFakeSupabase(async()=>{
    const {env}=testEnvironment();
    const a=cookie(await login(users[0].email,users[0].password,env));
    const forged=await worker.fetch(new Request(base+"/stream/favorites",{
      method:"POST",headers:{Cookie:a,Origin:"https://evil.example",
        "Content-Type":"application/json"},
      body:JSON.stringify({operation:"add",key:"BR:bad"})
    }),env);
    assert.equal(forged.status,403);
    const logout=await worker.fetch(req("/stream/logout",{method:"POST",headers:{Cookie:a}}),env);
    assert.equal(logout.status,303);
    assert.equal((await worker.fetch(req("/stream/session",{headers:{Cookie:a}}),env)).status,401);
  });
});

test("private site uses bundled matching assets only after authentication",async()=>{
  await withFakeSupabase(async()=>{
    const {env}=testEnvironment();
    const seen=[];
    env.ASSETS={async fetch(req){
      seen.push(new URL(req.url).pathname);
      return new Response("/* private branch stream.js */",{
        headers:{"Content-Type":"text/javascript; charset=utf-8"}});
    }};
    const denied=await worker.fetch(req("/stream/stream.js"),env);
    assert.equal(denied.status,401);
    assert.deepEqual(seen,[]);
    const authCookie=cookie(await login(users[0].email,users[0].password,env));
    const allowed=await worker.fetch(req("/stream/stream.js",{headers:{Cookie:authCookie}}),env);
    assert.equal(allowed.status,200);
    assert.equal(await allowed.text(),"/* private branch stream.js */");
    assert.deepEqual(seen,["/stream/stream.js"]);
    assert.match(allowed.headers.get("Content-Security-Policy"),/default-src/);
    assert.equal(allowed.headers.get("Cache-Control"),"private, no-store");
    const missing=await worker.fetch(req("/stream/stream.css",{headers:{Cookie:authCookie}}),
      {...env,ASSETS:null});
    assert.equal(missing.status,503);
  });
});

test("Android browser form POST with Sec-Fetch-Site same-origin works when Origin absent",async()=>{
  await withFakeSupabase(async()=>{
    const {env}=testEnvironment();
    const form=await getForm("/stream/login",env);
    const response=await worker.fetch(new Request(base+"/stream/login",{
      method:"POST",
      headers:{Cookie:form.cookie,"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({email:users[0].email,password:users[0].password,_csrf:form.token}).toString()
    }),env);
    assert.equal(response.status,303);
    const c=cookie(response);
    const admin=await worker.fetch(req("/stream/admin",{headers:{Cookie:c}}),env);
    assert.equal(admin.status,200);
    assert.match(await admin.text(),/Central de Controle/);
  });
});
test("foreign Origin remains blocked even with forged same-origin fetch metadata",async()=>{
  await withFakeSupabase(async()=>{
    const {env}=testEnvironment();
    const form=await getForm("/stream/login",env);
    const response=await worker.fetch(new Request(base+"/stream/login",{
      method:"POST",
      headers:{Cookie:form.cookie,"Origin":"https://attacker.example","Sec-Fetch-Site":"same-origin",
        "Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({email:users[0].email,password:users[0].password,_csrf:form.token}).toString()
    }),env);
    assert.equal(response.status,403);
  });
});
test("POST without signed form cookie/token fails closed",async()=>{
  await withFakeSupabase(async()=>{
    const {env}=testEnvironment();
    const response=await worker.fetch(new Request(base+"/stream/login",{
      method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({email:users[0].email,password:users[0].password}).toString()
    }),env);
    assert.equal(response.status,403);
  });
});

test("wrong or forged signed form cookie is rejected in private browser",async()=>{
  await withFakeSupabase(async()=>{
    const {env}=testEnvironment();
    const form=await getForm("/stream/login",env);
    const forged=await worker.fetch(new Request(base+"/stream/login",{
      method:"POST",
      headers:{Cookie:form.cookie.slice(0,-1)+"x","Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({email:users[0].email,password:users[0].password,_csrf:form.token})
    }),env);
    assert.equal(forged.status,403);
  });
});
test("recover form uses signed token when mobile sends no Origin",async()=>{
  await withFakeSupabase(async()=>{
    const {env}=testEnvironment();
    const form=await getForm("/stream/recover",env);
    const result=await worker.fetch(new Request(base+"/stream/recover",{
      method:"POST",
      headers:{Cookie:form.cookie,"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({email:"unknown@example.test",_csrf:form.token})
    }),env);
    assert.equal(result.status,200);
    assert.match(await result.text(),/Solicitação recebida/);
  });
});

test("admin destination survives login redirect and opens real management panel",async()=>{
  await withFakeSupabase(async()=>{
    const {env}=testEnvironment();
    const first=await worker.fetch(req("/stream/admin"),env);
    assert.equal(first.status,303);
    assert.equal(first.headers.get("Location"),base+"/stream/login?next=admin");
    const frm=await getForm("/stream/login?next=admin",env);
    assert.match(frm.html,/action='\/stream\/login\?next=admin'/);
    const result=await worker.fetch(req("/stream/login?next=admin",{
      method:"POST",
      headers:{Cookie:frm.cookie,"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({_csrf:frm.token,email:users[0].email,password:users[0].password})
    }),env);
    assert.equal(result.status,303);
    assert.equal(result.headers.get("Location"),base+"/stream/admin");
    const admin=await worker.fetch(req("/stream/admin",{headers:{Cookie:cookie(result)}}),env);
    assert.equal(admin.status,200);
    assert.match(await admin.text(),/Central de Controle/);
  });
});
test("viewer cannot use admin redirect; arbitrary next values cannot redirect elsewhere",async()=>{
  await withFakeSupabase(async()=>{
    const {env}=testEnvironment();
    const frm=await getForm("/stream/login?next=admin",env);
    const viewer=await worker.fetch(req("/stream/login?next=admin",{
      method:"POST",
      headers:{Cookie:frm.cookie,"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({_csrf:frm.token,email:users[1].email,password:users[1].password})
    }),env);
    assert.equal(viewer.status,303);
    assert.equal(viewer.headers.get("Location"),base+"/stream/");
    const evil=await getForm("/stream/login?next=https%3A%2F%2Fevil.example",env);
    assert.doesNotMatch(evil.html,/evil\.example/);
    const other=await worker.fetch(req("/stream/login?next=https%3A%2F%2Fevil.example",{
      method:"POST",
      headers:{Cookie:evil.cookie,"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({_csrf:evil.token,email:users[0].email,password:users[0].password})
    }),env);
    assert.equal(other.headers.get("Location"),base+"/stream/");
  });
});
test("already logged-in admin requesting management login goes straight to admin",async()=>{
  await withFakeSupabase(async()=>{
    const {env}=testEnvironment();
    const auth=await login(users[0].email,users[0].password,env);
    const nav=await worker.fetch(req("/stream/login?next=admin",{
      headers:{Cookie:cookie(auth)}
    }),env);
    assert.equal(nav.status,303);
    assert.equal(nav.headers.get("Location"),base+"/stream/admin");
  });
});

async function adminAction(env,session,path,targetId,fields={}) {
  const f=await getForm("/stream/admin",env,session);
  return worker.fetch(req("/stream/admin/"+path,{
    method:"POST",
    headers:{Cookie:session+"; "+f.cookie,"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({_csrf:f.token,user_id:targetId,...fields})
  }),env);
}
test("control center has searchable table, summary, detailed account actions, and no password exposure",async()=>{
  await withFakeSupabase(async()=>{
    const {env,accounts}=testEnvironment();
    const a=cookie(await login(users[0].email,users[0].password,env));
    const res=await worker.fetch(req("/stream/admin",{headers:{Cookie:a}}),env);
    assert.equal(res.status,200);
    const html=await res.text();
    assert.match(html,/Central de Controle/);
    assert.match(html,/id='member-search'/);
    assert.match(html,/Filtrar situação/);
    assert.match(html,/Gerenciar/);
    assert.match(html,/Enviar recuperação de senha/);
    assert.match(html,/Desconectar dispositivos/);
    assert.match(html,/Último login/);
    assert.match(html,/São Paulo/);
    assert.match(html,/name='_csrf'/);
    assert.match(res.headers.get("Content-Security-Policy"),/script-src 'nonce-/);
    assert.equal(res.headers.get("Cache-Control"),"private, no-store");
    assert.doesNotMatch(html,/Admin-test-password-123/);
    assert.ok(accounts.get(users[0].id).last_login_at>0);
    assert.ok(accounts.get(users[0].id).first_login_at>0);
  });
});
test("pending invitations can be canceled, cannot activate, and can be restored without deletion",async()=>{
  await withFakeSupabase(async()=>{
    const {env,accounts,events}=testEnvironment();
    const a=cookie(await login(users[0].email,users[0].password,env));
    const form=await getForm("/stream/admin",env,a);
    const invite=await worker.fetch(req("/stream/admin/invite",{
      method:"POST",headers:{Cookie:a+"; "+form.cookie,
        "Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({_csrf:form.token,email:"invited@example.test"})
    }),env);
    assert.equal(invite.status,303);
    assert.equal(invite.headers.get("Location"),base+"/stream/admin?result=invited");
    const u=accounts.get("new-invite");
    assert.equal(u.status,"invited");
    const cancel=await adminAction(env,a,"status",u.user_id,{status:"suspended"});
    assert.equal(cancel.status,303);
    assert.equal(cancel.headers.get("Location"),base+"/stream/admin?result=canceled");
    assert.equal(u.status,"suspended");
    assert.ok(u.canceled_invite_at>0);
    const blocked=await worker.fetch(req("/stream/activate",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({access_token:"fake-invited-token",password:"SafePassword12345"})
    }),env);
    assert.equal(blocked.status,403);
    const restored=await adminAction(env,a,"status",u.user_id,{status:"invited"});
    assert.equal(restored.status,303);
    assert.equal(u.status,"invited");
    assert.equal(u.canceled_invite_at,null);
    assert.ok(events.some(x=>x.action==="cancel-invite"));
    assert.ok(events.some(x=>x.action==="restore-invite"));
    assert.equal(accounts.has("new-invite"),true);
  });
});
test("administrator can request recovery and revoke sessions for active viewer without suspending account",async()=>{
  await withFakeSupabase(async()=>{
    const {env,accounts,events}=testEnvironment();
    const a=cookie(await login(users[0].email,users[0].password,env));
    const b=cookie(await login(users[1].email,users[1].password,env));
    const recovered=await adminAction(env,a,"recover",users[1].id);
    assert.equal(recovered.status,303);
    assert.equal(recovered.headers.get("Location"),base+"/stream/admin?result=recovered");
    assert.ok(events.some(x=>x.action==="recover"&&x.subject===users[1].id));
    const revoke=await adminAction(env,a,"revoke",users[1].id);
    assert.equal(revoke.status,303);
    assert.equal(accounts.get(users[1].id).status,"active");
    assert.equal((await worker.fetch(req("/stream/session",{headers:{Cookie:b}}),env)).status,401);
    assert.equal((await worker.fetch(req("/stream/session",{headers:{Cookie:a}}),env)).status,200);
    assert.ok(events.some(x=>x.action==="revoke"));
  });
});
test("viewer cannot access control center or send recovery email",async()=>{
  await withFakeSupabase(async()=>{
    const {env,events}=testEnvironment();
    const b=cookie(await login(users[1].email,users[1].password,env));
    const page=await worker.fetch(req("/stream/admin",{headers:{Cookie:b}}),env);
    assert.equal(page.status,403);
    const post=await worker.fetch(req("/stream/admin/recover",{
      method:"POST",headers:{Cookie:b,"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({user_id:users[0].id})
    }),env);
    assert.equal(post.status,403);
    assert.equal(events.length,0);
  });
});
