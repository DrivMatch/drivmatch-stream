import test from "node:test";
import assert from "node:assert/strict";
import worker from "../cloudflare/stream-proxy.mjs";

const STAGING="https://streamnow-2o1.pages.dev",FORMER_UNAVAILABLE="https://streamnow.pages.dev";
const PASS="test-password-123456789",EMAIL="viewer@example.test";
const USER="25c8f362-3e8e-488c-a1f2-0a1c4ad60a85";
const assets=[];
const env={
  STREAM_ACCESS_PASSWORD:"local-signing-key-very-long-123",
  STREAM_SUPABASE_URL:"https://project-test.supabase.co",
  STREAM_SUPABASE_PUBLIC_KEY:"public-test-api-key-long-enough",
  ASSETS:{fetch:async r=>{const path=new URL(r.url).pathname;assets.push(path);
     return new Response(path,{status:200,headers:{"Content-Type":"text/plain"}});}}
};
function loginRequest(host=STAGING,password=PASS,email=EMAIL){
 return new Request(host+"/stream/login",{
  method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","Origin":host},
  body:new URLSearchParams({email,password}).toString()
 });
}
async function mockSupabase(authStatus,fn){
 const original=globalThis.fetch;
 globalThis.fetch=async (url,options)=>{
  assert.equal(String(url),"https://project-test.supabase.co/auth/v1/token?grant_type=password");
  assert.equal(options.method,"POST");
  assert.equal(options.headers.apikey,env.STREAM_SUPABASE_PUBLIC_KEY);
  const body=JSON.parse(options.body);
  assert.equal(body.email,EMAIL);
  if(authStatus===200)assert.equal(body.password,PASS);
  return new Response(authStatus===200?JSON.stringify({access_token:"mock-access-token",user:{id:USER}}):
      JSON.stringify({message:"invalid credentials"}),{status:authStatus,headers:{"Content-Type":"application/json"}});
 };
 try{return await fn();}
 finally{globalThis.fetch=original;}
}
test("Pages login never advertises invented slogan, personal area or a shared access password",async()=>{
 const response=await worker.fetch(new Request(STAGING+"/"),env);
 assert.equal(response.status,200);
 const page=await response.text();
 assert.match(page,/Stream Now/);
 assert.match(page,/type="email"/);
 assert.match(page,/Entre com o e-mail e a senha da sua conta/);
 assert.doesNotMatch(page,/Sua TV, do seu jeito|Área pessoal|senha particular|Digite sua senha particular/i);
 assert.equal(assets.length,0);
});
test("Pages without configured Supabase fails closed",async()=>{
 const response=await worker.fetch(new Request(STAGING+"/"),{STREAM_ACCESS_PASSWORD:env.STREAM_ACCESS_PASSWORD,ASSETS:env.ASSETS});
 assert.equal(response.status,503);
});
test("unconfirmed account cannot log in or receive a cookie",async()=>{
 await mockSupabase(400,async()=>{
  const result=await worker.fetch(loginRequest(),env);
  assert.equal(result.status,401);
  assert.equal(result.headers.get("set-cookie"),null);
  assert.match(await result.text(),/E-mail ou senha não reconhecidos/);
 });
});
test("confirmed Supabase account issues secure scoped session, accesses player, logs out",async()=>{
 await mockSupabase(200,async()=>{
  const signin=await worker.fetch(loginRequest(),env);
  assert.equal(signin.status,303);
  assert.equal(signin.headers.get("location"),STAGING+"/");
  const setCookie=signin.headers.get("set-cookie");
  assert.match(setCookie,/sn_account=/);
  assert.match(setCookie,/Path=\/;.*HttpOnly; Secure; SameSite=Strict/);
  const cookie=setCookie.split(";")[0];
  assets.length=0;
  const viewer=await worker.fetch(new Request(STAGING+"/",{headers:{Cookie:cookie}}),env);
  assert.equal(viewer.status,200);
  assert.equal(await viewer.text(),"/tv.html");
  assert.deepEqual(assets,["/tv.html"]);
  const session=await worker.fetch(new Request(STAGING+"/stream/session",{headers:{Cookie:cookie}}),env);
  assert.equal(session.status,200);
  const logout=await worker.fetch(new Request(STAGING+"/stream/logout",{method:"POST",headers:{Origin:STAGING}}),env);
  assert.equal(logout.status,303);
  assert.match(logout.headers.get("set-cookie"),/sn_account=; Path=\/; Max-Age=0/);
 });
});
test("shared PIN or standalone password cannot bypass email authentication on Pages",async()=>{
 const r=await worker.fetch(loginRequest(STAGING,PASS,"not-an-email"),env);
 assert.equal(r.status,401);
 assert.equal(r.headers.get("set-cookie"),null);
});
test("unauthed JavaScript assets remain gated; approved logo/icon are public",async()=>{
 assets.length=0;
 for(const path of ["/stream/tv/tv.js","/stream/graphite.css","/stream/session"]){
  const response=await worker.fetch(new Request(STAGING+path),env);
  assert.equal(response.status,403,path);
 }
 for(const [path,file] of [["/stream/brand.webp","/streamnow-brand.webp"],["/stream/icon.webp","/streamnow-icon.webp"]]){
  const response=await worker.fetch(new Request(STAGING+path),env);
  assert.equal(response.status,200);
  assert.equal(response.headers.get("content-type"),"image/webp");
  assert.equal(await response.text(),file);
 }
 assert.deepEqual(assets,["/streamnow-brand.webp","/streamnow-icon.webp"]);
});
test("unapproved Pages hostname is rejected",async()=>{
 const r=await worker.fetch(new Request("https://streamnow-guess.pages.dev/"),env);
 assert.equal(r.status,404);
});
test("unassigned former hostname is not silently treated as the production website",async()=>{
 const r=await worker.fetch(new Request(FORMER_UNAVAILABLE+"/"),env);
 assert.equal(r.status,404);
});
