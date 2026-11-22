/* Security regression tests for owner-only Access Worker. Run with Node 22+. */
import assert from "node:assert/strict";
import test from "node:test";
import stream from "../cloudflare/stream-proxy.mjs";

const URL = "https://drivmatch.com/stream/";
const allow = (email="owner@example.test") => ({
  access:{ getIdentity: async () => ({email}) },
});
const ownerEnv = {STREAM_OWNER_EMAIL:"owner@example.test"};

test("Access unconfigured fails closed, even with an identity object", async () => {
  const result = await stream.fetch(new Request(URL), {}, allow());
  assert.equal(result.status,403);
});
test("Missing Access authentication fails closed", async () => {
  const result = await stream.fetch(new Request(URL), ownerEnv, {});
  assert.equal(result.status,403);
});
test("Forged email header does not authorize an anonymous request", async () => {
  const req = new Request(URL, {headers:{"cf-access-authenticated-user-email":"owner@example.test"}});
  const result = await stream.fetch(req, ownerEnv, {});
  assert.equal(result.status,403);
});
test("Wrong authenticated identity is denied", async () => {
  const result = await stream.fetch(new Request(URL), ownerEnv, allow("other@example.test"));
  assert.equal(result.status,403);
});
test("Cloudflare identity lookup errors fail closed", async () => {
  const ctx={access:{getIdentity:async()=>{throw Error("access provider down")}}};
  const result=await stream.fetch(new Request(URL), ownerEnv, ctx);
  assert.equal(result.status,403);
});
test("No access to News or original TV routes", async () => {
  for (const p of ["/news","/news/","/TV","/TV/","/stream-malicious"]) {
    const res = await stream.fetch(new Request("https://drivmatch.com"+p),ownerEnv,allow());
    assert.equal(res.status,404,p);
  }
});
test("Session endpoint requires real Cloudflare Access context", async () => {
  const res = await stream.fetch(new Request(URL+"session"),ownerEnv,{});
  assert.equal(res.status,403);
});
test("Owner session is permitted without Supabase", async () => {
  const res = await stream.fetch(new Request(URL+"session"),ownerEnv,allow());
  assert.equal(res.status,200);
  assert.deepEqual(await res.json(),{allowed:true});
  assert.match(res.headers.get("cache-control"),/no-store/);
});
test("Authorized owner can receive the page from independent Pages origin", async () => {
  const before=globalThis.fetch;
  try {
    let fetched="";
    globalThis.fetch=async (url) => {
      fetched=String(url);
      return new Response("<!doctype html><title>Stream</title>",{
        status:200,headers:{"Content-Type":"text/html"},
      });
    };
    const res = await stream.fetch(new Request(URL),ownerEnv,allow());
    assert.equal(res.status,200);
    assert.equal(fetched,"https://drivmatch.github.io/drivmatch-stream/index.html");
    assert.match(await res.text(),/Stream/);
  } finally {globalThis.fetch=before;}
});
test("Unrecognized files are not proxied", async () => {
  const res=await stream.fetch(new Request(URL+"config.js"),ownerEnv,allow());
  assert.equal(res.status,404);
});
test("Invalid methods are never accepted", async () => {
  const res=await stream.fetch(new Request(URL,{method:"POST"}),ownerEnv,allow());
  assert.equal(res.status,405);
});
