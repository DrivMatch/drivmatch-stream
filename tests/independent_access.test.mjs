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
    user_id:x.id,email:x.email,role:x.role,status:"active",approval_state:"approved",
    created_at:Math.floor(Date.now()/1000)-86400,first_login_at:null,last_login_at:null,
    activated_at:null,canceled_invite_at:null
  }]));
  const sessions = new Map();
  const favorites = new Map();
  const events = [];
  const emailBudget = [];
  const db = {
    prepare(statement){
      let args=[];
      return {
        bind(...values){args=values;return this;},
        async first(){
          if(statement.startsWith("SELECT COUNT(*) AS used FROM stream_email_budget")) {
            return {used:emailBudget.filter(x=>x.day===args[0]).length};
          }
          if(statement.includes("FROM stream_sessions s")) {
            const session=sessions.get(args[0]);
            if(!session || session.expires_at <= args[1])return null;
            const user=accounts.get(session.user_id);
            return user?.status==="active"&&user.approval_state==="approved"?{...user,admin_verified_until:session.admin_verified_until||0}:null;
          }
          if(statement.includes("WHERE user_id=? AND email=? AND status='active'")) {
            const user=accounts.get(args[0]);
            return user?.email===args[1]&&user.status==="active"&&user.approval_state==="approved"?{...user}:null;
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
          if(statement.startsWith("INSERT INTO stream_email_budget")) {
            const [request_id,day,kind,dayCheck,limit,category,publicDay,publicLimit,signupKind,signupDay,signupLimit]=args;
            assert.equal(day,dayCheck);
            assert.equal(kind,category);
            assert.equal(day,publicDay);
            assert.equal(day,signupDay);
            assert.equal(kind,signupKind);
            const total=emailBudget.filter(x=>x.day===day).length;
            const publicTotal=emailBudget.filter(x=>x.day===day && x.kind==="public-recover").length;
            const signupTotal=emailBudget.filter(x=>x.day===day && x.kind==="signup").length;
            if(total>=limit || (kind==="public-recover" && publicTotal>=publicLimit) ||
              (kind==="signup" && signupTotal>=signupLimit))
              return {success:true,meta:{changes:0}};
            emailBudget.push({request_id,day,kind,status:"reserved"});
            return {success:true,meta:{changes:1}};
          } else if(statement.startsWith("UPDATE stream_email_budget SET status=")) {
            const ticket=emailBudget.find(x=>x.request_id===args[0]);
            if(ticket)ticket.status="accepted";
          } else if(statement.startsWith("DELETE FROM stream_email_budget")) {
            const idx=emailBudget.findIndex(x=>x.request_id===args[0] && x.status==="reserved");
            if(idx>=0)emailBudget.splice(idx,1);
          } else if(statement.startsWith("INSERT INTO stream_sessions")) {
            sessions.set(args[0],{user_id:args[1],expires_at:args[2],
              admin_verified_until:args[3]||0});
          } else if(statement.startsWith("UPDATE stream_sessions SET admin_verified_until=")) {
            const entry=sessions.get(args[1]);
            const account=accounts.get(args[2]);
            if(!entry || entry.user_id!==args[2] || entry.expires_at<=args[3] ||
                account?.user_id!==args[4] || account?.email!==args[5] ||
                account?.role!=="admin" || account?.status!=="active")
              return {success:true,meta:{changes:0}};
            entry.admin_verified_until=args[0];
            return {success:true,meta:{changes:1}};
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
          } else if(statement.startsWith("UPDATE stream_users SET approval_state=?")) {
            const account=accounts.get(args[3]);
            if(account?.role==="viewer" && account.status==="active" && account.approval_state==="pending"){
              account.approval_state=args[0];account.status=args[1];
              return {success:true,meta:{changes:1}};
            }
            return {success:true,meta:{changes:0}};
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
          } else if(statement.startsWith("INSERT OR IGNORE INTO stream_users")) {
            const exists=[...accounts.values()].some(x=>x.email===args[1]||x.user_id===args[0]);
            if(!exists)accounts.set(args[0],{user_id:args[0],email:args[1],
              role:"viewer",status:"active",approval_state:"pending",created_at:Math.floor(Date.now()/1000),
              activated_at:null,first_login_at:null,last_login_at:null,canceled_invite_at:null});
          } else if(statement.startsWith("INSERT INTO stream_users")) {
            accounts.set(args[0],{user_id:args[0],email:args[1],role:"viewer",status:"invited",approval_state:"approved",
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
  return {env,accounts,sessions,favorites,events,emailBudget};
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
  // Administrator explicitly starts from the admin destination, so the
  // password-based login grants a fresh 10-minute elevated D1 session.
  const path=email===users[0].email?"/stream/login?next=admin":"/stream/login";
  const form=await getForm(path,env);
  return worker.fetch(req(path,{
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
    if(u.pathname==="/auth/v1/signup"){
      assert.equal(options.headers.apikey,"testing-public-key");
      assert.equal(options.headers.Authorization,undefined);
      if(body.email==="smtp-error@example.test")
        return Response.json({error_code:"email_address_not_authorized"},{status:422});
      if(body.email==="provider-limit@example.test")
        return Response.json({error_code:"over_email_send_rate_limit"},{status:429});
      return Response.json({user:{id:"706664d1-cd56-47bb-9a20-17eebc5851bc",
        email:body.email,identities:[{provider:"email"}]},session:null});
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
      if(body.email==="outside@example.test")
        return Response.json({error_code:"email_address_not_authorized",
          msg:"Email not authorized by the default sender"},{status:422});
      if(body.email==="limited@example.test")
        return Response.json({error_code:"over_email_send_rate_limit",
          msg:"Rate limit reached"},{status:429});
      return Response.json({id:"new-invite",email:body.email});
    }
    if(u.pathname==="/auth/v1/admin/generate_link"){
      assert.equal(options.headers.apikey,"testing-secret-key");
      assert.equal(options.headers.Authorization,undefined);
      const id=body.email==="invited@example.test"?"new-invite":"manual-user";
      const redirect=body.redirect_to;
      const link="https://example.supabase.co/auth/v1/verify?type="+body.type+
        "&token=opaque-invitation-token&redirect_to="+encodeURIComponent(redirect);
      return Response.json({id,email:body.email,action_link:link});
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
test("unauthenticated private data denied but login offers public signup",async()=>{
  const {env}=testEnvironment();
  assert.equal((await worker.fetch(req("/stream/favorites"),env)).status,401);
  const loginPage=await worker.fetch(req("/stream/login"),env);
  assert.equal(loginPage.status,200);
  assert.equal(loginPage.headers.get("Referrer-Policy"),"same-origin",
    "HTML forms require same-origin policy to avoid Chrome Origin:null");
  const html=await loginPage.text();
  assert.match(html,/Esqueci minha senha/);
  assert.match(html,/Criar conta/);
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
    assert.deepEqual(seen,["/stream.js"]);
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
    assert.match(await admin.text(),/Confirmar acesso administrativo/);
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

test("both Pages hosts request recovery using the approved Supabase callback",async t=>{
  const {env}=testEnvironment();
  const approved="https://drivmatch-stream-v2-test.drivmatch.workers.dev";
  const provider=t.mock.method(globalThis,"fetch",async resource=>{
    const target=new URL(resource);
    assert.equal(target.origin,"https://example.supabase.co");
    assert.equal(target.pathname,"/auth/v1/recover");
    assert.equal(target.searchParams.get("redirect_to"),approved+"/stream/activate");
    return Response.json({});
  });
  for(const origin of ["https://streamnow-2o1.pages.dev","https://contas-compartilhadas.streamnow-2o1.pages.dev"]){
    const url=origin+"/stream/recover";
    const response=await worker.fetch(new Request(url),env);
    const csrf=response.headers.get("Set-Cookie").split(";")[0];
    const token=(await response.text()).match(/name='_csrf' value='([^']+)'/)[1];
    const result=await worker.fetch(new Request(url,{
      method:"POST",headers:{Cookie:csrf,Origin:origin},
      body:new URLSearchParams({email:"fixture@example.test",_csrf:token})
    }),env);
    assert.equal(result.status,200);
  }
  assert.equal(provider.mock.callCount(),2);
  const setup=await worker.fetch(new Request(approved+"/stream/activate?next=https://foreign.example"),env);
  const body=await setup.text();
  assert.match(body,/https:\/\/streamnow-2o1\.pages\.dev\/stream\/login/);
  assert.doesNotMatch(body,/foreign\.example/);
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

test("Supabase SMTP invite failure keeps administrator inside console with diagnostic",async()=>{
  await withFakeSupabase(async()=>{
    const {env,accounts}=testEnvironment();
    const a=cookie(await login(users[0].email,users[0].password,env));
    const form=await getForm("/stream/admin",env,a);
    const result=await worker.fetch(req("/stream/admin/invite",{
      method:"POST",headers:{Cookie:a+"; "+form.cookie,
        "Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({_csrf:form.token,email:"outside@example.test"})
    }),env);
    assert.equal(result.status,200);
    const html=await result.text();
    assert.match(html,/Falha no convite/);
    assert.match(html,/SMTP próprio/);
    assert.match(html,/Central de Controle/);
    assert.doesNotMatch(html,/Email not authorized by the default sender/);
    assert.equal([...accounts.values()].filter(x=>x.email==="outside@example.test").length,0);
  });
});
test("rate-limit errors show a helpful message without losing the admin console",async()=>{
  await withFakeSupabase(async()=>{
    const {env}=testEnvironment();
    const a=cookie(await login(users[0].email,users[0].password,env));
    const form=await getForm("/stream/admin",env,a);
    const result=await worker.fetch(req("/stream/admin/invite",{
      method:"POST",headers:{Cookie:a+"; "+form.cookie,
        "Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({_csrf:form.token,email:"limited@example.test"})
    }),env);
    assert.equal(result.status,200);
    assert.match(await result.text(),/limite de e-mails/);
  });
});
test("admin can generate one-time private invite link without sending any email",async()=>{
  await withFakeSupabase(async()=>{
    const {env,accounts,events}=testEnvironment();
    const a=cookie(await login(users[0].email,users[0].password,env));
    const form=await getForm("/stream/admin",env,a);
    const result=await worker.fetch(req("/stream/admin/link-invite",{
      method:"POST",headers:{Cookie:a+"; "+form.cookie,
        "Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({_csrf:form.token,email:"manual@example.test"})
    }),env);
    assert.equal(result.status,200);
    const html=await result.text();
    assert.match(html,/Link privado gerado/);
    assert.match(html,/Copiar link/);
    assert.match(html,/opaque-invitation-token/);
    assert.match(html,/Criar senha|senha/i);
    assert.equal(accounts.get("manual-user")?.email,"manual@example.test");
    assert.equal(accounts.get("manual-user")?.status,"invited");
    assert.ok(events.some(x=>x.action==="invite-link"));
    const fresh=await worker.fetch(req("/stream/admin",{headers:{Cookie:a}}),env);
    assert.doesNotMatch(await fresh.text(),/opaque-invitation-token/,
      "Generated links must not be persisted inside ordinary admin page.");
  });
});
test("manual reissue for pending user uses recovery link and does not change assigned user",async()=>{
  await withFakeSupabase(async()=>{
    const {env,accounts}=testEnvironment();
    accounts.set("new-invite",{user_id:"new-invite",email:"invited@example.test",
      role:"viewer",status:"invited",created_at:Math.floor(Date.now()/1000),
      first_login_at:null,last_login_at:null,canceled_invite_at:null});
    const a=cookie(await login(users[0].email,users[0].password,env));
    const form=await getForm("/stream/admin",env,a);
    const result=await worker.fetch(req("/stream/admin/link-invite",{
      method:"POST",headers:{Cookie:a+"; "+form.cookie,
        "Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({_csrf:form.token,email:"invited@example.test"})
    }),env);
    assert.equal(result.status,200);
    const html=await result.text();
    assert.match(html,/type=recovery/);
    assert.equal(accounts.get("new-invite").status,"invited");
  });
});
test("viewer is blocked from generating private invite links",async()=>{
  await withFakeSupabase(async()=>{
    const {env}=testEnvironment();
    const b=cookie(await login(users[1].email,users[1].password,env));
    const form=await getForm("/stream/admin",env,cookie(await login(users[0].email,users[0].password,env)));
    const result=await worker.fetch(req("/stream/admin/link-invite",{
      method:"POST",headers:{Cookie:b+"; "+form.cookie,
        "Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({_csrf:form.token,email:"another@example.test"})
    }),env);
    assert.equal(result.status,403);
  });
});

test("20 accepted email requests per São Paulo day shared by admin recovery and invites",async()=>{
  await withFakeSupabase(async()=>{
    const {env,emailBudget,events}=testEnvironment();
    const a=cookie(await login(users[0].email,users[0].password,env));
    for(let i=0;i<20;i++) {
      const response=await adminAction(env,a,"recover",users[1].id);
      assert.equal(response.status,303,"Recovery email "+(i+1)+" should be accepted");
    }
    assert.equal(emailBudget.length,20);
    assert.ok(emailBudget.every(x=>x.status==="accepted"));
    assert.equal(events.filter(x=>x.action==="recover").length,20);
    const after=await adminAction(env,a,"recover",users[1].id);
    assert.equal(after.status,200);
    const html=await after.text();
    assert.match(html,/Limite diário atingido: 20/);
    assert.match(html,/E-mails solicitados hoje: 20 de 20/);
    assert.equal(emailBudget.length,20);
    assert.equal(events.filter(x=>x.action==="recover").length,20);
    // Manual-link operations do not send mail and must not consume the quota.
    const form=await getForm("/stream/admin",env,a);
    const link=await worker.fetch(req("/stream/admin/link-invite",{
      method:"POST",headers:{Cookie:a+"; "+form.cookie,
        "Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({_csrf:form.token,email:"no-mail@example.test"})
    }),env);
    assert.equal(link.status,200);
    assert.equal(emailBudget.length,20);
  });
});
test("known Supabase rejected SMTP invitation or rate limit consumes zero budget",async()=>{
  await withFakeSupabase(async()=>{
    const {env,emailBudget}=testEnvironment();
    const a=cookie(await login(users[0].email,users[0].password,env));
    for(const email of ["outside@example.test","limited@example.test"]){
      const form=await getForm("/stream/admin",env,a);
      const rejected=await worker.fetch(req("/stream/admin/invite",{
        method:"POST",headers:{Cookie:a+"; "+form.cookie,
          "Content-Type":"application/x-www-form-urlencoded"},
        body:new URLSearchParams({_csrf:form.token,email})
      }),env);
      assert.equal(rejected.status,200);
      assert.match(await rejected.text(),/Falha no convite/);
      assert.equal(emailBudget.length,0,"Rejected request should refund its slot");
    }
  });
});
test("public password recovery uses no more than 5 of the global 20 daily slots",async()=>{
  await withFakeSupabase(async()=>{
    const {env,emailBudget}=testEnvironment();
    for(let i=0;i<8;i++){
      const f=await getForm("/stream/recover",env);
      const result=await worker.fetch(req("/stream/recover",{
        method:"POST",headers:{Cookie:f.cookie,
          "Content-Type":"application/x-www-form-urlencoded"},
        body:new URLSearchParams({_csrf:f.token,email:"public-user@example.test"})
      }),env);
      assert.equal(result.status,200);
      assert.match(await result.text(),/Solicitação recebida/);
    }
    assert.equal(emailBudget.length,5);
    assert.ok(emailBudget.every(x=>x.kind==="public-recover"));
    const a=cookie(await login(users[0].email,users[0].password,env));
    const admin=await worker.fetch(req("/stream/admin",{headers:{Cookie:a}}),env);
    assert.match(await admin.text(),/E-mails solicitados hoje: 5 de 20/);
  });
});

test("existing administrator session requires their actual password before opening console",async()=>{
  await withFakeSupabase(async()=>{
    const {env,sessions}=testEnvironment();
    // Normal Stream login is not a privileged login.
    const frm=await getForm("/stream/login",env);
    const signed=await worker.fetch(req("/stream/login",{
      method:"POST",
      headers:{Cookie:frm.cookie,"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({_csrf:frm.token,email:users[0].email,password:users[0].password})
    }),env);
    assert.equal(signed.status,303);
    const sessionCookie=cookie(signed);
    let verify=await getForm("/stream/admin",env,sessionCookie);
    assert.match(verify.html,/Confirmar acesso administrativo/);
    assert.doesNotMatch(verify.html,/Central de Controle/);
    const wrong=await worker.fetch(req("/stream/admin/verify",{
      method:"POST",
      headers:{Cookie:sessionCookie+"; "+verify.cookie,"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({_csrf:verify.token,password:"invalid-secret"})
    }),env);
    assert.equal(wrong.status,401);
    assert.match(await wrong.text(),/Senha administrativa não validada/);
    assert.equal([...sessions.values()][0].admin_verified_until,0);
    verify=await getForm("/stream/admin",env,sessionCookie);
    const success=await worker.fetch(req("/stream/admin/verify",{
      method:"POST",
      headers:{Cookie:sessionCookie+"; "+verify.cookie,"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({_csrf:verify.token,password:users[0].password})
    }),env);
    assert.equal(success.status,303);
    assert.equal(success.headers.get("Location"),base+"/stream/admin");
    const after=await worker.fetch(req("/stream/admin",{headers:{Cookie:sessionCookie}}),env);
    assert.equal(after.status,200);
    assert.match(await after.text(),/Central de Controle/);
    assert.ok([...sessions.values()][0].admin_verified_until>Math.floor(Date.now()/1000));
  });
});
test("expired admin verification immediately locks management without removing admin role",async()=>{
  await withFakeSupabase(async()=>{
    const {env,sessions,accounts}=testEnvironment();
    const adminCookie=cookie(await login(users[0].email,users[0].password,env));
    for(const session of sessions.values())if(session.user_id===users[0].id)
      session.admin_verified_until=Math.floor(Date.now()/1000)-1;
    const view=await worker.fetch(req("/stream/admin",{headers:{Cookie:adminCookie}}),env);
    assert.equal(view.status,200);
    assert.match(await view.text(),/Confirmar acesso administrativo/);
    const denied=await worker.fetch(req("/stream/admin/status",{
      method:"POST",
      headers:{Cookie:adminCookie,"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({user_id:users[1].id,status:"suspended"})
    }),env);
    assert.equal(denied.status,403);
    assert.equal(accounts.get(users[0].id).role,"admin");
    assert.equal(accounts.get(users[1].id).status,"active");
  });
});
test("viewer cannot step up as administrator even with administrator password",async()=>{
  await withFakeSupabase(async()=>{
    const {env}=testEnvironment();
    const viewerCookie=cookie(await login(users[1].email,users[1].password,env));
    const frm=await getForm("/stream/login",env);
    const result=await worker.fetch(req("/stream/admin/verify",{
      method:"POST",
      headers:{Cookie:viewerCookie+"; "+frm.cookie,
        "Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({_csrf:frm.token,password:users[0].password})
    }),env);
    assert.equal(result.status,403);
    const admin=await worker.fetch(req("/stream/admin",{headers:{Cookie:viewerCookie}}),env);
    assert.equal(admin.status,403);
    assert.doesNotMatch(await admin.text(),/Central de Controle/);
  });
});

test("an account can explicitly import browser favorites on the official Pages origin", async()=>{
  await withFakeSupabase(async()=>{
    const {env,favorites}=testEnvironment();
    const viewer=users[1];
    const session=cookie(await login(viewer.email,viewer.password,env));
    const official="https://streamnow-2o1.pages.dev";
    const imported=(origin,account,keys,requestOrigin=origin)=>worker.fetch(new Request(origin+"/stream/favorites",{
      method:"POST",
      headers:{Cookie:session,Origin:requestOrigin,"Content-Type":"application/json",
        ...(account?{"X-Stream-Account":account}:{})},
      body:JSON.stringify({operation:"import",keys})
    }),env);
    assert.equal((await imported(base,viewer.id,["BR:local"])).status,403);
    assert.equal((await imported(official,null,["BR:local"])).status,409);
    assert.equal((await imported(official,users[0].id,["BR:local"])).status,409);
    assert.equal((await imported(official,viewer.id,["BR:local"],"https://other.example")).status,403);
    assert.equal((await imported(official,viewer.id,Array(21).fill("BR:local"))).status,400);
    assert.equal((await imported(official,viewer.id,["BR:local","BR:local"])).status,200);
    assert.deepEqual([...favorites.get(viewer.id)],["BR:local"]);
    assert.equal(favorites.get(users[0].id),undefined);
  });
});


test("site and APK WebView can open signed self-registration form without invitation",async()=>{
  const {env}=testEnvironment();
  const signIn=await worker.fetch(req("/stream/login"),env);
  assert.match(await signIn.text(),/href='\/stream\/signup'/);
  const form=await getForm("/stream/signup",env);
  assert.match(form.html,/type='email'/);
  assert.match(form.html,/minlength='12'/);
  assert.match(form.html,/\/stream\/brand.webp/);
  assert.doesNotMatch(form.html,/Sua TV, do seu jeito|Área pessoal/i);
});
test("public signup creates viewer row under shared 20/day quota, no invitation",async()=>{
  await withFakeSupabase(async()=>{
    const {env,accounts,emailBudget}=testEnvironment();
    const f=await getForm("/stream/signup",env);
    const created=await worker.fetch(req("/stream/signup",{method:"POST",
      headers:{Cookie:f.cookie,"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({_csrf:f.token,email:"joiner@example.test",
        password:"New-user-password-12345",confirm:"New-user-password-12345"})
    }),env);
    assert.equal(created.status,200);
    assert.match(await created.text(),/Cadastro solicitado/);
    const account=accounts.get("706664d1-cd56-47bb-9a20-17eebc5851bc");
    assert.equal(account.status,"active");
    assert.equal(account.approval_state,"pending");
    assert.equal(account.role,"viewer");
    assert.equal(account.email,"joiner@example.test");
    assert.equal(emailBudget.length,1);
    assert.equal(emailBudget[0].kind,"signup");
    assert.equal(emailBudget[0].status,"accepted");
  });
});
test("invalid or forged signup does not call email service or create account",async()=>{
  await withFakeSupabase(async()=>{
    const {env,accounts,emailBudget}=testEnvironment();
    const f=await getForm("/stream/signup",env);
    const bad=await worker.fetch(req("/stream/signup",{method:"POST",
      headers:{Cookie:f.cookie,"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({_csrf:f.token,email:"joiner@example.test",
        password:"New-user-password-12345",confirm:"wrong-password"})
    }),env);
    assert.equal(bad.status,400);
    const forged=await worker.fetch(req("/stream/signup",{method:"POST",
      headers:{"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({email:"joiner@example.test",
        password:"New-user-password-12345",confirm:"New-user-password-12345"})
    }),env);
    assert.equal(forged.status,403);
    assert.equal(emailBudget.length,0);
    assert.equal(accounts.size,2);
  });
});
test("public signup shares existing 20/day total email cap, without extra arbitrary cutoff",async()=>{
  await withFakeSupabase(async()=>{
    const {env,accounts,emailBudget}=testEnvironment();
    for(let i=0;i<22;i++){
      const f=await getForm("/stream/signup",env);
      const result=await worker.fetch(req("/stream/signup",{method:"POST",
        headers:{Cookie:f.cookie,"Content-Type":"application/x-www-form-urlencoded"},
        body:new URLSearchParams({_csrf:f.token,email:"member"+i+"@example.test",
          password:"New-user-password-12345",confirm:"New-user-password-12345"})
      }),env);
      assert.equal(result.status,i<20?200:429);
    }
    assert.equal(emailBudget.length,20);
    assert.ok(emailBudget.every(e=>e.kind==="signup"));
    assert.equal(accounts.get(users[0].id).role,"admin");
  });
});
test("known SMTP signup rejection refunds reservation and gives clear error",async()=>{
  await withFakeSupabase(async()=>{
    const {env,emailBudget}=testEnvironment();
    const f=await getForm("/stream/signup",env);
    const r=await worker.fetch(req("/stream/signup",{method:"POST",
      headers:{Cookie:f.cookie,"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({_csrf:f.token,email:"smtp-error@example.test",
        password:"New-user-password-12345",confirm:"New-user-password-12345"})
    }),env);
    assert.equal(r.status,503);
    assert.match(await r.text(),/Cadastro indisponível/);
    assert.equal(emailBudget.length,0);
  });
});

test("self-signup waits for administrator approval; approval permits login",async()=>{
  await withFakeSupabase(async()=>{
    const {env,accounts,events}=testEnvironment();
    accounts.get(users[1].id).approval_state="pending";
    const denied=await login(users[1].email,users[1].password,env);
    assert.equal(denied.status,401);
    const a=cookie(await login(users[0].email,users[0].password,env));
    const board=await worker.fetch(req("/stream/admin",{headers:{Cookie:a}}),env);
    const html=await board.text();
    assert.match(html,/Aguardando aprova(?:ção|&#)/);
    assert.match(html,/Aprovar cadastro/);
    assert.match(html,/Rejeitar cadastro/);
    assert.match(html,/name='decision' value='approved'/);
    const approved=await adminAction(env,a,"approval",users[1].id,{decision:"approved"});
    assert.equal(approved.status,303);
    assert.equal(accounts.get(users[1].id).approval_state,"approved");
    assert.ok(events.some(e=>e.action==="signup-approved"));
    assert.equal((await login(users[1].email,users[1].password,env)).status,303);
    assert.equal((await adminAction(env,a,"approval",users[1].id,{decision:"approved"})).status,409);
  });
});
test("administrator can reject signup; rejected user stays blocked and cannot be reactivated via status",async()=>{
  await withFakeSupabase(async()=>{
    const {env,accounts,sessions}=testEnvironment();
    const viewer=accounts.get(users[1].id);
    const old=cookie(await login(users[1].email,users[1].password,env));
    viewer.approval_state="pending";
    assert.equal((await worker.fetch(req("/stream/session",{headers:{Cookie:old}}),env)).status,401);
    const blocked=await worker.fetch(req("/stream/session",{headers:{Cookie:old}}),env);
    assert.equal(blocked.status,401);
    assert.match(await blocked.text(),/Autenticação necessária/);
    const admin=cookie(await login(users[0].email,users[0].password,env));
    const rejected=await adminAction(env,admin,"approval",viewer.user_id,{decision:"rejected"});
    assert.equal(rejected.status,303);
    assert.equal(viewer.status,"suspended");
    assert.equal(viewer.approval_state,"rejected");
    assert.equal((await login(users[1].email,users[1].password,env)).status,401);
    assert.equal((await adminAction(env,admin,"status",viewer.user_id,{status:"active"})).status,409);
    assert.equal([...sessions.values()].some(s=>s.user_id===viewer.user_id),false);
  });
});
test("viewer cannot approve their own request or bypass signed administrative form",async()=>{
  await withFakeSupabase(async()=>{
    const {env,accounts}=testEnvironment();
    accounts.get(users[1].id).approval_state="pending";
    const a=cookie(await login(users[0].email,users[0].password,env));
    const request=await worker.fetch(req("/stream/admin/approval",{
      method:"POST",headers:{Cookie:a,"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({user_id:users[1].id,decision:"approved"})
    }),env);
    assert.equal(request.status,403);
    assert.equal(accounts.get(users[1].id).approval_state,"pending");
  });
});
