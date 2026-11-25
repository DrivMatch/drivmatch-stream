import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import worker from "../cloudflare/independent-access.mjs";
import {tastingConfig} from "../cloudflare/stripe-tasting.mjs";

const origin = "https://stream.example.test";
const path = "/stream/degustacao";
const account = "test-viewer";
const cookie = "dm_stream_user=" + "a".repeat(43);
const price = {
  id:"price_tasting", active:true, currency:"brl", unit_amount:0,
  type:"recurring", billing_scheme:"per_unit", recurring:{usage_type:"licensed"}, livemode:false
};

function fixture(t, {days = "7", unitAmount = 0, failOnce = false} = {}) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  for (const migration of ["0001_stream_identities.sql", "0002_stream_access_audit.sql", "0003_stream_email_budget.sql", "0004_stream_admin_stepup.sql", "0005_stream_tasting.sql", "0006_stream_public_signup.sql", "0007_stream_approval.sql", "0008_stream_signup_notifications.sql"]) {
    db.exec(readFileSync(new URL("../migrations/" + migration, import.meta.url), "utf8"));
  }
  db.prepare("INSERT INTO stream_users(user_id,email,status) VALUES(?,?,'active')")
    .run(account, "viewer@example.test");
  db.prepare("INSERT INTO stream_sessions(token_hash,user_id,expires_at) VALUES(?,?,unixepoch()+3600)")
    .run(createHash("sha256").update("a".repeat(43)).digest("base64url"), account);
  const env = {
    STREAM_USERS_DB:{prepare(sql) {
      const statement = db.prepare(sql);
      return {bind(...args) {
        return {first:async () => statement.get(...args),run:async () => statement.run(...args)};
      }};
    }},
    STREAM_LOGIN_LIMITER:{limit:async () => ({success:true})},
    STREAM_ACCESS_PASSWORD:"long-fixture-adapter-secret",
    SUPABASE_URL:"https://fixture.supabase.co",
    SUPABASE_PUBLIC_KEY:"fixture-publishable",
    SUPABASE_SECRET_KEY:"fixture-service-secret",
    STRIPE_TASTING_MODE:"test",
    STRIPE_TASTING_SECRET_KEY:"sk_test_fixture",
    STRIPE_TASTING_PRICE_ID:price.id,
    STRIPE_TASTING_DAYS:days
  };
  const calls = [];
  const effects = new Map();
  let failure = failOnce;
  t.mock.method(globalThis,"fetch",async (url, options) => {
    const endpoint = new URL(url);
    assert.equal(endpoint.origin,"https://api.stripe.com");
    assert.equal(options.headers.Authorization,"Bearer sk_test_fixture");
    calls.push({route:endpoint.pathname,...options});
    if (endpoint.pathname === "/v1/prices/" + price.id) {
      return Response.json({...price,unit_amount:unitAmount});
    }
    if (endpoint.pathname === "/v1/customers") {
      assert.equal(options.body.has("email"),false);
      assert.equal(options.body.has("payment_method"),false);
      assert.match(options.body.get("metadata[stream_now_tasting]"),/^[a-f0-9-]{36}$/);
      const key = options.headers["Idempotency-Key"];
      if (!effects.has(key)) effects.set(key,{id:"cus_tasting",livemode:false});
      return Response.json(effects.get(key));
    }
    const subscription = {
      id:"sub_tasting", customer:"cus_tasting", status:"active",
      items:{data:[{price}]}, livemode:false
    };
    if (endpoint.pathname === "/v1/subscriptions") {
      assert.equal(options.body.get("items[0][price]"),price.id);
      assert.equal(options.body.get("items[0][quantity]"),"1");
      assert.equal(options.body.get("currency"),"brl");
      assert.equal(options.body.get("automatic_tax[enabled]"),"false");
      assert.equal(options.body.get("payment_behavior"),"default_incomplete");
      assert.equal(options.body.has("default_payment_method"),false);
      const key = options.headers["Idempotency-Key"];
      if (!effects.has(key)) effects.set(key,subscription);
      if (failure) {
        failure = false;
        throw new Error("Response was lost after Stripe processed the request");
      }
      return Response.json(effects.get(key));
    }
    if (endpoint.pathname === "/v1/subscriptions/" + subscription.id) return Response.json(subscription);
    throw new Error("Unexpected provider endpoint");
  });
  return {db,env,calls,effects};
}

function get(env, testPath = path, session = cookie) {
  return worker.fetch(new Request(origin + testPath,{headers:{Cookie:session}}),env);
}

async function activation(env, requestOrigin = origin, expectedAccount = account) {
  const response = await get(env);
  const formCookie = response.headers.get("Set-Cookie").split(";")[0];
  const token = (await response.text()).match(/name='_csrf' value='([^']+)'/)[1];
  return () => worker.fetch(new Request(origin + path,{
    method:"POST",
    headers:{Origin:requestOrigin,Cookie:cookie + "; " + formCookie},
    body:new URLSearchParams({_csrf:token,account:expectedAccount})
  }),env);
}

test("configuration keeps test and live credentials separate", () => {
  const env = {STRIPE_TASTING_PRICE_ID:price.id, STRIPE_TASTING_DAYS:"0",
    STRIPE_TASTING_MODE:"test", STRIPE_TASTING_SECRET_KEY:"rk_test_fixture"};
  assert.equal(tastingConfig(env).days,0);
  assert.equal(tastingConfig({...env,STRIPE_TASTING_MODE:"live"}),null);
  assert.equal(tastingConfig({...env,STRIPE_TASTING_DAYS:"-1"}),null);
  assert.equal(tastingConfig({...env,STRIPE_TASTING_PRICE_ID:"prod_fixture"}),null);
});

test("invited accounts retain access and only an authenticated, same-origin form can start tasting", async t => {
  const {env,calls} = fixture(t);
  assert.equal((await get(env,path,"")).status,401);
  const disabled = {...env,STRIPE_TASTING_SECRET_KEY:""};
  assert.equal((await get(disabled,path)).status,404);
  assert.equal((await (await get(disabled,"/stream/session")).json()).allowed,true);
  assert.equal((await (await get(env,"/stream/session")).json()).tasting_available,true);
  const begin = await activation(env,"https://foreign.example");
  assert.equal((await begin()).status,403);
  assert.equal((await(await activation(env,origin,"other-account"))()).status,409);
  assert.equal(calls.length,0);
});

test("free activation tolerates retry and simultaneous requests with a single Stripe subscription", async t => {
  const {db,env,calls,effects} = fixture(t,{failOnce:true});
  const begin = await activation(env);
  assert.equal((await begin()).status,502);
  const retried = await Promise.all([begin(),begin()]);
  assert.ok(retried.every(response => response.status === 303));
  const saved = db.prepare("SELECT * FROM stream_tasting").get();
  assert.equal(saved.stripe_subscription_id,"sub_tasting");
  assert.equal(saved.ends_at - saved.started_at,7 * 86400);
  assert.equal(effects.size,2);
  const subscriptions = calls.filter(call => call.route === "/v1/subscriptions");
  assert.equal(new Set(subscriptions.map(call => call.headers["Idempotency-Key"])).size,1);
  assert.ok(subscriptions.every(call => call.body.get("cancel_at") === String(saved.ends_at)));
  assert.match(await (await get(env)).text(),/Plano ativo até/);
});

test("activation stops before any write to Stripe when the configured price can charge", async t => {
  const {env,calls,db} = fixture(t,{unitAmount:100});
  assert.equal((await(await activation(env))()).status,502);
  assert.deepEqual(calls.map(call => call.route),["/v1/prices/" + price.id]);
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM stream_tasting").get().total,0);
});

test("an unlimited plan omits cancellation and a completed fixed plan cannot duplicate its signup", async t => {
  const {env,calls,db} = fixture(t,{days:"0"});
  const begin = await activation(env);
  assert.equal((await begin()).status,303);
  assert.equal(calls.find(call => call.route === "/v1/subscriptions").body.has("cancel_at"),false);
  assert.match(await (await get(env)).text(),/Plano ativo sem prazo/);
  db.exec("UPDATE stream_tasting SET ends_at = unixepoch()-1");
  assert.equal((await begin()).status,303);
  assert.match(await (await get(env)).text(),/Plano encerrado/);
  assert.equal(calls.filter(call => call.route === "/v1/subscriptions").length,1);
});

 test("notification migration preserves existing email budget and approval states",t=>{
  const db=new DatabaseSync(":memory:");
  t.after(()=>db.close());
  const apply=name=>db.exec(readFileSync(new URL("../migrations/"+name,import.meta.url),"utf8"));
  for(const name of ["0001_stream_identities.sql","0002_stream_access_audit.sql","0003_stream_email_budget.sql","0004_stream_admin_stepup.sql","0005_stream_tasting.sql","0006_stream_public_signup.sql","0007_stream_approval.sql"])apply(name);
  db.exec("INSERT INTO stream_users(user_id,email,role,status,approval_state) VALUES('test-pending','pending@example.test','viewer','active','pending'); INSERT INTO stream_email_budget(request_id,local_day,kind,status) VALUES('old','2026-11-25','signup','accepted');");
  apply("0008_stream_signup_notifications.sql");
  assert.equal(db.prepare("SELECT approval_state FROM stream_users WHERE user_id='test-pending'").get().approval_state,"pending");
  assert.equal(db.prepare("SELECT signup_notice_state FROM stream_users WHERE user_id='test-pending'").get().signup_notice_state,"not_requested");
  assert.equal(db.prepare("SELECT status FROM stream_email_budget WHERE request_id='old'").get().status,"accepted");
  db.exec("INSERT INTO stream_email_budget(request_id,local_day,kind,status) VALUES('new','2026-11-25','signup-notice','accepted');");
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM stream_email_budget").get().total,2);
});
