/*
 * DrivMatch Stream - separate Cloudflare Worker for private individual accounts.
 * Identity provider: dedicated Supabase Auth project (invitations + public signup).
 * Per-user sessions, permissions, and favorites: Cloudflare D1.
 * Production is NOT changed by adding this module.
 */
import legacy from "./stream-proxy.mjs";
import {renderAccessConsole} from "./admin-console.mjs";
import {startTasting,tastingConfig,tastingRecord,tastingStatus} from "./stripe-tasting.mjs";

/*
 * The independent Stream MUST serve its own deployed asset bundle, not the
 * public GitHub Pages main branch (which does not know the logged-in user).
 * Only a fixed allowlist of files is exposed, and only after D1 auth.
 */
const STATIC_FILES = {
  "/stream/":"index.html", "/stream/index.html":"index.html",
  "/stream/stream.css":"stream.css", "/stream/stream.js":"stream.js",
  "/stream/graphite.css":"streamnow-graphite.css",
  "/stream/stream-boot.js":"stream-boot.js", "/stream/stream-tv.js":"stream-tv.js",
  "/stream/tv/":"tv.html", "/stream/tv/index.html":"tv.html",
  "/stream/tv/tv.css":"tv.css", "/stream/tv/tv.js":"tv.js",
  "/stream/listas/":"listas.html", "/stream/listas/index.html":"listas.html",
  "/stream/listas/listas.js":"listas.js", "/stream/listas/listas.css":"listas.css",
  "/stream/listas/sources.json":"playlist-sources.json",
  "/stream/listas/brasil-servicos.json":"brasil-servicos.json",
  "/stream/official-access.json":"official-access.json"
};
const PUBLIC_ASSETS = {
  "/stream/brand.webp": ["streamnow-brand.webp", "image/webp"],
  "/stream/icon.webp": ["streamnow-icon.webp", "image/webp"],
  "/stream/montserrat-latin.woff2": ["montserrat-latin.woff2", "font/woff2"],
  "/stream/montserrat-OFL.txt": ["montserrat-OFL.txt", "text/plain; charset=utf-8"]
};
const BRAND_FONT = "@font-face{font-family:Montserrat;src:url(/stream/montserrat-latin.woff2) format('woff2');font-weight:100 900;font-display:swap}";
const BRAND_IMAGE = "<img class='streamnow-logo' src='/stream/brand.webp' alt='Stream Now' width='270' height='80'>";
const APP_CSP = "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; " +
  "style-src 'self'; font-src 'self'; connect-src 'self' https:; media-src 'self' https: blob:; " +
  "worker-src blob:; img-src 'self' https: data:; " +
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.twitch.tv; " +
  "frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

const TE = new TextEncoder();
const COOKIE = "dm_stream_user";
const FORM_COOKIE = "__Host-dm_stream_form_csrf";
const SESSION_SECONDS = 7 * 24 * 3600;
const ADMIN_STEPUP_SECONDS = 600;
const DAILY_EMAIL_LIMIT = 20;
const PUBLIC_EMAIL_LIMIT = 5;
const PUBLIC_SIGNUP_LIMIT = 10;
const OFFICIAL_PAGES_HOST = "streamnow-2o1.pages.dev";
const SHARED_PAGES_HOSTS = new Set([OFFICIAL_PAGES_HOST,"contas-compartilhadas.streamnow-2o1.pages.dev"]);
const APPROVED_AUTH_ORIGIN = "https://drivmatch-stream-v2-test.drivmatch.workers.dev";
const HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};
const plain = (status, message) => new Response(message, {
  status, headers: {...HEADERS, "Content-Type": "text/plain; charset=utf-8"}
});
const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: {...HEADERS, "Content-Type": "application/json; charset=utf-8"}
});
const b64 = bytes => btoa(String.fromCharCode(...bytes))
  .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
const escape = str => String(str || "").replace(/[&<>"']/g, ch =>
  ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[ch]));
const now = () => Math.floor(Date.now() / 1000);
const hash = async value => b64(new Uint8Array(await crypto.subtle.digest("SHA-256", TE.encode(value))));
const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
const authBase = env => String(env.SUPABASE_URL || "").replace(/\/+$/, "");
function configured(env) {
  const url = authBase(env);
  return env.STREAM_USERS_DB && env.STREAM_LOGIN_LIMITER &&
    /^https:\/\/[a-zA-Z0-9.-]+$/.test(url) &&
    typeof env.SUPABASE_PUBLIC_KEY === "string" && env.SUPABASE_PUBLIC_KEY.length > 10 &&
    typeof env.SUPABASE_SECRET_KEY === "string" && env.SUPABASE_SECRET_KEY.length > 10 &&
    typeof env.STREAM_ACCESS_PASSWORD === "string" && env.STREAM_ACCESS_PASSWORD.length >= 16;
}
function cookieValue(request) {
  const match = (request.headers.get("Cookie") || "").split(";")
    .map(s => s.trim()).find(s => s.startsWith(COOKIE + "="));
  const value = match?.slice(COOKIE.length + 1) || "";
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
function sessionCookie(token, maxAge = SESSION_SECONDS) {
  return COOKIE + "=" + token + "; Path=/stream; Max-Age=" + maxAge +
    "; Secure; HttpOnly; SameSite=Strict";
}
function redirect(origin, path, cookie) {
  return new Response(null, {status: 303, headers: {...HEADERS,
    "Location": origin + path,
    ...(cookie ? {"Set-Cookie": cookie} : {})}});
}
async function currentUser(request, env) {
  const token = cookieValue(request);
  if (!token) return null;
  const tokenHash = await hash(token);
  return env.STREAM_USERS_DB.prepare(
    "SELECT u.user_id,u.email,u.role,u.status,s.admin_verified_until FROM stream_sessions s " +
    "JOIN stream_users u ON u.user_id=s.user_id " +
    "WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'"
  ).bind(tokenHash, now()).first();
}
function csrf(request, url) {
  // Browser form POSTs can legitimately omit Origin. Strictly reject any
  // explicitly foreign Origin, then fall back to Fetch Metadata/Referer.
  const origin = request.headers.get("Origin");
  if (origin !== null) return origin === url.origin;
  if (request.headers.get("Sec-Fetch-Site") === "same-origin") return true;
  const referer = request.headers.get("Referer");
  if (!referer) return false;
  try {
    const previous = new URL(referer);
    return previous.origin === url.origin &&
      previous.protocol === "https:";
  } catch { return false; }
}
// Signed double-submit form token. It is not dependent on Origin,
// Referer, or Fetch Metadata that mobile private browsers can omit.
async function signFormNonce(nonce, env) {
  const key=await crypto.subtle.importKey("raw",
    TE.encode("dm-stream-form-v1:" + env.STREAM_ACCESS_PASSWORD),
    {name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return b64(new Uint8Array(await crypto.subtle.sign("HMAC",key,TE.encode(nonce))));
}
async function issueFormToken(env) {
  const nonce=random();
  return nonce+"."+await signFormNonce(nonce,env);
}
function formTokenCookie(token) {
  return FORM_COOKIE+"="+token+
    "; Path=/; Max-Age=1200; Secure; HttpOnly; SameSite=Strict";
}
function formTokenInput(token) {
  return "<input type='hidden' name='_csrf' value='"+token+"'>";
}
function stampForm(response,token) {
  response.headers.set("Set-Cookie",formTokenCookie(token));
  return response;
}
async function formTokenStatus(request,url,params,env) {
  const origin=request.headers.get("Origin");
  if (origin && origin!==url.origin) return "L1";
  const ref=request.headers.get("Referer");
  if (ref) {
    try {if (new URL(ref).origin!==url.origin) return "L2";}
    catch {return "L3";}
  }
  if (request.headers.get("Sec-Fetch-Site")==="cross-site") return "L4";
  const supplied=String(params.get("_csrf")||"");
  if (!/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(supplied)) return "F1";
  const received=(request.headers.get("Cookie")||"").split(";")
    .map(x=>x.trim()).find(x=>x.startsWith(FORM_COOKIE+"="));
  if (!received) return "C1";
  if (received.slice(FORM_COOKIE.length+1)!==supplied) return "C2";
  const [nonce,signature]=supplied.split(".");
  const expected=await signFormNonce(nonce,env);
  let diff=0;
  for(let i=0;i<expected.length;i++)
    diff|=expected.charCodeAt(i)^signature.charCodeAt(i);
  return diff===0?"OK":"S1";
}
async function verifyFormToken(request,url,params,env) {
  return await formTokenStatus(request,url,params,env)==="OK";
}
async function form(request) {
  const size = Number(request.headers.get("Content-Length") || 0);
  if (size > 4096) throw new Error("oversized");
  const body = await request.text();
  if (body.length > 4096) throw new Error("oversized");
  return new URLSearchParams(body);
}
async function bodyJson(request, max = 12000) {
  if (Number(request.headers.get("Content-Length") || 0) > max) throw new Error("oversized");
  const body = await request.text();
  if (body.length > max) throw new Error("oversized");
  return JSON.parse(body);
}
function page(title, body, status = 200, script = "", nonce = "") {
  const style = BRAND_FONT +
    "html{color-scheme:dark}body{font:16px Montserrat,Arial,sans-serif;background:#101010;color:#f6f6f6;margin:0;padding:26px;min-height:100vh;box-sizing:border-box}" +
    "main{background:#191919;max-width:430px;margin:8vh auto;padding:30px;border:1px solid #494949;border-radius:18px}" +
    ".streamnow-logo{display:block;max-width:100%;height:auto;margin:0 auto 26px}" +
    "h1{font-size:1.55rem;margin:0 0 14px}a{color:#f6f6f6}label{display:block;margin-top:16px;font-weight:650}" +
    "input{display:block;width:100%;box-sizing:border-box;padding:12px;margin-top:6px;border-radius:8px;border:1px solid #686868;background:#252525;color:#fff;font:inherit}" +
    "button{width:100%;background:#c80020;color:#fff;border:0;border-radius:9px;padding:12px 18px;margin-top:18px;font:inherit;font-weight:750;cursor:pointer}" +
    "small{color:#c8c8c8}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #fff;outline-offset:2px}" +
    "@media(max-width:500px){body{padding:14px}main{padding:22px;margin:4vh auto}}";
  const html = "<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'>" +
    "<meta name='viewport' content='width=device-width,initial-scale=1'>" +
    "<meta name='theme-color' content='#101010'><link rel='icon' href='/stream/icon.webp' type='image/webp'>" +
    "<meta name='robots' content='noindex,nofollow,noarchive'><title>" + escape(title) +
    " · Stream Now</title><style>" + style + "</style></head><body><main>" +
    BRAND_IMAGE + "<h1>" + escape(title) + "</h1>" + body +
    "</main>" + (script ? "<script nonce='" + nonce + "'>" + script + "</script>" : "") +
    "</body></html>";
  const csp = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; font-src 'self'; " +
    (nonce ? "script-src 'nonce-" + nonce + "'; " : "") +
    "form-action 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'";
  // "no-referrer" makes Chrome send Origin: null on native same-origin
  // POST forms, breaking the CSRF guard. "same-origin" keeps external referrers
  // suppressed while providing a trustworthy Origin for our own forms.
  return new Response(html, {status, headers: {...HEADERS,
    "Referrer-Policy":"same-origin",
    "Content-Type":"text/html; charset=utf-8",
    "Content-Security-Policy":csp}});
}
async function loginPage(error = false, env, nextAdmin = false) {
  const token=await issueFormToken(env);
  const action=nextAdmin ? "/stream/login?next=admin" : "/stream/login";
  return stampForm(page("Acesso individual",
    "<p>Entre com seu e-mail e sua senha pessoal.</p>" +
    (error ? "<p role='alert'>Não foi possível entrar. Confira os dados e o acesso à conta.</p>" : "") +
    "<form method='post' action='"+action+"'>" + formTokenInput(token) +
    "<label>E-mail<input type='email' name='email' autocomplete='username' maxlength='254' required></label>" +
    "<label>Senha<input type='password' name='password' autocomplete='current-password' maxlength='256' required></label>" +
    "<button type='submit'>Entrar</button></form>" +
    "<p><a href='/stream/recover'>Esqueci minha senha</a></p>" +
    "<p><a href='/stream/signup'>Criar conta</a></p>", error ? 401 : 200),token);
}
async function tastingPage(url, request, env, user) {
  const config = tastingConfig(env);
  if (!config) return plain(404,"Plano Degustação indisponível.");
  const title = "Plano Degustação";
  const back = "<p><a href='/stream/tv/'>Voltar ao guia</a></p>";
  const method = request.method;
  if (method !== "GET" && method !== "POST") return plain(405,"Method Not Allowed");
  if (method === "POST") {
    const data = await form(request);
    if (!await verifyFormToken(request,url,data,env))
      return plain(403,"Formulário expirado. Abra o plano novamente.");
    if (data.get("account") !== user.user_id) return plain(409,"A conta conectada mudou.");
    if (!await limit(request,env,"stripe-tasting")) return plain(429,"Aguarde antes de tentar novamente.");
  }

  try {
    const timestamp = now();
    if (method === "POST") {
      await startTasting(env.STREAM_USERS_DB,config,user.user_id,timestamp);
      return redirect(url.origin,"/stream/degustacao");
    }
    const record = await tastingRecord(env.STREAM_USERS_DB,user.user_id,config.mode);
    const state = await tastingStatus(config,record,timestamp);
    const details = "<p><strong>R$ 0</strong> · Sem cartão e sem conversão automática.</p>";
    const modeNotice = config.mode === "test" ? "<p>Ambiente de teste do Stripe.</p>" : "";
    const endDate = record?.ends_at ? new Intl.DateTimeFormat("pt-BR",{
      dateStyle:"long", timeZone:"America/Sao_Paulo"
    }).format(new Date(record.ends_at * 1000)) : "";
    if (state === "active")
      return page(title,details + modeNotice + "<p>Plano ativo" +
        (endDate ? " até " + endDate : " sem prazo") + ".</p>" + back);
    if (state === "expired") return page(title,details + modeNotice + "<p>Plano encerrado.</p>" + back);
    if (state === "review")
      return page(title,details + modeNotice + "<p>Ativação em revisão.</p>" + back);

    const token = await issueFormToken(env);
    const duration = state === "pending"
      ? "<p>Ativação em andamento. Você pode tentar concluir.</p>"
      : (config.days ? "<p>A degustação dura " + config.days + " dias.</p>" : "<p>Plano gratuito sem prazo.</p>");
    const activate = "<form method='post' action='/stream/degustacao'>" +
      formTokenInput(token) + "<input type='hidden' name='account' value='" + escape(user.user_id) +
      "'><button type='submit'>" +
      (state === "pending" ? "Concluir ativação" : "Ativar degustação") + "</button></form>";
    return stampForm(page(title,details + modeNotice + duration + activate + back),token);
  } catch {
    return page(title,"<p role='alert'>O plano está temporariamente indisponível.</p>" + back,502);
  }
}
async function signupPage(env,error="") {
  const token=await issueFormToken(env);
  return stampForm(page("Criar conta",
    "<p>Cadastre seu e-mail e defina uma senha. Não é necessário convite.</p>" +
    (error?"<p role='alert'>"+escape(error)+"</p>":"")+
    "<form method='post' action='/stream/signup'>"+formTokenInput(token)+
    "<label>E-mail<input type='email' name='email' autocomplete='username' maxlength='254' required></label>"+
    "<label>Senha<input type='password' name='password' autocomplete='new-password' minlength='12' maxlength='256' required></label>"+
    "<label>Confirmar senha<input type='password' name='confirm' autocomplete='new-password' minlength='12' maxlength='256' required></label>"+
    "<button type='submit'>Criar conta</button></form>"+
    "<p><a href='/stream/login'>Já tenho conta</a></p>",
    error?400:200),token);
}
function signupReceipt() {
  return page("Cadastro solicitado",
    "<p>Se o cadastro puder ser realizado, confira seu e-mail para confirmar o endereço.</p>"+
    "<p>Depois, entre com seu e-mail e a senha criada.</p>"+
    "<p><a href='/stream/login'>Entrar</a></p>"+
    "<p><a href='/stream/recover'>Recuperar acesso</a></p>");
}
function activationURL(url) {
  const origin = SHARED_PAGES_HOSTS.has(url.hostname) ? APPROVED_AUTH_ORIGIN : url.origin;
  return origin + "/stream/activate";
}
function setupPage(url) {
  const nonce = b64(crypto.getRandomValues(new Uint8Array(16)));
  const body = "<p>Crie uma senha exclusiva, com 12 caracteres ou mais. Este link é pessoal e temporário.</p>" +
    "<form id='setup'><label>Nova senha<input name='password' type='password' autocomplete='new-password' minlength='12' maxlength='256' required></label>" +
    "<button type='submit'>Salvar senha</button></form><p id='message' role='status'></p>";
  const script = "const f=document.getElementById('setup'),m=document.getElementById('message');" +
    "const p=new URLSearchParams(location.hash.slice(1));const token=p.get('access_token');" +
    "history.replaceState(null,'',location.pathname);" +
    "if(p.get('type')==='signup'&&token){f.hidden=true;m.textContent='E-mail confirmado. Agora entre com o e-mail e a senha criada.';" +
    "const a=document.createElement('a');a.href='https://"+OFFICIAL_PAGES_HOST+"/stream/login';a.textContent='Entrar no Stream Now';m.append(' ',a);}" +
    "else if(!token){f.hidden=true;m.textContent='Link inválido ou expirado. Solicite um novo convite ou recuperação.';}" +
    "f.addEventListener('submit',async e=>{e.preventDefault();m.textContent='Verificando...';" +
    "const password=f.elements.password.value;try{" +
    "const r=await fetch('/stream/activate',{method:'POST',credentials:'same-origin'," +
    "headers:{'Content-Type':'application/json'},body:JSON.stringify({access_token:token,password})});" +
    "if(!r.ok)throw Error('invalid');f.hidden=true;m.textContent='Senha definida. Agora você pode entrar.';" +
    (url.origin === APPROVED_AUTH_ORIGIN
      ? "const official=document.createElement('a');official.href='https://" + OFFICIAL_PAGES_HOST +
        "/stream/login';official.textContent='Entrar no Stream Now';m.append(' ',official,' · ');"
      : "") +
    "const a=document.createElement('a');a.href='/stream/login';a.textContent='Ir para o login';m.append(' ',a);" +
    "}catch{m.textContent='Não foi possível ativar. Solicite um novo link.';}});";
  return page("Ativar ou recuperar conta", body, 200, script, nonce);
}
async function supabase(env, method, endpoint, data, admin = false, accessToken = "") {
  const key = admin ? env.SUPABASE_SECRET_KEY : env.SUPABASE_PUBLIC_KEY;
  // Supabase sb_publishable_* / sb_secret_* keys are NOT JWTs.
  // Only an authenticated user's actual access token belongs in Authorization.
  const headers = {"apikey":key, "Content-Type":"application/json",
    "Accept":"application/json"};
  if (accessToken) headers.Authorization = "Bearer " + accessToken;
  const res = await fetch(authBase(env) + "/auth/v1/" + endpoint, {
    method, redirect:"manual", headers,
    ...(data === undefined ? {} : {body: JSON.stringify(data)})
  });
  let result = {};
  try {result = await res.json();} catch {}
  return {ok:res.ok, status:res.status, data:result};
}
function invitationError(result){
  if(result.status===429)return "limit";
  if(result.status===401||result.status===403)return "permissions";
  const data=result.data||{};
  const code=String(data.error_code||data.code||"").toLowerCase();
  const msg=String(data.msg||data.message||data.error_description||data.error||"").toLowerCase();
  if(code.includes("rate_limit")||msg.includes("rate limit")||msg.includes("too many"))return "limit";
  if(code.includes("email_address_not_authorized")||
     code.includes("email_address_invalid")||msg.includes("not authorized")||
     msg.includes("not allowed")||msg.includes("smtp")||msg.includes("send email")||
     msg.includes("error sending"))return "smtp";
  if(code.includes("already_registered")||code.includes("user_already_exists")||
     msg.includes("already registered")||msg.includes("already exists"))return "existing";
  return "provider";
}
function authUserFromResponse(result){
  return result?.data?.user?.id || result?.data?.id || null;
}
function validInviteActionLink(urlText,env,redirectURL){
  try{
    const link=new URL(urlText);
    const project=new URL(authBase(env));
    return link.protocol==="https:" && link.origin===project.origin &&
      link.pathname==="/auth/v1/verify" &&
      ["invite","recovery"].includes(link.searchParams.get("type")) &&
      !!link.searchParams.get("token") &&
      link.searchParams.get("redirect_to")===redirectURL;
  }catch{return false;}
}
// Strict Stream-level transactional email budget, independent of the provider.
// D1 serializes the conditional write so concurrent Workers cannot exceed 20.
// Count accepted requests and uncertain outcomes; known provider rejections
// are refunded. An accepted request is NOT proof of inbox delivery.
function saoPauloDay() {
  const parts=new Intl.DateTimeFormat("en-US",{
    timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"
  }).formatToParts(new Date());
  const fields=Object.fromEntries(parts.filter(x=>x.type!=="literal")
    .map(x=>[x.type,x.value]));
  return fields.year+"-"+fields.month+"-"+fields.day;
}
async function emailQuotaUsed(env) {
  const entry=await env.STREAM_USERS_DB.prepare(
    "SELECT COUNT(*) AS used FROM stream_email_budget WHERE local_day=?"
  ).bind(saoPauloDay()).first();
  return Number(entry?.used)||0;
}
async function reserveEmail(env,kind) {
  const day=saoPauloDay(), id=crypto.randomUUID();
  const result=await env.STREAM_USERS_DB.prepare(
    "INSERT INTO stream_email_budget(request_id,local_day,kind,status) " +
    "SELECT ?,?,?,'reserved' WHERE " +
    "(SELECT COUNT(*) FROM stream_email_budget WHERE local_day=?)<? " +
    "AND (? != 'public-recover' OR " +
    "(SELECT COUNT(*) FROM stream_email_budget " +
    "WHERE local_day=? AND kind='public-recover')<?) " +
    "AND (? != 'signup' OR " +
    "(SELECT COUNT(*) FROM stream_email_budget " +
    "WHERE local_day=? AND kind='signup')<?)"
  ).bind(id,day,kind,day,DAILY_EMAIL_LIMIT,kind,day,PUBLIC_EMAIL_LIMIT,kind,day,PUBLIC_SIGNUP_LIMIT).run();
  return result?.meta?.changes===1 ? id : null;
}
async function sendWithEmailQuota(env,kind,send) {
  const ticket=await reserveEmail(env,kind);
  if(!ticket)return {ok:false,quota:true};
  let result;
  try {result=await send();}
  catch {
    // Network error: provider may already have accepted the email. Do not
    // refund an ambiguous attempt, otherwise retries can exceed the limit.
    return {ok:false,quota:false,uncertain:true};
  }
  if(!result.ok) {
    // Explicit provider rejection: no accepted email, refund the slot.
    await env.STREAM_USERS_DB.prepare(
      "DELETE FROM stream_email_budget WHERE request_id=? AND status='reserved'"
    ).bind(ticket).run();
    return {ok:false,quota:false,result};
  }
  await env.STREAM_USERS_DB.prepare(
    "UPDATE stream_email_budget SET status='accepted' WHERE request_id=?"
  ).bind(ticket).run();
  return {ok:true,quota:false,result};
}
async function limit(request, env, prefix) {
  if (!env.STREAM_LOGIN_LIMITER?.limit) return false;
  const key = prefix + ":" + (request.headers.get("CF-Connecting-IP") || "unknown");
  try {return (await env.STREAM_LOGIN_LIMITER.limit({key})).success === true;}
  catch {return false;}
}
async function createSession(user, env, adminJustAuthenticated = false) {
  const token = random();
  const timestamp = now();
  // Both effects commit together: the timestamp means a successful D1-backed
  // Stream login, not merely viewing a page or clicking an invitation link.
  await env.STREAM_USERS_DB.batch([
    env.STREAM_USERS_DB.prepare(
      "INSERT INTO stream_sessions (token_hash,user_id,expires_at,admin_verified_until) " +
      "VALUES(?,?,?,?)"
    ).bind(await hash(token),user.user_id,timestamp+SESSION_SECONDS,
      adminJustAuthenticated && requireAdmin(user) ? timestamp + ADMIN_STEPUP_SECONDS : 0),
    env.STREAM_USERS_DB.prepare(
      "UPDATE stream_users SET first_login_at=COALESCE(first_login_at,?),last_login_at=? " +
      "WHERE user_id=? AND status='active'"
    ).bind(timestamp,timestamp,user.user_id)
  ]);
  return sessionCookie(token);
}
async function revokeCurrent(request, env) {
  const token = cookieValue(request);
  if (token) await env.STREAM_USERS_DB.prepare(
    "DELETE FROM stream_sessions WHERE token_hash=?"
  ).bind(await hash(token)).run();
}
function requireAdmin(user) {
  return user && user.role === "admin" && user.status === "active";
}
function hasAdminStepUp(user) {
  return requireAdmin(user) && Number(user.admin_verified_until||0)>now();
}
async function adminStepUpPage(env,error=false) {
  const token=await issueFormToken(env);
  return stampForm(page("Confirmar acesso administrativo",
    "<p>Para proteger suas contas, confirme novamente sua senha de administrador.</p>" +
    (error ? "<p role='alert'>Senha administrativa não validada.</p>" : "") +
    "<form method='post' action='/stream/admin/verify'>" + formTokenInput(token) +
    "<label>Senha do administrador<input type='password' name='password' "+
    "autocomplete='current-password' maxlength='256' required></label>" +
    "<button type='submit'>Desbloquear minha administração</button></form>" +
    "<p><a href='/stream/'>Voltar ao Stream</a></p>"+
    "<form method='post' action='/stream/logout'>"+
    "<button type='submit'>Sair e trocar de conta</button></form>",error?401:200),token);
}
async function adminPage(user,env,url,extra={}) {
  const token=await issueFormToken(env);
  const [members,activity,sessionCounts]=await Promise.all([
    env.STREAM_USERS_DB.prepare(
      "SELECT user_id,email,role,status,created_at,activated_at,first_login_at," +
      "last_login_at,canceled_invite_at FROM stream_users ORDER BY created_at DESC LIMIT 150"
    ).all(),
    env.STREAM_USERS_DB.prepare(
      "SELECT e.action,e.created_at,t.email AS subject_email,a.email AS admin_email " +
      "FROM stream_admin_events e " +
      "LEFT JOIN stream_users t ON t.user_id=e.subject_id " +
      "LEFT JOIN stream_users a ON a.user_id=e.admin_id " +
      "ORDER BY e.created_at DESC LIMIT 15"
    ).all(),
    env.STREAM_USERS_DB.prepare(
      "SELECT user_id,COUNT(*) AS total FROM stream_sessions WHERE expires_at>? GROUP BY user_id"
    ).bind(now()).all()
  ]);
  const budgetUsed=await emailQuotaUsed(env);
  const counts=new Map((sessionCounts.results||[]).map(x=>[x.user_id,Number(x.total)||0]));
  const users=(members.results||[]).map(u=>({
    ...u,session_count:counts.get(u.user_id)||0
  }));
  const {html,nonce}=renderAccessConsole({
    users,actorId:user.user_id,token,events:activity.results||[],
    notice:url.searchParams.get("result")||"",
    error:extra.error||"",manualLink:extra.manualLink||"",manualEmail:extra.manualEmail||"",
    emailQuotaUsed:budgetUsed,emailQuotaLimit:DAILY_EMAIL_LIMIT
  });
  return stampForm(new Response(html,{status:200,headers:{
    ...HEADERS,"Content-Type":"text/html; charset=utf-8",
    "Referrer-Policy":"same-origin",
    "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; font-src 'self'; " +
      "script-src 'nonce-"+nonce+"'; form-action 'self'; connect-src 'self'; " +
      "base-uri 'none'; frame-ancestors 'none'"
  }}),token);
}
async function bundledAsset(request, env, url, path) {
  if (!Object.hasOwn(STATIC_FILES, path)) return null;
  // Fail closed: falling back to GitHub Pages would reintroduce shared favorites.
  if (!env.ASSETS?.fetch) return plain(503, "Arquivos protegidos indisponíveis.");
  const name = STATIC_FILES[path];
  const assetUrl = new URL("/" + name, url.origin);
  const response = await env.ASSETS.fetch(new Request(assetUrl, {method:request.method}));
  if (!response.ok) return plain(502, "Arquivo protegido indisponível.");
  const headers = {...HEADERS, "Content-Security-Policy":APP_CSP,
    "Referrer-Policy":name.endsWith(".html")?"same-origin":"no-referrer",
    "Content-Type":response.headers.get("Content-Type") ||
      (name.endsWith(".html") ? "text/html; charset=utf-8" :
      name.endsWith(".js") ? "text/javascript; charset=utf-8" :
      name.endsWith(".css") ? "text/css; charset=utf-8" :
      "application/json; charset=utf-8")};
  return new Response(request.method==="HEAD" ? null : response.body,
    {status:200,headers});
}
async function proxyLegacy(request, env, url) {
  // Transitional adapter: validates the D1 session BEFORE producing an internal
  // legacy cookie. The legacy PIN/password are never disclosed to end users.
  const p = env.STREAM_ACCESS_PASSWORD;
  const raw = "v1." + (now() + 180) + "." +
    b64(crypto.getRandomValues(new Uint8Array(16)));
  const key = await crypto.subtle.importKey("raw",
    TE.encode("dm-stream-cookie-v1:" + p), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  const mac = b64(new Uint8Array(await crypto.subtle.sign("HMAC", key, TE.encode(raw))));
  const target = "https://drivmatch-stream-proxy.drivmatch.workers.dev" +
    url.pathname + url.search;
  const headers = new Headers();
  headers.set("Cookie", "dm_stream_session=" + raw + "." + mac);
  const inner = new Request(target, {method:request.method, headers});
  const response = await legacy.fetch(inner, {
    ...env, STREAM_TV_PIN: undefined
  });
  const out = new Headers(response.headers);
  out.delete("Set-Cookie");
  out.set("Cache-Control", "private, no-store");
  return new Response(response.body, {status:response.status, headers:out});
}
async function handle(request, env) {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  if (Object.hasOwn(PUBLIC_ASSETS,path)) {
    if (method !== "GET" && method !== "HEAD") return plain(405,"Method Not Allowed");
    if (!env.ASSETS?.fetch) return plain(503,"Arquivo indisponível.");
    const [name,type]=PUBLIC_ASSETS[path];
    const result=await env.ASSETS.fetch(new Request(new URL("/"+name,url.origin),{method}));
    if (!result.ok) return plain(502,"Arquivo indisponível.");
    return new Response(method==="HEAD"?null:result.body,{headers:{
      "Content-Type":type,"X-Content-Type-Options":"nosniff",
      "Cache-Control":"public, max-age=86400","Cross-Origin-Resource-Policy":"same-origin"
    }});
  }
  if (!configured(env)) return plain(503, "Stream independente ainda não configurado.");
  if (!path.startsWith("/stream")) return plain(404, "Not Found");
  if (path === "/stream" && (method === "GET" || method === "HEAD"))
    return redirect(url.origin, "/stream/");
  const user = await currentUser(request, env);
  const requestedAdmin = url.searchParams.get("next") === "admin";
  if (method === "GET" && path === "/stream/login")
    return user ? redirect(url.origin, requestedAdmin && requireAdmin(user) ? "/stream/admin" : "/stream/") :
      await loginPage(false,env,requestedAdmin);
  if (method === "POST" && path === "/stream/login") {
    const data = await form(request);
    const status=await formTokenStatus(request,url,data,env);
    if (status!=="OK")
      return page("Acesso não validado",
        "<p>Não foi possível validar o formulário neste navegador.</p>" +
        "<p><strong>Código de diagnóstico: "+status+"</strong></p>" +
        "<p>O código não contém sua senha ou dados pessoais.</p>" +
        "<p><a href='/stream/login'>Reabrir login</a></p>",403);
    if (!await limit(request,env,"login")) return plain(429,"Muitas tentativas. Tente mais tarde.");
    const email = String(data.get("email") || "").trim().toLowerCase();
    const password = String(data.get("password") || "");
    if (email.length > 254 || !email.includes("@") || !password || password.length > 256)
      return await loginPage(true,env,requestedAdmin);
    const result = await supabase(env,"POST","token?grant_type=password",{email,password});
    if (!result.ok || !result.data?.user?.id) return await loginPage(true,env,requestedAdmin);
    const account = await env.STREAM_USERS_DB.prepare(
      "SELECT user_id,email,role,status FROM stream_users WHERE user_id=? AND email=? AND status='active'"
    ).bind(result.data.user.id,email).first();
    if (!account) return await loginPage(true,env,requestedAdmin);
    const destination = requestedAdmin && requireAdmin(account) ? "/stream/admin" : "/stream/";
    return redirect(url.origin,destination,
      await createSession(account,env,requestedAdmin && requireAdmin(account)));
  }
  if(path==="/stream/signup" && method==="GET")
    return user?redirect(url.origin,"/stream/"):await signupPage(env);
  if(path==="/stream/signup" && method==="POST"){
    const data=await form(request);
    if(!await verifyFormToken(request,url,data,env))
      return plain(403,"Formulário expirado. Abra novamente o cadastro.");
    if(!await limit(request,env,"signup"))
      return plain(429,"Muitas tentativas. Tente novamente mais tarde.");
    const email=String(data.get("email")||"").trim().toLowerCase();
    const password=String(data.get("password")||"");
    const confirmation=String(data.get("confirm")||"");
    if(email.length>254||!/^\S+@\S+\.\S+$/.test(email)||
       password.length<12||password.length>256||password!==confirmation)
      return await signupPage(env,"Confira o e-mail e informe duas senhas iguais de pelo menos 12 caracteres.");
    const existing=await env.STREAM_USERS_DB.prepare(
      "SELECT user_id FROM stream_users WHERE email=?"
    ).bind(email).first();
    if(existing)return signupReceipt();
    const sent=await sendWithEmailQuota(env,"signup",()=>
      supabase(env,"POST","signup?redirect_to="+encodeURIComponent(activationURL(url)),{email,password}));
    if(!sent.ok){
      if(sent.quota)return page("Cadastros temporariamente limitados",
        "<p>O limite diário de confirmações de cadastro foi atingido. Tente novamente amanhã.</p>"+
        "<p><a href='/stream/login'>Entrar</a></p>",429);
      const kind=sent.result?invitationError(sent.result):"provider";
      if(kind==="limit")return page("Envio temporariamente limitado",
        "<p>O provedor atingiu seu limite de e-mails. Tente novamente mais tarde.</p>"+
        "<p><a href='/stream/signup'>Voltar ao cadastro</a></p>",429);
      return page("Cadastro indisponível",
        "<p>Não foi possível solicitar a confirmação agora. Tente novamente mais tarde.</p>"+
        "<p><a href='/stream/signup'>Voltar ao cadastro</a></p>",503);
    }
    const record=sent.result?.data?.user;
    const identity=String(record?.id||"");
    const returnedEmail=String(record?.email||"").trim().toLowerCase();
    if(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(identity)&&
       returnedEmail===email&&!(Array.isArray(record?.identities)&&record.identities.length===0)){
       // Only viewer accounts are self-created. Supabase confirmation gates login.
       await env.STREAM_USERS_DB.prepare(
         "INSERT OR IGNORE INTO stream_users(user_id,email,role,status) VALUES(?,?,'viewer','active')"
       ).bind(identity,email).run();
    }
    return signupReceipt();
  }
  if (method === "GET" && path === "/stream/recover") {
    const token=await issueFormToken(env);
    return stampForm(page("Recuperar acesso",
      "<p>Enviaremos um link para o e-mail cadastrado, se a conta existir.</p>" +
      "<form method='post' action='/stream/recover'>" + formTokenInput(token) +
      "<label>E-mail<input type='email' name='email' maxlength='254' required></label>" +
      "<button type='submit'>Enviar link</button></form>"),token);
  }
  if (method === "POST" && path === "/stream/recover") {
    const data = await form(request);
    if (!await verifyFormToken(request,url,data,env)) return plain(403,"Formulário expirado. Reabra a recuperação.");
    if (!await limit(request,env,"recover")) return plain(429,"Aguarde antes de tentar novamente.");
    const email = String(data.get("email") || "").trim().toLowerCase();
    if (email.length <= 254 && email.includes("@")) {
      // Public recovery uses at most 5 of the global 20 daily email slots.
      // Keep public response generic to prevent account enumeration.
      await sendWithEmailQuota(env,"public-recover",()=>
        supabase(env,"POST","recover?redirect_to=" +
          encodeURIComponent(activationURL(url)), {email}));
    }
    return page("Solicitação recebida","<p>Se o endereço possuir acesso, receberá um e-mail com instruções.</p>" +
      "<p><a href='/stream/login'>Voltar ao login</a></p>");
  }
  if (method === "GET" && path === "/stream/activate") {
    // An invitation/recovery opened in a shared browser must never inherit
    // a previous administrator's session. Invalidate the old session in D1,
    // not just its browser cookie, before showing activation.
    await revokeCurrent(request,env);
    const response=setupPage(url);
    response.headers.set("Set-Cookie",sessionCookie("",0));
    return response;
  }
  if (method === "POST" && path === "/stream/activate") {
    if (!csrf(request,url)) return plain(403,"Forbidden");
    if (!await limit(request,env,"activate")) return plain(429,"Tente mais tarde.");
    const data = await bodyJson(request, 1200);
    const token = data.access_token, password = data.password;
    if (typeof token !== "string" || token.length > 2200 ||
        typeof password !== "string" || password.length < 12 || password.length > 256)
      return plain(400,"Solicitação inválida.");
    const who = await supabase(env,"GET","user",undefined,false,token);
    if (!who.ok || !who.data?.id || !who.data.email) return plain(403,"Link inválido.");
    const account = await env.STREAM_USERS_DB.prepare(
      "SELECT user_id,status FROM stream_users WHERE user_id=? AND email=?"
    ).bind(who.data.id,String(who.data.email).toLowerCase()).first();
    if (!account || account.status === "suspended") return plain(403,"Acesso não autorizado.");
    const saved = await supabase(env,"PUT","user",{password},false,token);
    if (!saved.ok) return plain(502,"Não foi possível definir a senha.");
    if (account.status === "invited") {
      await env.STREAM_USERS_DB.prepare(
        "UPDATE stream_users SET status='active',activated_at=COALESCE(activated_at,?), " +
        "updated_at=? WHERE user_id=? AND status='invited'"
      ).bind(now(),now(),account.user_id).run();
    }
    await env.STREAM_USERS_DB.prepare("DELETE FROM stream_sessions WHERE user_id=?")
      .bind(account.user_id).run();
    const response=json(200,{ok:true});
    // Successful password activation also clears a previously authenticated
    // browser cookie to require a fresh login as the actual invited account.
    response.headers.set("Set-Cookie",sessionCookie("",0));
    return response;
  }
  if (method === "POST" && path === "/stream/logout") {
    if (!csrf(request,url)) return plain(403,"Forbidden");
    await revokeCurrent(request,env);
    return redirect(url.origin,"/stream/login",sessionCookie("",0));
  }
  if (!user) {
    if (method === "GET" && path === "/stream/admin")
      return redirect(url.origin, "/stream/login?next=admin");
    if (method === "GET" && ["/stream/","/stream/index.html","/stream/tv/",
      "/stream/listas/"].includes(path)) return await loginPage(false,env);
    return plain(401,"Autenticação necessária.");
  }
  if (path === "/stream/degustacao") return tastingPage(url,request,env,user);
  if (path === "/stream/session" && (method === "GET" || method === "HEAD"))
    return new Response(method === "HEAD" ? null :
      JSON.stringify({allowed:true,user_id:user.user_id,role:user.role,email:user.email,
        ...(tastingConfig(env) ? {tasting_available:true} : {})}), {
      status:200,headers:{...HEADERS,"Content-Type":"application/json"}});
  if (path === "/stream/favorites") {
    const expectedUser = request.headers.get("X-Stream-Account");
    if (expectedUser !== null && expectedUser !== user.user_id)
      return plain(409,"A conta conectada mudou.");
  }
  if (path === "/stream/favorites" && method === "GET") {
    const result = await env.STREAM_USERS_DB.prepare(
      "SELECT favorite_key FROM stream_favorites WHERE user_id=? ORDER BY created_at"
    ).bind(user.user_id).all();
    return json(200,{favorites:(result.results || []).map(r => r.favorite_key)});
  }
  if (path === "/stream/favorites" && method === "POST") {
    if (!csrf(request,url)) return plain(403,"Forbidden");
    const data = await bodyJson(request);
    const valid = key => typeof key === "string" && key.length >= 2 && key.length <= 400 &&
      !/[\u0000-\u001f]/.test(key);
    if (data.operation === "import") {
      const browserImport = SHARED_PAGES_HOSTS.has(url.hostname);
      if (!browserImport && user.role !== "admin") return plain(403,"Forbidden");
      if (browserImport && request.headers.get("X-Stream-Account") !== user.user_id)
        return plain(409,"A conta conectada mudou.");
      const maximum = browserImport ? 20 : 1500;
      if (!Array.isArray(data.keys) || !data.keys.length || data.keys.length > maximum || !data.keys.every(valid))
        return plain(400,"Favoritos inválidos.");
      const uniqueKeys = new Set(data.keys);
      if (browserImport) {
        await env.STREAM_USERS_DB.batch([...uniqueKeys].map(key => env.STREAM_USERS_DB.prepare(
          "INSERT OR IGNORE INTO stream_favorites(user_id,favorite_key) VALUES(?,?)"
        ).bind(user.user_id,key)));
      } else {
        for (const key of uniqueKeys) {
          await env.STREAM_USERS_DB.prepare(
            "INSERT OR IGNORE INTO stream_favorites(user_id,favorite_key) VALUES(?,?)"
          ).bind(user.user_id,key).run();
        }
      }
      return json(200,{ok:true});
    }
    if (!valid(data.key) || !["add","remove"].includes(data.operation))
      return plain(400,"Operação inválida.");
    if (data.operation === "add") {
      await env.STREAM_USERS_DB.prepare(
        "INSERT OR IGNORE INTO stream_favorites(user_id,favorite_key) VALUES(?,?)"
      ).bind(user.user_id,data.key).run();
    } else {
      await env.STREAM_USERS_DB.prepare(
        "DELETE FROM stream_favorites WHERE user_id=? AND favorite_key=?"
      ).bind(user.user_id,data.key).run();
    }
    return json(200,{ok:true});
  }
  // Privileged operations require a real, active D1 administrator AND
  // a recent password re-verification tied to the same user session.
  if (path === "/stream/admin/" && method === "GET")
    return requireAdmin(user) ? redirect(url.origin,"/stream/admin") :
      plain(403,"Conta sem permissão de administrador.");
  if (path === "/stream/admin/verify" && method === "POST") {
    if(!requireAdmin(user))return plain(403,"Acesso administrativo negado.");
    const data=await form(request);
    if(!await verifyFormToken(request,url,data,env))
      return plain(403,"Confirmação expirada. Abra novamente a administração.");
    if(!await limit(request,env,"admin-verify"))
      return plain(429,"Muitas tentativas. Aguarde para tentar novamente.");
    const password=String(data.get("password")||"");
    if(!password || password.length>256)return await adminStepUpPage(env,true);
    const result=await supabase(env,"POST","token?grant_type=password",
      {email:user.email,password});
    const authenticated=result.ok && result.data?.user?.id===user.user_id &&
      String(result.data.user.email||"").toLowerCase()===String(user.email).toLowerCase();
    if(!authenticated)return await adminStepUpPage(env,true);
    const sessionToken=cookieValue(request);
    if(!sessionToken)return plain(401,"Sessão expirada.");
    const updated=await env.STREAM_USERS_DB.prepare(
      "UPDATE stream_sessions SET admin_verified_until=? " +
      "WHERE token_hash=? AND user_id=? AND expires_at>? " +
      "AND EXISTS(SELECT 1 FROM stream_users " +
      "WHERE user_id=? AND email=? AND role='admin' AND status='active')"
    ).bind(now()+ADMIN_STEPUP_SECONDS,await hash(sessionToken),
      user.user_id,now(),user.user_id,user.email).run();
    if(updated?.meta?.changes!==1)return plain(403,"Acesso administrativo negado.");
    return redirect(url.origin,"/stream/admin");
  }
  if (path === "/stream/admin" && method === "GET") {
    if(!requireAdmin(user))
      return page("Conta sem permissão de administrador",
        "<p>Esta conta não tem acesso à administração.</p>" +
        "<p>Saia desta conta e entre com sua conta administradora.</p>" +
        "<p><a href='/stream/'>Voltar ao Stream</a></p>",403);
    if(!hasAdminStepUp(user))return await adminStepUpPage(env);
    return adminPage(user,env,url);
  }
  if (path.startsWith("/stream/admin/") && method === "POST") {
    if (!hasAdminStepUp(user)) return plain(403,"Confirme sua senha em /stream/admin antes de administrar.");
    const data = await form(request);
    if (!await verifyFormToken(request,url,data,env)) return plain(403,"Formulário expirado. Reabra o painel.");
    if (!await limit(request,env,"admin")) return plain(429,"Muitas operações.");
    if (path === "/stream/admin/invite" ||
        path === "/stream/admin/link-invite") {
      const manual=path === "/stream/admin/link-invite";
      const email=String(data.get("email")||"").trim().toLowerCase();
      if(email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return adminPage(user,env,url,{error:"failure"});
      const exists=await env.STREAM_USERS_DB.prepare(
        "SELECT user_id,status,role FROM stream_users WHERE email=?"
      ).bind(email).first();
      if(exists && (!manual || exists.role!=="viewer" || exists.status!=="invited"))
        return adminPage(user,env,url,{error:"existing"});
      const redirectURL=activationURL(url);
      const endpoint="invite?redirect_to="+encodeURIComponent(redirectURL);
      if(!manual){
        const outcome=await sendWithEmailQuota(env,"invite",()=>
          supabase(env,"POST",endpoint,{email},true));
        if(outcome.quota)return adminPage(user,env,url,{error:"daily-quota"});
        if(!outcome.ok)return adminPage(user,env,url,{
          error:outcome.result?invitationError(outcome.result):"provider"
        });
        const uid=authUserFromResponse(outcome.result);
        if(!uid)return adminPage(user,env,url,{error:"provider"});
        await env.STREAM_USERS_DB.batch([
          env.STREAM_USERS_DB.prepare(
            "INSERT INTO stream_users(user_id,email,role,status) VALUES(?,?,'viewer','invited')"
          ).bind(uid,email),
          env.STREAM_USERS_DB.prepare(
            "INSERT INTO stream_admin_events(event_id,admin_id,action,subject_id) VALUES(?,?,?,?)"
          ).bind(crypto.randomUUID(),user.user_id,"invite",uid)
        ]);
        return redirect(url.origin,"/stream/admin?result=invited");
      }
      // Generates a one-time Supabase link without triggering email delivery.
      // For an existing pending Stream invitation use a recovery-type token,
      // but never create/authorize a second identity for an existing email.
      const type=exists?"recovery":"invite";
      const generated=await supabase(env,"POST","admin/generate_link",
        {type,email,redirect_to:redirectURL},true);
      const uid=authUserFromResponse(generated);
      const actionLink=generated.data?.action_link||
        generated.data?.properties?.action_link;
      if(!generated.ok||!uid||
         (exists && uid!==exists.user_id)||
         typeof actionLink!=="string"||
         !validInviteActionLink(actionLink,env,redirectURL))
        return adminPage(user,env,url,{error:invitationError(generated)});
      if(!exists){
        await env.STREAM_USERS_DB.batch([
          env.STREAM_USERS_DB.prepare(
            "INSERT INTO stream_users(user_id,email,role,status) VALUES(?,?,'viewer','invited')"
          ).bind(uid,email),
          env.STREAM_USERS_DB.prepare(
            "INSERT INTO stream_admin_events(event_id,admin_id,action,subject_id) VALUES(?,?,?,?)"
          ).bind(crypto.randomUUID(),user.user_id,"invite-link",uid)
        ]);
      }else{
        await env.STREAM_USERS_DB.prepare(
          "INSERT INTO stream_admin_events(event_id,admin_id,action,subject_id) VALUES(?,?,?,?)"
        ).bind(crypto.randomUUID(),user.user_id,"invite-link",uid).run();
      }
      return adminPage(user,env,url,{manualLink:actionLink,manualEmail:email});
    }
    const target = String(data.get("user_id") || "");
    const targetRow = await env.STREAM_USERS_DB.prepare(
      "SELECT user_id,email,role,status,canceled_invite_at FROM stream_users WHERE user_id=?"
    ).bind(target).first();
    if (!targetRow || targetRow.role !== "viewer" || target === user.user_id)
      return plain(403,"Forbidden");
    if (path === "/stream/admin/resend" && targetRow.status === "invited") {
      const outcome=await sendWithEmailQuota(env,"resend",()=>
        supabase(env,"POST","recover?redirect_to=" +
          encodeURIComponent(activationURL(url)),{email:targetRow.email}));
      if(outcome.quota)return adminPage(user,env,url,{error:"daily-quota"});
      if(!outcome.ok)return adminPage(user,env,url,{error:
        outcome.result?invitationError(outcome.result):"provider"});
      await env.STREAM_USERS_DB.prepare(
        "INSERT INTO stream_admin_events(event_id,admin_id,action,subject_id) VALUES(?,?,?,?)"
      ).bind(crypto.randomUUID(),user.user_id,"resend",target).run();
      return redirect(url.origin,"/stream/admin?result=resent");
    }
    if (path === "/stream/admin/recover" && targetRow.status === "active") {
      // A recovery request is generated by Supabase and delivered to the
      // account owner only. Administrators never see a password/reset token.
      const outcome=await sendWithEmailQuota(env,"recover",()=>
        supabase(env,"POST","recover?redirect_to=" +
          encodeURIComponent(activationURL(url)),{email:targetRow.email}));
      if(outcome.quota)return adminPage(user,env,url,{error:"daily-quota"});
      if(!outcome.ok)return adminPage(user,env,url,{error:
        outcome.result?invitationError(outcome.result):"provider"});
      await env.STREAM_USERS_DB.prepare(
        "INSERT INTO stream_admin_events(event_id,admin_id,action,subject_id) VALUES(?,?,?,?)"
      ).bind(crypto.randomUUID(),user.user_id,"recover",target).run();
      return redirect(url.origin,"/stream/admin?result=recovered");
    }
    if (path === "/stream/admin/revoke" && targetRow.status === "active") {
      // End existing sessions; user stays active and may authenticate again.
      await env.STREAM_USERS_DB.batch([
        env.STREAM_USERS_DB.prepare(
          "DELETE FROM stream_sessions WHERE user_id=?"
        ).bind(target),
        env.STREAM_USERS_DB.prepare(
          "INSERT INTO stream_admin_events(event_id,admin_id,action,subject_id) VALUES(?,?,?,?)"
        ).bind(crypto.randomUUID(),user.user_id,"revoke",target)
      ]);
      return redirect(url.origin,"/stream/admin?result=revoked");
    }
    if (path === "/stream/admin/status") {
      const newStatus = data.get("status");
      const validTransition =
        (targetRow.status === "invited" && newStatus === "suspended") ||
        (targetRow.status === "active" && newStatus === "suspended") ||
        (targetRow.status === "suspended" &&
          newStatus === (targetRow.canceled_invite_at ? "invited" : "active"));
      if (!validTransition) return plain(409,"Transição inválida.");
      const timestamp=now();
      const cancelAt=(targetRow.status==="invited" && newStatus==="suspended") ?
        timestamp : null;
      const action=cancelAt ? "cancel-invite" :
        newStatus==="invited" ? "restore-invite" : newStatus;
      await env.STREAM_USERS_DB.batch([
        env.STREAM_USERS_DB.prepare(
          "UPDATE stream_users SET status=?,updated_at=?,canceled_invite_at=? " +
          "WHERE user_id=? AND status=?"
        ).bind(newStatus,timestamp,cancelAt,target,targetRow.status),
        env.STREAM_USERS_DB.prepare("DELETE FROM stream_sessions WHERE user_id=?").bind(target),
        env.STREAM_USERS_DB.prepare(
          "INSERT INTO stream_admin_events(event_id,admin_id,action,subject_id) VALUES(?,?,?,?)"
        ).bind(crypto.randomUUID(),user.user_id,action,target)
      ]);
      const resultCode=action==="cancel-invite" ? "canceled" :
        action==="suspended" ? "suspended" : "restored";
      return redirect(url.origin,"/stream/admin?result="+resultCode);
    }
    return plain(404,"Not Found");
  }
  if(path.startsWith("/stream/admin/"))return plain(404,"Not Found");
  if (method !== "GET" && method !== "HEAD") return plain(405,"Method Not Allowed");
  if (!["/stream/tv","/stream/listas"].includes(path) && path !== "/stream" &&
      !/^\/stream(?:\/|$)/.test(path)) return plain(404,"Not Found");
  if (path === "/stream/tv" || path === "/stream/listas")
    return redirect(url.origin,path + "/");
  const pageAsset = await bundledAsset(request,env,url,path);
  if (pageAsset) return pageAsset;
  return proxyLegacy(request,env,url);
}
export default {
  async fetch(request, env) {
    try {return await handle(request,env);}
    catch {return plain(503,"Serviço temporariamente indisponível.");}
  }
};
