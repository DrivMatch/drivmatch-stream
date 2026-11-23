/*
 * DrivMatch Stream - separate Cloudflare Worker for private individual accounts.
 * Identity provider: dedicated Supabase Auth project (invitation by email).
 * Per-user sessions, permissions, and favorites: Cloudflare D1.
 * Production is NOT changed by adding this module.
 */
import legacy from "./stream-proxy.mjs";

/*
 * The independent Stream MUST serve its own deployed asset bundle, not the
 * public GitHub Pages main branch (which does not know the logged-in user).
 * Only a fixed allowlist of files is exposed, and only after D1 auth.
 */
const STATIC_FILES = {
  "/stream/":"index.html", "/stream/index.html":"index.html",
  "/stream/stream.css":"stream.css", "/stream/stream.js":"stream.js",
  "/stream/stream-boot.js":"stream-boot.js", "/stream/stream-tv.js":"stream-tv.js",
  "/stream/tv/":"tv.html", "/stream/tv/index.html":"tv.html",
  "/stream/tv/tv.css":"tv.css", "/stream/tv/tv.js":"tv.js",
  "/stream/listas/":"listas.html", "/stream/listas/index.html":"listas.html",
  "/stream/listas/listas.js":"listas.js", "/stream/listas/listas.css":"listas.css",
  "/stream/listas/sources.json":"playlist-sources.json",
  "/stream/listas/brasil-servicos.json":"brasil-servicos.json",
  "/stream/official-access.json":"official-access.json"
};
const APP_CSP = "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; " +
  "style-src 'self'; connect-src 'self' https:; media-src 'self' https: blob:; " +
  "worker-src blob:; img-src 'self' https: data:; " +
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.twitch.tv; " +
  "frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

const TE = new TextEncoder();
const COOKIE = "dm_stream_user";
const FORM_COOKIE = "__Host-dm_stream_form_csrf";
const SESSION_SECONDS = 7 * 24 * 3600;
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
    "SELECT u.user_id,u.email,u.role,u.status FROM stream_sessions s " +
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
  const style = "body{font:16px system-ui,sans-serif;background:#0a1828;color:#eaf0f8;margin:0;padding:26px;min-height:100vh;box-sizing:border-box}" +
    "main{background:#fff;color:#15243b;max-width:650px;margin:8vh auto;padding:30px;border-radius:18px}" +
    "a{color:#206cbd}label{display:block;margin-top:16px;font-weight:650}" +
    "input{display:block;width:100%;box-sizing:border-box;padding:12px;margin-top:6px;border-radius:8px;border:1px solid #aab6c3;font-size:16px}" +
    "button{background:#15345b;color:white;border:0;border-radius:9px;padding:12px 18px;margin-top:18px;font-weight:700;cursor:pointer}" +
    "small{color:#64748b}table{border-collapse:collapse;width:100%}td,th{padding:10px;text-align:left;border-bottom:1px solid #ddd}" +
    "form.inline{display:inline}form.inline button{margin:0;padding:7px}";
  const html = "<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'>" +
    "<meta name='viewport' content='width=device-width,initial-scale=1'>" +
    "<meta name='robots' content='noindex,nofollow,noarchive'><title>" + escape(title) +
    " · DrivMatch Stream</title><style>" + style + "</style></head><body><main>" +
    "<p><strong>DRIVMATCH STREAM</strong></p><h1>" + escape(title) + "</h1>" + body +
    "</main>" + (script ? "<script nonce='" + nonce + "'>" + script + "</script>" : "") +
    "</body></html>";
  const csp = "default-src 'none'; style-src 'unsafe-inline'; " +
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
    "<small>Novas contas são criadas apenas por convite.</small>", error ? 401 : 200),token);
}
function setupPage() {
  const nonce = b64(crypto.getRandomValues(new Uint8Array(16)));
  const body = "<p>Crie uma senha exclusiva, com 12 caracteres ou mais. Este link é pessoal e temporário.</p>" +
    "<form id='setup'><label>Nova senha<input name='password' type='password' autocomplete='new-password' minlength='12' maxlength='256' required></label>" +
    "<button type='submit'>Salvar senha</button></form><p id='message' role='status'></p>";
  const script = "const f=document.getElementById('setup'),m=document.getElementById('message');" +
    "const p=new URLSearchParams(location.hash.slice(1));const token=p.get('access_token');" +
    "history.replaceState(null,'',location.pathname);" +
    "if(!token){f.hidden=true;m.textContent='Link inválido ou expirado. Solicite um novo convite ou recuperação.';}" +
    "f.addEventListener('submit',async e=>{e.preventDefault();m.textContent='Verificando...';" +
    "const password=f.elements.password.value;try{" +
    "const r=await fetch('/stream/activate',{method:'POST',credentials:'same-origin'," +
    "headers:{'Content-Type':'application/json'},body:JSON.stringify({access_token:token,password})});" +
    "if(!r.ok)throw Error('invalid');f.hidden=true;m.textContent='Senha definida. Agora você pode entrar.';" +
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
async function limit(request, env, prefix) {
  if (!env.STREAM_LOGIN_LIMITER?.limit) return false;
  const key = prefix + ":" + (request.headers.get("CF-Connecting-IP") || "unknown");
  try {return (await env.STREAM_LOGIN_LIMITER.limit({key})).success === true;}
  catch {return false;}
}
async function createSession(user, env) {
  const token = random();
  const timestamp = now();
  // Both effects commit together: the timestamp means a successful D1-backed
  // Stream login, not merely viewing a page or clicking an invitation link.
  await env.STREAM_USERS_DB.batch([
    env.STREAM_USERS_DB.prepare(
      "INSERT INTO stream_sessions (token_hash,user_id,expires_at) VALUES(?,?,?)"
    ).bind(await hash(token),user.user_id,timestamp+SESSION_SECONDS),
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
function dateBr(epoch) {
  const time=Number(epoch);
  if (!Number.isFinite(time) || time<=0) return "Não registrado";
  try {
    return new Intl.DateTimeFormat("pt-BR",{
      timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",
      hour:"2-digit",minute:"2-digit",hour12:false
    }).format(new Date(time*1000));
  } catch {return "Data indisponível";}
}
function statusLabel(item) {
  if (item.status==="active") return "Ativo";
  if (item.status==="invited") return "Convite pendente";
  if (item.status==="suspended" && item.canceled_invite_at)
    return "Convite cancelado";
  return "Acesso suspenso";
}
async function adminPage(user, env) {
  const token=await issueFormToken(env);
  const result=await env.STREAM_USERS_DB.prepare(
    "SELECT user_id,email,role,status,created_at,activated_at,first_login_at," +
    "last_login_at,canceled_invite_at FROM stream_users ORDER BY created_at DESC LIMIT 150"
  ).all();
  let cards="";
  for(const item of result.results || []){
    const isSelf=item.user_id===user.user_id;
    let buttons="";
    if (!isSelf && item.role==="viewer") {
      let next="",action="";
      if(item.status==="invited"){
        next="suspended";action="Cancelar convite";
      } else if(item.status==="active"){
        next="suspended";action="Suspender acesso";
      } else if(item.status==="suspended"){
        next=item.canceled_invite_at ? "invited" : "active";
        action=item.canceled_invite_at ? "Reativar convite" : "Reativar acesso";
      }
      if(next){
        buttons+="<form class='inline' method='post' action='/stream/admin/status'>" +
          formTokenInput(token) +
          "<input type='hidden' name='user_id' value='"+escape(item.user_id)+"'>" +
          "<input type='hidden' name='status' value='"+next+"'>" +
          "<button type='submit'>"+escape(action)+"</button></form> ";
      }
      if(item.status==="invited"){
        buttons+="<form class='inline' method='post' action='/stream/admin/resend'>" +
          formTokenInput(token) +
          "<input type='hidden' name='user_id' value='"+escape(item.user_id)+"'>" +
          "<button type='submit'>Reenviar convite</button></form>";
      }
    }
    cards+="<section class='user-card'><h3>"+escape(item.email)+"</h3>" +
      "<p><strong>Perfil:</strong> "+(item.role==="admin"?"Administrador":"Usuário") +
      (isSelf?" (você)":"")+"</p>" +
      "<p><strong>Situação:</strong> "+escape(statusLabel(item))+"</p>" +
      "<dl><dt>Convite/cadastro</dt><dd>"+escape(dateBr(item.created_at))+"</dd>" +
      "<dt>Senha ativada</dt><dd>"+escape(dateBr(item.activated_at))+"</dd>" +
      "<dt>Primeiro login</dt><dd>"+escape(dateBr(item.first_login_at))+"</dd>" +
      "<dt>Último login</dt><dd>"+escape(dateBr(item.last_login_at))+"</dd></dl>" +
      (buttons?"<div class='user-actions'>"+buttons+"</div>":"")+
      "</section>";
  }
  return stampForm(page("Gerenciamento de acessos",
    "<p>Convide, suspenda ou reative contas. Nenhuma senha, favoritos ou canais assistidos são exibidos.</p>" +
    "<form action='/stream/admin/invite' method='post'>" + formTokenInput(token) +
    "<label>Convidar por e-mail<input type='email' name='email' maxlength='254' required></label>" +
    "<button type='submit'>Enviar convite</button></form>" +
    "<h2>Usuários</h2><p><small>Datas e horas no horário de São Paulo. " +
    "Último login indica autenticação concluída, não visualização de canais. " +
    "Registros anteriores à implantação podem estar indisponíveis.</small></p>" +
    cards +
    "<p><small>Suspender encerra sessões existentes, mas preserva favoritos. " +
    "Cancelar impede o uso do convite no Stream. Reativar convite permite reenviá-lo.</small></p>" +
    "<p><a href='/stream/'>Voltar ao Stream</a></p>",200),token);
}
async function bundledAsset(request, env, url, path) {
  if (!Object.hasOwn(STATIC_FILES, path)) return null;
  // Fail closed: falling back to GitHub Pages would reintroduce shared favorites.
  if (!env.ASSETS?.fetch) return plain(503, "Arquivos protegidos indisponíveis.");
  const name = STATIC_FILES[path];
  const assetUrl = new URL("/stream/" + name, url.origin);
  const response = await env.ASSETS.fetch(new Request(assetUrl, {method:request.method}));
  if (!response.ok) return plain(502, "Arquivo protegido indisponível.");
  const headers = {...HEADERS, "Content-Security-Policy":APP_CSP,
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
    return redirect(url.origin,destination,await createSession(account,env));
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
      await supabase(env,"POST","recover?redirect_to=" +
        encodeURIComponent(url.origin + "/stream/activate"), {email});
    }
    return page("Solicitação recebida","<p>Se o endereço possuir acesso, receberá um e-mail com instruções.</p>" +
      "<p><a href='/stream/login'>Voltar ao login</a></p>");
  }
  if (method === "GET" && path === "/stream/activate") return setupPage();
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
    return json(200,{ok:true});
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
  if (path === "/stream/session" && (method === "GET" || method === "HEAD"))
    return new Response(method === "HEAD" ? null :
      JSON.stringify({allowed:true,user_id:user.user_id,role:user.role}), {
      status:200,headers:{...HEADERS,"Content-Type":"application/json"}});
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
    if (data.operation === "import" && user.role === "admin" && Array.isArray(data.keys) &&
        data.keys.length <= 1500 && data.keys.every(valid)) {
      for (const key of new Set(data.keys)) {
        await env.STREAM_USERS_DB.prepare(
          "INSERT OR IGNORE INTO stream_favorites(user_id,favorite_key) VALUES(?,?)"
        ).bind(user.user_id,key).run();
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
  if (path === "/stream/admin" && method === "GET")
    return requireAdmin(user) ? adminPage(user,env) :
      page("Conta sem permissão de administrador",
        "<p>Você entrou com uma conta que não tem acesso a este painel.</p>" +
        "<p>Confirme que utilizou o e-mail da sua conta administradora.</p>" +
        "<form action='/stream/logout' method='post'><button type='submit'>Sair desta conta</button></form>",403);
  if (path.startsWith("/stream/admin/") && method === "POST") {
    if (!requireAdmin(user)) return plain(403,"Forbidden");
    const data = await form(request);
    if (!await verifyFormToken(request,url,data,env)) return plain(403,"Formulário expirado. Reabra o painel.");
    if (!await limit(request,env,"admin")) return plain(429,"Muitas operações.");
    if (path === "/stream/admin/invite") {
      const email = String(data.get("email") || "").trim().toLowerCase();
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return plain(400,"E-mail inválido.");
      const exists = await env.STREAM_USERS_DB.prepare(
        "SELECT user_id FROM stream_users WHERE email=?"
      ).bind(email).first();
      if (exists) return plain(409,"Conta já cadastrada. Utilize a ação adequada no painel.");
      const result = await supabase(env,"POST","invite?redirect_to=" +
        encodeURIComponent(url.origin + "/stream/activate"),{email},true);
      if (!result.ok || !result.data?.id) return plain(502,"Não foi possível enviar o convite.");
      await env.STREAM_USERS_DB.prepare(
        "INSERT INTO stream_users(user_id,email,role,status) VALUES(?,?,'viewer','invited')"
      ).bind(result.data.id,email).run();
      await env.STREAM_USERS_DB.prepare(
        "INSERT INTO stream_admin_events(event_id,admin_id,action,subject_id) VALUES(?,?,?,?)"
      ).bind(crypto.randomUUID(),user.user_id,"invite",result.data.id).run();
      return redirect(url.origin,"/stream/admin");
    }
    const target = String(data.get("user_id") || "");
    const targetRow = await env.STREAM_USERS_DB.prepare(
      "SELECT user_id,email,role,status FROM stream_users WHERE user_id=?"
    ).bind(target).first();
    if (!targetRow || targetRow.role !== "viewer" || target === user.user_id)
      return plain(403,"Forbidden");
    if (path === "/stream/admin/resend" && targetRow.status === "invited") {
      const result = await supabase(env,"POST","recover?redirect_to=" +
        encodeURIComponent(url.origin + "/stream/activate"),{email:targetRow.email});
      if (!result.ok) return plain(502,"Não foi possível reenviar.");
      await env.STREAM_USERS_DB.prepare(
        "INSERT INTO stream_admin_events(event_id,admin_id,action,subject_id) VALUES(?,?,?,?)"
      ).bind(crypto.randomUUID(),user.user_id,"resend",target).run();
      return redirect(url.origin,"/stream/admin");
    }
    if (path === "/stream/admin/status") {
      const newStatus = data.get("status");
      if (!((targetRow.status === "active" && newStatus === "suspended") ||
            (targetRow.status === "suspended" && newStatus === "active")))
        return plain(409,"Transição inválida.");
      await env.STREAM_USERS_DB.batch([
        env.STREAM_USERS_DB.prepare(
          "UPDATE stream_users SET status=?,updated_at=? WHERE user_id=? AND status=?"
        ).bind(newStatus,now(),target,targetRow.status),
        env.STREAM_USERS_DB.prepare("DELETE FROM stream_sessions WHERE user_id=?").bind(target),
        env.STREAM_USERS_DB.prepare(
          "INSERT INTO stream_admin_events(event_id,admin_id,action,subject_id) VALUES(?,?,?,?)"
        ).bind(crypto.randomUUID(),user.user_id,newStatus,target)
      ]);
      return redirect(url.origin,"/stream/admin");
    }
    return plain(404,"Not Found");
  }
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