/* Dedicated admin console for Stream Now. Server-side role authorization
 * and CSRF checks remain in independent-access.mjs. No secrets on the client.
 * No third-party analytics, libraries, CDNs or remote admin dashboards. */
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
})[c]);
const css=[
"@font-face{font-family:Montserrat;src:url(/stream/montserrat-latin.woff2) format('woff2');font-weight:100 900;font-display:swap}",
"html{color-scheme:dark}",
"*,*::before,*::after{box-sizing:border-box}",
"html{font:16px/1.45 Montserrat,Arial,sans-serif}",
"body{margin:0;background:#101010;color:#f6f6f6;min-height:100vh}",
"button,input,select{font:inherit}",
"button{cursor:pointer}",
":focus-visible{outline:3px solid #f0f0f0;outline-offset:3px}",
".masthead{background:#0b0b0b;color:#fff;padding:16px 0}",
".wrap{max-width:1200px;margin:auto;padding:0 22px}",
".masthead .wrap{display:flex;justify-content:space-between;align-items:center;gap:12px}",
".logo{font-weight:800;letter-spacing:.025em;font-size:17px}",
".logo img{display:block;width:124px;height:auto}",
".toplink{border:1px solid #666;color:#fff;padding:9px 14px;border-radius:9px;text-decoration:none;font-weight:650;white-space:nowrap}",
"main{max-width:1200px;margin:0 auto;padding:26px 22px 56px}",
".eyebrow{text-transform:uppercase;letter-spacing:.12em;color:#ddd;font-size:12px;font-weight:750}",
"h1{font-size:clamp(25px,3vw,36px);line-height:1.15;margin:5px 0 6px}",
"h2{font-size:20px;margin:0 0 12px}",
".sub{color:#ccc;margin:0 0 20px;max-width:750px}",
".metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px;margin-bottom:22px}",
".metric{background:#191919;border:1px solid #434343;border-radius:13px;padding:16px 18px;box-shadow:0 2px 12px rgba(0,0,0,.04)}",
".metric strong{display:block;font-size:30px;line-height:1.2;margin-top:5px;font-variant-numeric:tabular-nums}",
".metric span{font-size:13px;color:#c8c8c8;font-weight:650}",
".panel{background:#191919;border:1px solid #494949;border-radius:15px;padding:22px;margin:17px 0;box-shadow:0 3px 16px rgba(0,0,0,.035)}",
".panel-head{display:flex;justify-content:space-between;align-items:start;gap:14px;flex-wrap:wrap}",
".hint{color:#ccc;font-size:13px;margin:0 0 12px}",
".invite-form{display:flex;align-items:end;flex-wrap:wrap;gap:12px}",
".invite-form label{flex:1;min-width:230px;font-weight:650;font-size:14px}",
"input,select{border:1px solid #777;border-radius:9px;min-height:44px;padding:10px 12px;background:#191919;color:#f6f6f6}",
".invite-form input{display:block;width:100%;margin-top:6px}",
".btn{border:1px solid #666;background:#191919;color:#f0f0f0;border-radius:9px;padding:10px 14px;min-height:44px;font-weight:700}",
".btn-primary{background:#c80020;color:#fff;border-color:#c80020}",
".btn-danger{border-color:#b90023;background:#390d18;color:#fff}",
".btn-warn{background:#292929;border-color:#777;color:#e0e0e0}",
".btn-subtle{background:#292929;border-color:#666;color:#e0e0e0}",
".tool-row{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 16px}",
".tool-row label{display:block;flex:1;min-width:180px}",
".tool-row input,.tool-row select{width:100%}",
".table-wrap{overflow-x:auto}",
"table{border-collapse:collapse;width:100%;min-width:690px}",
"th{font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#ddd;text-align:left;background:#242424}",
"td,th{border-bottom:1px solid #444;padding:13px 10px;vertical-align:middle}",
"tbody tr:hover{background:#262626}",
".user-mail{font-weight:750;overflow-wrap:anywhere;color:#fff}",
".secondary{display:block;color:#bbb;font-size:12px;margin-top:3px}",
".mobile-status{display:none}",
".chip{display:inline-block;font-size:12px;font-weight:750;border:1px solid;border-radius:100px;padding:4px 10px;white-space:nowrap}",
".chip-active{background:#252525;color:#eee;border-color:#777}",
".chip-invited{background:#242424;color:#eee;border-color:#777}",
".chip-suspended{background:#390d18;color:#fff;border-color:#b90023}",
".chip-admin{background:#292929;color:#eee;border-color:#777}",
".cell-date{font-size:13px;white-space:nowrap;color:#ccc}",
".search-empty{padding:18px;color:#ccc;text-align:center}",
".notice{padding:13px 15px;border:1px solid #666;border-radius:11px;background:#242424;color:#eee;font-weight:650;margin:12px 0}",
".notice-error{background:#390d18;color:#fff;border-color:#b90023}",
".notice a{color:inherit;text-decoration:underline}",
".setup-hint{background:#252525;border-left:3px solid #a90020;padding:12px;margin:13px 0;border-radius:6px;font-size:14px;color:#ddd}",
".copy-row{display:flex;align-items:end;gap:10px;flex-wrap:wrap}",
".copy-row input{width:100%;margin-top:4px}.copy-row label{flex:1;min-width:180px;font-size:13px}",
".inline-form{display:flex;flex-wrap:wrap;align-items:end;gap:10px}.inline-form label{flex:1;min-width:210px;font-weight:650}",
".inline-form input{width:100%;margin-top:5px}",
".privacy{border-left:3px solid #888;padding-left:12px;font-size:13px;color:#ccc}",
".activity-list{margin:0;padding:0;list-style:none}",
".activity-list li{border-top:1px solid #444;padding:10px 0;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:13px}",
".activity-list time{color:#ccc;white-space:nowrap}",
"dialog{position:fixed;border:0;border-radius:16px;padding:0;max-width:520px;width:calc(100% - 30px);max-height:calc(100dvh - 32px);overflow-y:auto;box-shadow:0 20px 80px rgba(0,0,0,.36)}",
"dialog::backdrop{background:rgba(0,0,0,.66)}",
".detail{padding:22px;color:#f6f6f6;background:#191919}",
".detail h2{overflow-wrap:anywhere;padding-right:36px;font-size:22px}",
".dialog-top{position:relative}",
".close{position:absolute;top:0;right:0;border:0;background:#303030;border-radius:9px;width:36px;height:36px;font-size:20px}",
".detail p{color:#ccc;margin:4px 0 14px}",
".data-list{display:grid;grid-template-columns:1fr 1fr;gap:9px 15px;margin:14px 0 22px}",
".data-list div{padding:10px 0;border-top:1px solid #444;min-width:0}",
".data-list dt{font-size:12px;font-weight:750;color:#ccc}",
".data-list dd{margin:5px 0 0;font-size:14px;font-weight:650;overflow-wrap:anywhere}",
".action-title{font-size:14px;font-weight:800;margin-top:12px}",
".actions{display:grid;gap:10px;padding-top:10px}",
".actions form{margin:0}.actions button{width:100%;text-align:left}",
".fineprint{font-size:12px;color:#bcbcbc;margin:13px 0 0}",
"footer{text-align:center;font-size:12px;color:#bbb;padding:18px}",
"[hidden]{display:none!important}",
"@media(max-width:760px){.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}table{min-width:0}th:nth-child(2),td:nth-child(2),th:nth-child(3),td:nth-child(3),th:nth-child(4),td:nth-child(4){display:none}.mobile-status{display:block;margin-top:5px}td,th{padding:12px 8px}.masthead .wrap{gap:8px}.logo{font-size:13px}.toplink{font-size:12px;padding:9px}.panel{padding:15px}.wrap,main{padding-left:13px;padding-right:13px}.user-mail{font-size:13px}.cell-actions .btn{font-size:12px;padding:7px 9px}.metric{padding:13px}.metric strong{font-size:25px}}",
"@media(max-width:430px){.metrics{gap:8px}.data-list{grid-template-columns:1fr 1fr;gap:6px}.detail{padding:18px}.detail h2{font-size:18px}.metrics .metric span{font-size:12px}}"
].join("\n");

function fmt(ts) {
  if(!Number.isFinite(Number(ts)) || Number(ts)<=0) return "Não registrado";
  try{return new Intl.DateTimeFormat("pt-BR",{
    timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",hour12:false
  }).format(new Date(Number(ts)*1000));}
  catch{return "Data indisponível";}
}
// Count calendar days in the Stream's canonical São Paulo timezone, not
// 24-hour blocks. The first login date is day 0; the next local date is day 1.
// Does not depend on the browser/device timezone or session history.
function saoPauloCalendarDay(epochSeconds) {
  const parts=new Intl.DateTimeFormat("en-US",{
    timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"
  }).formatToParts(new Date(epochSeconds*1000));
  const date=Object.fromEntries(parts.filter(p=>p.type!=="literal")
    .map(p=>[p.type,Number(p.value)]));
  return Date.UTC(date.year,date.month-1,date.day)/86400000;
}
export function daysSinceFirstLogin(firstLoginEpoch,asOfEpoch=Math.floor(Date.now()/1000)) {
  const first=Number(firstLoginEpoch),at=Number(asOfEpoch);
  if(!Number.isFinite(first)||first<=0||!Number.isFinite(at)||at<=0)return null;
  return Math.max(0,saoPauloCalendarDay(at)-saoPauloCalendarDay(first));
}
function state(u) {
  if(u.approval_state==="pending") return ["Aguardando aprovação","invited"];
  if(u.approval_state==="rejected") return ["Cadastro rejeitado","suspended"];
  if(u.status==="invited") return ["Convite pendente","invited"];
  if(u.status==="active") return ["Ativo","active"];
  return u.canceled_invite_at ? ["Convite cancelado","suspended"] :
    ["Suspenso","suspended"];
}
function formFor(path,uid,token,title,variant,confirm,status) {
  const hidden="<input type='hidden' name='_csrf' value='"+esc(token)+"'>"+
    "<input type='hidden' name='user_id' value='"+esc(uid)+"'>"+
    (status?"<input type='hidden' name='status' value='"+esc(status)+"'>":"");
  const confirmation=confirm?" data-confirm='"+esc(confirm)+"'":"";
  return "<form method='post' action='/stream/admin/"+path+"'"+confirmation+">"+
    hidden+"<button type='submit' class='btn "+esc(variant)+"'>"+esc(title)+"</button></form>";
}
function detailsFor(u,actorId,token,index,asOfEpoch) {
  const own=u.user_id===actorId;
  const [label,cls]=state(u);
  let actions="";
  if(!own && u.role==="viewer") {
    if(u.approval_state==="pending") {
      actions+=formFor("approval",u.user_id,token,"Aprovar cadastro","btn-primary","Aprovar este usuário e permitir seu login?","approved").replace("name='status'","name='decision'");
      actions+=formFor("approval",u.user_id,token,"Rejeitar cadastro","btn-danger","Rejeitar esta solicitação?","rejected").replace("name='status'","name='decision'");
    }else     if(u.status==="invited"){
      actions+=formFor("resend",u.user_id,token,"Reenviar link de ativação","btn-subtle",
        "Solicitar novo e-mail de ativação para esta conta?");
      actions+=formFor("manual-link",u.user_id,token,"Gerar link privado para copiar","",
        "Gerar link temporário para envio manual? Trate-o como uma chave de acesso pessoal.");
      actions+=formFor("status",u.user_id,token,"Cancelar convite","btn-danger",
        "Cancelar o convite? O usuário não conseguirá ativar o Stream.", "suspended");
    }else if(u.status==="active"){
      actions+=formFor("recover",u.user_id,token,"Enviar recuperação de senha","btn-subtle",
        "Solicitar um e-mail de recuperação de senha para este usuário?");
      actions+=formFor("revoke",u.user_id,token,"Desconectar dispositivos","",
        "Encerrar as sessões deste usuário? Ele poderá entrar novamente.");
      actions+=formFor("status",u.user_id,token,"Suspender acesso","btn-danger",
        "Suspender este usuário e encerrar todas as sessões?", "suspended");
    }else if(u.canceled_invite_at){
      actions+=formFor("status",u.user_id,token,"Reativar convite","btn-primary",
        "Reativar o convite? Depois será possível reenviar o link.", "invited");
    }else{
      actions+=formFor("status",u.user_id,token,"Reativar acesso","btn-primary",
        "Reativar o acesso deste usuário?", "active");
    }
  }
  const row=(name,value)=>"<div><dt>"+esc(name)+"</dt><dd>"+esc(value)+"</dd></div>";
  return "<dialog class='user-dialog' id='account-"+index+"' aria-labelledby='account-name-"+index+"'>"+
    "<div class='detail'><div class='dialog-top'><button type='button' class='close' data-close aria-label='Fechar detalhes'>×</button>"+
    "<span class='eyebrow'>Ficha do usuário</span><h2 id='account-name-"+index+"'>"+esc(u.email)+"</h2>"+
    "<span class='chip chip-"+cls+"'>"+esc(label)+"</span></div>"+
    "<dl class='data-list'>"+
    row("Perfil",own?"Administrador (sua conta)":u.role==="admin"?"Administrador":"Usuário")+
    row("Criado/convidado em",fmt(u.created_at))+
    row("Senha ativada em",fmt(u.activated_at))+
    row("Primeiro login",fmt(u.first_login_at))+
    row("Dias desde o primeiro acesso",(()=>{
      const days=daysSinceFirstLogin(u.first_login_at,asOfEpoch);
      return days===null?"Aguardando primeiro acesso":
        days+" "+(days===1?"dia corrido":"dias corridos");
    })())+
    row("Último login",fmt(u.last_login_at))+
    row("Sessões abertas",String(u.session_count||0))+
    (u.canceled_invite_at?row("Convite cancelado em",fmt(u.canceled_invite_at)):"")+
    "</dl>"+
    (actions?"<div class='action-title'>Comandos de acesso</div><div class='actions'>"+actions+"</div>":
      "<p class='fineprint'>Sua própria conta administrativa não pode ser suspensa por este painel.</p>")+
    "<p class='fineprint'>Recuperação e convites são enviados pelo provedor de e-mail. A entrega deve ser conferida no destinatário.</p>"+
    "</div></dialog>";
}
function activityName(action){
  return ({"signup-approved":"Cadastro aprovado","signup-rejected":"Cadastro rejeitado","invite":"Convite solicitado","resend":"Reenvio solicitado","recover":"Recuperação solicitada",
    "active":"Acesso reativado","suspended":"Acesso suspenso","cancel-invite":"Convite cancelado",
    "restore-invite":"Convite reativado","revoke":"Sessões encerradas"})[action]||"Ação administrativa";
}
const RESULTS={
  approved:"Cadastro aprovado. O usuário já pode entrar após confirmar o e-mail.",
  rejected:"Solicitação rejeitada. O usuário permanece sem acesso.",
  invited:"Convite solicitado ao provedor. Confirme o recebimento com o destinatário.",
  resent:"Reenvio solicitado ao provedor. Confira a caixa de entrada e o spam.",
  recovered:"E-mail de recuperação solicitado ao provedor. A entrega não é garantida.",
  suspended:"Acesso suspenso e sessões encerradas.",
  canceled:"Convite cancelado neste Stream. A conta permanecerá bloqueada.",
  restored:"Permissão reativada.",
  revoked:"Sessões existentes encerradas."
};
const ERRORS={
  smtp:"E-mail externo bloqueado pelo serviço padrão do Supabase. Configure SMTP próprio para enviar convites ou use 'Gerar link privado' abaixo.",
  limit:"O Supabase atingiu o limite de e-mails. Configure SMTP próprio ou use um link privado para este teste.",
  existing:"Este e-mail já existe no Supabase. Verifique o cadastro e o vínculo com o Stream antes de convidar novamente.",
  permissions:"Não foi possível autorizar o envio pelo Supabase. Confira a chave secreta do projeto no Worker de teste.",
  provider:"O provedor de autenticação não conseguiu atender agora. Nenhum novo acesso foi confirmado.",
  failure:"O convite não foi enviado. A causa não foi confirmada. Você pode gerar um link privado enquanto verificamos o e-mail.",
  "daily-quota":"Limite diário atingido: 20 solicitações de e-mail no Stream Now. Novos envios ficam disponíveis na próxima data de São Paulo. Os acessos existentes continuam funcionando."
};
export function renderAccessConsole({users=[],actorId="",token="",events=[],notice="",error="",manualLink="",manualEmail="",emailQuotaUsed=0,emailQuotaLimit=20,asOfEpoch=Math.floor(Date.now()/1000)}){
  const totals={active:0,invited:0,suspended:0};
  const rows=[],dialogs=[];
  for(let i=0;i<users.length;i++){
    const u=users[i];
    if(Object.hasOwn(totals,u.status))totals[u.status]++;
    const [label,cls]=state(u);
    const index=i+1;
    const userHtml="<span class='user-mail'>"+esc(u.email)+"</span>"+
      "<span class='secondary'>"+(u.role==="admin"?"Administrador":"Usuário")+
      (u.user_id===actorId?" · você":"")+"</span>"+
      "<span class='mobile-status chip chip-"+cls+"'>"+esc(label)+"</span>";
    rows.push("<tr data-user-row data-email='"+esc(String(u.email).toLowerCase())+
      "' data-state='"+esc(u.status)+"'>"+
      "<td>"+userHtml+"</td>"+
      "<td><span class='chip chip-"+cls+"'>"+esc(label)+"</span></td>"+
      "<td class='cell-date'>"+esc(fmt(u.created_at))+"</td>"+
      "<td class='cell-date'>"+esc(fmt(u.last_login_at))+"</td>"+
      "<td class='cell-actions'><button class='btn' type='button' data-open='account-"+index+"'>Gerenciar</button></td>"+
      "</tr>");
    dialogs.push(detailsFor(u,actorId,token,index,asOfEpoch));
  }
  const summary=[
    ["Contas",users.length],["Ativos",users.filter(u=>u.status==="active"&&u.approval_state!=="pending").length],["Aguardando decisão",users.filter(u=>u.approval_state==="pending").length],
    ["Suspensos/cancelados",totals.suspended]
  ].map(([title,count])=>"<div class='metric'><span>"+esc(title)+"</span><strong>"+esc(count)+"</strong></div>").join("");
  const history=events.length?events.map(e=>"<li><span><strong>"+esc(activityName(e.action))+"</strong>"+
    (e.subject_email?" · "+esc(e.subject_email):"")+
    (e.admin_email?" <span class='secondary'>por "+esc(e.admin_email)+"</span>":"")+
    "</span><time>"+esc(fmt(e.created_at))+"</time></li>").join(""):
    "<li>Nenhuma atividade administrativa registrada.</li>";
  const nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),
    x=>x.toString(16).padStart(2,"0")).join("");
  const script=[
    "const search=document.getElementById('member-search');",
    "const status=document.getElementById('member-status');",
    "const rows=Array.from(document.querySelectorAll('[data-user-row]'));",
    "const empty=document.getElementById('empty-search');",
    "function filter(){const q=search.value.trim().toLocaleLowerCase('pt-BR');const s=status.value;let n=0;",
    "rows.forEach(row=>{const show=(!q||row.dataset.email.includes(q))&&(!s||row.dataset.state===s);",
    "row.hidden=!show;if(show)n++;});empty.hidden=n!==0;}",
    "search.addEventListener('input',filter);status.addEventListener('change',filter);",
    "document.querySelectorAll('[data-open]').forEach(btn=>btn.addEventListener('click',()=>{",
    "const d=document.getElementById(btn.dataset.open);if(d&&typeof d.showModal==='function')d.showModal();}));",
    "document.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',()=>btn.closest('dialog').close()));",
    "document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d)d.close();}));",
    "document.querySelectorAll('form[data-confirm]').forEach(form=>form.addEventListener('submit',e=>{",
    "if(!window.confirm(form.dataset.confirm))e.preventDefault();}));",
    "const copy=document.getElementById('copy-private-link');",
    "if(copy)copy.addEventListener('click',async()=>{const t=document.getElementById('generated-link');",
    "try{await navigator.clipboard.writeText(t.value);copy.textContent='Link copiado';}",
    "catch{t.focus();t.select();copy.textContent='Selecione e copie o link';}});"
  ].join("");
  const alert=RESULTS[notice]?"<div class='notice' role='status'>"+esc(RESULTS[notice])+"</div>":"";
  const failure=ERRORS[error]?"<div class='notice notice-error' role='alert'><strong>Falha no convite:</strong> "+esc(ERRORS[error])+"</div>":"";
  const generated=manualLink?
    "<div class='notice' role='status'><strong>Link privado gerado para "+esc(manualEmail)+".</strong>"+
    "<p>Este link permite definir a senha. Envie apenas ao destinatário por mensagem privada. "+
    "Quem tiver o link poderá usá-lo até expirar; não o compartilhe publicamente.</p>"+
    "<div class='copy-row'><label>Link temporário<input id='generated-link' readonly value='"+esc(manualLink)+"'></label>"+
    "<button id='copy-private-link' type='button' class='btn btn-primary'>Copiar link</button></div>"+
    "<p>O link não foi enviado por e-mail e não ficará salvo neste painel. "+
    "O destinatário cria a própria senha ao abri-lo.</p></div>":"";
  const html="<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'>"+
    "<meta name='viewport' content='width=device-width,initial-scale=1'>"+
    "<meta name='robots' content='noindex,nofollow,noarchive'>"+
    "<meta name='theme-color' content='#0b0b0b'>"+
    "<title>Central de Acessos · Stream Now</title><style>"+css+"</style></head><body>"+
    "<header class='masthead'><div class='wrap'><div class='logo'><img src='/stream/brand.webp' alt='Stream Now' width='220' height='62'></div>"+
    "<a class='toplink' href='/stream/'>Voltar à TV</a></div></header>"+
    "<main><div class='eyebrow'>Área restrita · Administrador</div><h1>Central de Controle</h1>"+
    "<p class='sub'>Gerencie convites, contas, segurança e acesso individual ao Stream.</p>"+
    alert+failure+"<section class='metrics' aria-label='Resumo de acessos'>"+summary+"</section>"+
    "<section class='panel'><h2>Convidar usuário</h2>" +
    "<p class='hint'><strong>E-mails solicitados hoje: "+esc(emailQuotaUsed)+" de "+esc(emailQuotaLimit)+"</strong> " +
    "· Cota compartilhada por convites, reenvios e recuperação de senha. " +
    "Reinicia à meia-noite em São Paulo. A aceitação pelo provedor não garante entrega na caixa de entrada.</p>" +
    "<p class='hint'>A pessoa define a própria senha. Você nunca precisa conhecê-la.</p>"+
    "<form class='invite-form' method='post' action='/stream/admin/invite'>"+
    "<input type='hidden' name='_csrf' value='"+esc(token)+"'>"+
    "<label>E-mail do convidado<input name='email' type='email' maxlength='254' placeholder='usuario@exemplo.com' autocomplete='off' required></label>"+
    "<button class='btn btn-primary' type='submit'>Enviar convite por e-mail</button></form>"+
    "<p class='setup-hint'>O envio automático para pessoas de fora da equipe exige SMTP próprio no Supabase. "+
    "Para testar agora, use a opção abaixo, sem e-mail automático.</p>"+
    "<form class='inline-form' method='post' action='/stream/admin/link-invite'>"+
    "<input type='hidden' name='_csrf' value='"+esc(token)+"'>"+
    "<label>E-mail para convite manual<input type='email' name='email' maxlength='254' placeholder='usuario@exemplo.com' required></label>"+
    "<button class='btn' type='submit'>Gerar link privado</button></form>"+generated+"</section>"+
    "<section class='panel'><div class='panel-head'><h2>Usuários</h2><p class='hint'>Datas: São Paulo (BRT)</p></div>"+
    "<div class='tool-row'><label><span class='secondary'>Buscar usuário</span>"+
    "<input id='member-search' type='search' placeholder='Pesquisar por e-mail' aria-label='Pesquisar usuários'></label>"+
    "<label><span class='secondary'>Filtrar situação</span><select id='member-status' aria-label='Filtrar situação'>"+
    "<option value=''>Todas as situações</option><option value='active'>Ativos</option>"+
    "<option value='invited'>Convites pendentes</option><option value='suspended'>Suspensos/cancelados</option>"+
    "</select></label></div>"+
    "<div class='table-wrap'><table><thead><tr><th>Conta</th><th>Situação</th>"+
    "<th>Cadastro</th><th>Último login</th><th>Ações</th></tr></thead><tbody>"+
    rows.join("")+"</tbody></table></div><p id='empty-search' class='search-empty' hidden>Nenhum usuário encontrado.</p>"+
    "<p class='privacy'>Selecione <strong>Gerenciar</strong> para consultar datas, sessões e comandos. "+
    "Nunca mostramos senhas, favoritos individuais ou os canais assistidos.</p></section>"+
    "<section class='panel'><h2>Registro administrativo</h2>"+
    "<p class='hint'>Histórico das operações administrativas recentes, não da atividade de visualização.</p>"+
    "<ul class='activity-list'>"+history+"</ul></section>"+
    "<footer>Os dias desde o primeiro acesso são contados pelo calendário de São Paulo, a partir do primeiro login registrado. "+
    "A contagem é atualizada ao abrir ou atualizar a Central de Controle. Eventos anteriores à instalação desta função podem não existir.</footer></main>"+
    dialogs.join("")+"<script nonce='"+nonce+"'>"+script+"</script></body></html>";
  return {html,nonce};
}
