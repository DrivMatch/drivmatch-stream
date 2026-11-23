import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {daysSinceFirstLogin,renderAccessConsole} from "../cloudflare/admin-console.mjs";

const unix=iso=>Math.floor(new Date(iso).getTime()/1000);

test("first access is zero days on the same São Paulo calendar date",()=>{
  const first=unix("2026-11-23T22:48:00Z"); // 19:48 São Paulo
  const checked=unix("2026-11-23T23:03:00Z"); // 20:03 São Paulo
  assert.equal(daysSinceFirstLogin(first,checked),0);
});

test("at local midnight Sao Paulo the user gains one calendar day",()=>{
  const first=unix("2026-11-23T22:48:00Z"); // 19:48 SP
  assert.equal(daysSinceFirstLogin(first,unix("2026-11-24T02:59:59Z")),0);
  assert.equal(daysSinceFirstLogin(first,unix("2026-11-24T03:00:00Z")),1);
  assert.equal(daysSinceFirstLogin(first,unix("2026-11-25T03:00:00Z")),2);
});

test("calendar day count is independent of an individual session duration",()=>{
  const first=unix("2026-11-01T13:00:00Z");
  assert.equal(daysSinceFirstLogin(first,unix("2026-11-23T23:00:00Z")),22);
  assert.equal(daysSinceFirstLogin(0,unix("2026-11-23T23:00:00Z")),null);
  assert.equal(daysSinceFirstLogin(null,unix("2026-11-23T23:00:00Z")),null);
  assert.equal(daysSinceFirstLogin(first,first-100),0);
});

test("administration detail shows elapsed days without editing user data",()=>{
  const first=unix("2026-11-23T22:48:00Z");
  const original={
    user_id:"viewer-1",email:"viewer@example.test",role:"viewer",status:"active",
    created_at:unix("2026-11-23T22:30:00Z"),activated_at:first-780,
    first_login_at:first,last_login_at:first,session_count:1
  };
  const data={...original};
  const {html}=renderAccessConsole({users:[data],actorId:"admin-1",
    token:"fake-token",asOfEpoch:unix("2026-11-23T23:03:00Z")});
  assert.match(html,/Dias desde o primeiro acesso/);
  assert.match(html,/0 dias corridos/);
  assert.match(html,/23\/11\/2026, 19:48/);
  assert.deepEqual(data,original);
});

test("pending invitation displays no elapsed login time instead of fabricated days",()=>{
  const {html}=renderAccessConsole({
    users:[{user_id:"invited-1",email:"pending@example.test",role:"viewer",
      status:"invited",created_at:unix("2026-11-23T22:30:00Z"),
      first_login_at:null,last_login_at:null}],
    actorId:"admin-1",token:"fake-token",asOfEpoch:unix("2026-11-23T23:03:00Z")
  });
  assert.match(html,/Dias desde o primeiro acesso/);
  assert.match(html,/Aguardando primeiro acesso/);
});

test("TV web and Android-compatible guide headers display exact requested 😺 stream",()=>{
  const guide=readFileSync(new URL("../site/tv.html",import.meta.url),"utf8");
  const home=readFileSync(new URL("../site/index.html",import.meta.url),"utf8");
  assert.match(guide,/<span class="logo" aria-hidden="true">😺<\/span><span><b>stream<\/b><\/span>/);
  assert.match(home,/<div class="brand-icon" aria-hidden="true"><span>😺<\/span><\/div>/);
  assert.match(home,/<h1>stream<\/h1>/);
  assert.doesNotMatch(guide,/<b>DrivMatch /);
});
test("admin header displays 😺 stream while retaining role and security controls",()=>{
  const {html}=renderAccessConsole({users:[],actorId:"root",token:"fake",
    asOfEpoch:unix("2026-11-23T23:03:00Z")});
  assert.match(html,/<div class='logo'>😺 <span>stream<\/span> · Administração<\/div>/);
  assert.match(html,/Área restrita · Administrador/);
});
