import {test} from "node:test";
import assert from "node:assert/strict";
import worker from "../cloudflare/independent-access.mjs";
import {readFileSync} from "node:fs";

const url="https://drivmatch-stream-v2-test.drivmatch.workers.dev";
const token="a".repeat(43);
function fakeEnv(role){
  let actionTouched=false;
  const env={
    STREAM_USERS_DB:{
      prepare(sql){
        if(sql.includes("FROM stream_sessions s")){
          return {bind(){return {async first(){return {user_id:role+"-user",email:role+"@example.test",role,status:"active"};}};}};
        }
        actionTouched=true;
        throw new Error("Administrative D1 action must never execute");
      }
    },
    STREAM_LOGIN_LIMITER:{limit:async()=>({success:true})},
    SUPABASE_URL:"https://example.supabase.co",
    SUPABASE_PUBLIC_KEY:"sb_publishable_test123456789",
    SUPABASE_SECRET_KEY:"sb_secret_test123456789",
    STREAM_ACCESS_PASSWORD:"test-only-internal-signing-password-123456"
  };
  return {env,wasActionTouched:()=>actionTouched};
}
test("emergency: all admin endpoints locked for all authenticated roles",async()=>{
  for(const role of ["admin","viewer"]){
    const {env,wasActionTouched}=fakeEnv(role);
    for(const [method,path] of [
      ["GET","/stream/admin"],
      ["GET","/stream/admin/?x=1"],
      ["POST","/stream/admin/invite"],
      ["POST","/stream/admin/status"],
      ["POST","/stream/admin/recover"],
      ["POST","/stream/admin/revoke"],
      ["POST","/stream/admin/resend"],
      ["POST","/stream/admin/link-invite"]
    ]){
      const response=await worker.fetch(new Request(url+path,{
        method,headers:{Cookie:"dm_stream_user="+token},
        ...(method==="POST"?{body:"_csrf=invalid"}:{})
      }),env);
      assert.equal(response.status,403,role+" "+method+" "+path);
      assert.match(await response.text(),/bloqueado por segurança/);
      assert.equal(wasActionTouched(),false);
    }
  }
});
test("viewer session identifies actual logged-in email without administrative route",async()=>{
  const {env}=fakeEnv("viewer");
  const res=await worker.fetch(new Request(url+"/stream/session",{
    headers:{Cookie:"dm_stream_user="+token}
  }),env);
  assert.equal(res.status,200);
  const data=await res.json();
  assert.deepEqual({allowed:data.allowed,role:data.role,email:data.email},
    {allowed:true,role:"viewer",email:"viewer@example.test"});
  assert.ok(!Object.hasOwn(data,"password"));
});
test("user-facing TV page contains identity and logout but no admin navigation",()=>{
  for(const file of ["site/tv.html","site/index.html"]){
    const html=readFileSync(new URL("../"+file,import.meta.url),"utf8");
    assert.match(html,/id="account-identity"/);
    assert.match(html,/action="(?:\.|\/stream)?\/logout"/);
    assert.doesNotMatch(html,/href="\/stream\/admin"/);
  }
});

test("opening an invitation invalidates any previous admin browser cookie",async()=>{
  const {env}=fakeEnv("admin");
  const result=await worker.fetch(new Request(url+"/stream/activate",{
    headers:{Cookie:"dm_stream_user="+token}
  }),env);
  assert.equal(result.status,200);
  const clearing=result.headers.get("Set-Cookie")||"";
  assert.match(clearing,/dm_stream_user=/);
  assert.match(clearing,/Max-Age=0/);
  assert.match(clearing,/HttpOnly/);
  assert.match(clearing,/SameSite=Strict/);
});
