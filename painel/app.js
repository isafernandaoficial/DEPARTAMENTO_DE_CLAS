/* Painel dos Clãs Online: CRM de atendimentos e cafés, respostas, usuários e clãs. */
(function(){
"use strict";

const C = window.CONFIG || {};
const LOGO = window.LOGO || "";
const PAINEL_URL = location.origin + location.pathname;
const AGENDA = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const ESCOPO_AGENDA = "https://www.googleapis.com/auth/calendar.events";
const FUSO = (Intl.DateTimeFormat().resolvedOptions().timeZone) || "America/Sao_Paulo";
const STATUS = [["novo", "Novo pedido"], ["agendado", "Agendado"], ["realizado", "Realizado"], ["acompanhamento", "Em acompanhamento"], ["encerrado", "Encerrado"]];
const ORDEM = { novo: 0, agendado: 1, acompanhamento: 2, realizado: 3, encerrado: 4 };
const PAPEIS = { pastor: "Pastor responsável", admin: "Administração", supervisor: "Supervisor(a)", lider: "Líder de clã" };
const ORDEM_PAPEL = { pastor: 0, admin: 1, supervisor: 2, lider: 3 };
const ABAS = [["atendimentos", "Atendimentos"], ["respostas", "Respostas"], ["usuarios", "Usuários"], ["clas", "Clãs"]];

const sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
const app = document.getElementById("app");

const S = {
  perfil: null, aba: "atendimentos", atend: [], resp: [], usuarios: [], clas: [], canais: [],
  f: { status: "ativos", cla: "", busca: "", meus: false },
  fr: { cla: "", busca: "", cafe: false },
  aberto: new Set(), novos: new Set(), rascunho: {},
  novoForm: false, editUsuario: null, editCla: null, confirmar: null, pendente: false
};
let iniciando = false, tokenCliente = null, tokenAgenda = null, tokenExpira = 0, esperaAgenda = null;

{ const ic = document.createElement("link"); ic.rel = "icon"; ic.href = LOGO; document.head.appendChild(ic); }

/* Utilidades */
function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function juntar(v){ return Array.isArray(v) ? v.join(", ") : (v == null ? "" : String(v)); }
function pad(n){ return String(n).padStart(2, "0"); }
function quando(d){ if (!d) return ""; try { return new Date(d).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch (e) { return String(d); } }
function quandoLongo(d){ return new Date(d).toLocaleString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) + (FUSO === "America/Sao_Paulo" ? " (horário de Brasília)" : ""); }
function localStr(d){ return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()); }
function rv(chave, padrao){ return Object.prototype.hasOwnProperty.call(S.rascunho, chave) ? S.rascunho[chave] : padrao; }
function limparRascunho(prefixo){ Object.keys(S.rascunho).forEach(k => { if (k.indexOf(prefixo) === 0) delete S.rascunho[k]; }); }
function toast(msg, erro){
  const t = document.getElementById("toast");
  t.textContent = msg; t.className = "toast" + (erro ? " erro" : ""); t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, erro ? 7000 : 3500);
}
function veTudo(){ return !!S.perfil && (S.perfil.papel === "pastor" || S.perfil.papel === "admin"); }
function podeAtribuir(){ return veTudo() || (!!S.perfil && S.perfil.papel === "supervisor"); }
function nomeDe(email){ if (!email) return ""; const u = S.usuarios.find(x => x.email === email); return (u && u.nome) || email; }
function statusNome(s){ const x = STATUS.find(p => p[0] === s); return x ? x[1] : s; }
function linkZap(fone, texto){
  const z = String(fone || "").replace(/\D/g, "");
  if (!z) return "";
  return "https://wa.me/" + (z.length <= 11 ? "55" + z : z) + (texto ? "?text=" + encodeURIComponent(texto) : "");
}
function clasVisiveis(){ return veTudo() ? S.clas.filter(c => c.ativo).map(c => c.nome) : (S.perfil.clas || []).slice(); }
function campo(id, rotulo, html){ return '<div class="campo"><label for="' + id + '">' + esc(rotulo) + '</label>' + html + '</div>'; }
function opcoes(lista, atual, vazio){
  return (vazio != null ? '<option value="">' + esc(vazio) + '</option>' : '') +
    lista.map(o => { const v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (v === atual ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join("");
}

/* Entrada com Google */
function cabecalho(){
  const p = S.perfil;
  return '<header class="topo"><div class="brand"><img src="' + LOGO + '" alt=""><div><b>Painel dos Clãs Online</b><small>Get Church Global · Departamento dos Clãs</small></div></div>' +
    (p ? '<div class="quem"><span class="status" id="status"><i></i>Conectando</span><span class="eu"><b>' + esc(p.nome || p.email) + '</b><small>' + esc(PAPEIS[p.papel] || "") + '</small></span><button class="btn" type="button" data-acao="sair">Sair</button></div>' : '') +
    '</header>';
}

function telaLogin(msg){
  pararCanais();
  app.innerHTML = cabecalho() + '<section class="login"><h1>Entrar no painel</h1>' +
    '<p class="muted">Use a conta Google que a liderança do departamento cadastrou para você.</p>' +
    '<div id="gbtn" class="gbtn"></div>' +
    (msg ? '<div class="' + (msg.erro ? "erro" : "aviso") + '">' + esc(msg.texto) + '</div>' : '') + '</section>';
  if (!C.GOOGLE_CLIENT_ID){
    document.getElementById("gbtn").innerHTML = '<p class="aviso">O login com Google está sendo configurado. Volte em instantes.</p>';
    return;
  }
  quandoGoogle(botaoGoogle, 0);
}

function quandoGoogle(fn, n){
  if (window.google && google.accounts && google.accounts.id) return fn();
  if (n > 150){ const el = document.getElementById("gbtn"); if (el) el.innerHTML = '<p class="erro">Não foi possível carregar o Google. Atualize a página.</p>'; return; }
  setTimeout(() => quandoGoogle(fn, n + 1), 100);
}

async function sha256(txt){
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt));
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, "0")).join("");
}

function aleatorio(){
  const a = new Uint8Array(24); crypto.getRandomValues(a);
  return Array.from(a).map(x => x.toString(16).padStart(2, "0")).join("");
}

async function botaoGoogle(){
  const nonce = aleatorio();
  const hash = await sha256(nonce);
  google.accounts.id.initialize({
    client_id: C.GOOGLE_CLIENT_ID, nonce: hash, ux_mode: "popup", auto_select: false, itp_support: true,
    callback: async r => {
      const el = document.getElementById("gbtn");
      if (el) el.innerHTML = '<p class="muted">Entrando...</p>';
      const { error } = await sb.auth.signInWithIdToken({ provider: "google", token: r.credential, nonce: nonce });
      if (error) telaLogin({ erro: true, texto: "Não foi possível entrar: " + error.message });
    }
  });
  const el = document.getElementById("gbtn");
  if (el) google.accounts.id.renderButton(el, { type: "standard", theme: "outline", size: "large", text: "signin_with", shape: "pill", logo_alignment: "left", locale: "pt-BR", width: 280 });
}

async function iniciar(sessao){
  if (iniciando) return;
  iniciando = true;
  app.innerHTML = cabecalho() + '<p class="muted">Carregando...</p>';
  const { data: perfil, error } = await sb.rpc("meu_perfil");
  iniciando = false;
  if (error || !perfil){
    S.perfil = null;
    app.innerHTML = cabecalho() + '<section class="vazio"><h1>Sem acesso</h1><p>A conta ' + esc(sessao.user.email) +
      ' ainda não está cadastrada no painel. Peça à administração do Departamento de Clãs para incluir você.</p>' +
      '<button class="btn" type="button" data-acao="sair">Entrar com outra conta</button></section>';
    return;
  }
  S.perfil = perfil;
  S.aba = abaDoHash();
  await Promise.all([carregarClas(), carregarUsuarios(), carregarAtend(), carregarResp()]);
  desenhar();
  ouvir();
}

async function sair(){
  pararCanais();
  try { if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect(); } catch (e) {}
  tokenAgenda = null; tokenCliente = null;
  S.perfil = null;
  await sb.auth.signOut();
  telaLogin();
}

/* Dados */
async function carregarAtend(){
  const { data, error } = await sb.from("atendimentos").select("*").order("criado_em", { ascending: false }).limit(1000);
  if (error) toast("Não foi possível carregar os atendimentos.", true); else S.atend = data || [];
}
async function carregarResp(){
  const { data, error } = await sb.from("pesquisa_clas_respostas").select("*").order("created_at", { ascending: false }).limit(2000);
  if (error) toast("Não foi possível carregar as respostas.", true); else S.resp = data || [];
}
async function carregarUsuarios(){
  const { data } = await sb.from("usuarios_painel").select("email,nome,papel,clas,ativo").order("nome");
  S.usuarios = data || [];
}
async function carregarClas(){
  const { data } = await sb.from("clas").select("nome,ativo").order("nome");
  S.clas = data || [];
}

function ouvir(){
  pararCanais();
  const c1 = sb.channel("crm-atendimentos")
    .on("postgres_changes", { event: "*", schema: "public", table: "atendimentos" }, p => {
      const n = p.new;
      if (!n || !n.id) return;
      const i = S.atend.findIndex(a => a.id === n.id);
      if (i >= 0) S.atend[i] = n;
      else { S.atend.unshift(n); S.novos.add(n.id); if (p.eventType === "INSERT") toast("Novo atendimento" + (n.cla ? " no clã " + n.cla : "")); }
      redesenharSeguro();
    })
    .subscribe(st => marcarStatus(st));
  const c2 = sb.channel("crm-respostas")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "pesquisa_clas_respostas" }, p => {
      if (!p.new || S.resp.some(r => r.id === p.new.id)) return;
      S.resp.unshift(p.new); S.novos.add(p.new.id);
      if (S.aba === "respostas") toast("Nova resposta do clã " + (p.new.cla || ""));
      redesenharSeguro();
    })
    .subscribe();
  S.canais = [c1, c2];
}
function pararCanais(){ (S.canais || []).forEach(c => { try { sb.removeChannel(c); } catch (e) {} }); S.canais = []; }
function marcarStatus(st){
  const el = document.getElementById("status");
  if (!el) return;
  const on = st === "SUBSCRIBED";
  el.classList.toggle("on", on);
  el.lastChild.textContent = on ? "Ao vivo" : "Reconectando";
}
function campoAtivo(){ const a = document.activeElement; return !!a && app.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); }
function redesenharSeguro(){ if (campoAtivo()){ S.pendente = true; return; } desenhar(); }

/* Estrutura */
function abasPermitidas(){ return ABAS.filter(a => veTudo() || a[0] === "atendimentos" || a[0] === "respostas"); }
function abaDoHash(){ const h = location.hash.replace("#", ""); return abasPermitidas().some(a => a[0] === h) ? h : "atendimentos"; }

function desenhar(){
  if (!S.perfil) return;
  S.pendente = false;
  let corpo;
  if (S.aba === "respostas") corpo = vistaRespostas();
  else if (S.aba === "usuarios") corpo = vistaUsuarios();
  else if (S.aba === "clas") corpo = vistaClas();
  else corpo = vistaAtend();
  const y = window.scrollY;
  app.innerHTML = cabecalho() +
    '<nav class="abas" aria-label="Seções">' + abasPermitidas().map(a => {
      const on = S.aba === a[0];
      const n = a[0] === "atendimentos" ? S.atend.filter(x => x.status === "novo").length : 0;
      return '<a href="#' + a[0] + '" class="aba' + (on ? ' on' : '') + '"' + (on ? ' aria-current="page"' : '') + '>' + esc(a[1]) + (n ? ' <span class="num">' + n + '</span>' : '') + '</a>';
    }).join("") + '</nav><main id="conteudo">' + corpo + '</main>';
  const c = S.canais[0];
  marcarStatus(c && c.state === "joined" ? "SUBSCRIBED" : "");
  window.scrollTo(0, y);
}

/* Atendimentos */
function filtrarAtend(){
  const f = S.f, b = f.busca.trim().toLowerCase();
  return S.atend.filter(a =>
    (f.status === "todos" || (f.status === "ativos" ? a.status !== "encerrado" : a.status === f.status)) &&
    (!f.cla || a.cla === f.cla) &&
    (!f.meus || a.responsavel_email === S.perfil.email) &&
    (!b || [a.nome, a.cla, a.whatsapp, a.email, a.notas, nomeDe(a.responsavel_email)].join(" ").toLowerCase().indexOf(b) >= 0)
  ).sort((x, y) => (ORDEM[x.status] - ORDEM[y.status]) ||
    (x.status === "agendado" ? new Date(x.agendado_para || 0) - new Date(y.agendado_para || 0) : new Date(y.criado_em) - new Date(x.criado_em)));
}

function listaAtendHtml(){
  const l = filtrarAtend();
  if (!l.length) return '<div class="vazio">' + (S.atend.length ? 'Nenhum atendimento com esses filtros.' : 'Os pedidos de café do questionário aparecem aqui automaticamente. Use "Novo atendimento" para registrar outros contatos.') + '</div>';
  return l.map(cardAtend).join("");
}

function vistaAtend(){
  const conta = s => S.atend.filter(a => s === "ativos" ? a.status !== "encerrado" : (s === "todos" || a.status === s)).length;
  const chips = [["ativos", "Em aberto"]].concat(STATUS).concat([["todos", "Todos"]]);
  const clas = Array.from(new Set(S.atend.map(a => a.cla).filter(Boolean).concat(clasVisiveis()))).sort((x, y) => x.localeCompare(y, "pt-BR"));
  return '<div class="barra"><h1>Atendimentos e cafés</h1><button class="btn primary" type="button" data-acao="novo-form">Novo atendimento</button></div>' +
    (S.novoForm ? formNovo() : '') +
    '<div class="chips" role="group" aria-label="Filtrar por status">' + chips.map(c =>
      '<button type="button" class="chip' + (S.f.status === c[0] ? ' on' : '') + '" aria-pressed="' + (S.f.status === c[0]) + '" data-acao="f-status" data-v="' + c[0] + '">' + esc(c[1]) + ' <span>' + conta(c[0]) + '</span></button>').join("") + '</div>' +
    '<div class="filtros">' +
      campo("fa-cla", "Clã", '<select id="fa-cla" data-filtro="cla">' + opcoes(clas, S.f.cla, "Todos os clãs") + '</select>') +
      campo("fa-busca", "Buscar", '<input id="fa-busca" type="search" data-filtro="busca" value="' + esc(S.f.busca) + '" placeholder="Nome, telefone, anotação">') +
      '<label class="check"><input type="checkbox" data-filtro="meus"' + (S.f.meus ? ' checked' : '') + '> Só os meus</label>' +
    '</div>' +
    '<div class="lista" id="lista-atend">' + listaAtendHtml() + '</div>';
}

function formNovo(){
  const cl = clasVisiveis();
  return '<form class="painel-form" data-form="novo" novalidate><h2>Novo atendimento</h2><div class="grade">' +
    campo("n-tipo", "Tipo", '<select id="n-tipo" data-r="novo:tipo">' + opcoes([["cafe", "Café online"], ["atendimento", "Atendimento"]], rv("novo:tipo", "cafe")) + '</select>') +
    campo("n-nome", "Nome", '<input id="n-nome" data-r="novo:nome" maxlength="120" value="' + esc(rv("novo:nome", "")) + '">') +
    campo("n-cla", "Clã", '<select id="n-cla" data-r="novo:cla">' + (cl.length ? opcoes(cl, rv("novo:cla", cl[0])) : '<option value="">Nenhum clã liberado para você</option>') + '</select>') +
    campo("n-zap", "WhatsApp com DDD", '<input id="n-zap" type="tel" inputmode="tel" data-r="novo:whatsapp" maxlength="30" value="' + esc(rv("novo:whatsapp", "")) + '">') +
    campo("n-email", "E-mail (opcional)", '<input id="n-email" type="email" data-r="novo:email" maxlength="160" value="' + esc(rv("novo:email", "")) + '">') +
    '</div>' + campo("n-notas", "Anotação", '<textarea id="n-notas" data-r="novo:notas" maxlength="4000">' + esc(rv("novo:notas", "")) + '</textarea>') +
    '<div class="acoes"><button class="btn" type="button" data-acao="novo-fechar">Cancelar</button><button class="btn primary" type="submit">Salvar atendimento</button></div></form>';
}

function cardAtend(a){
  const meu = a.responsavel_email === S.perfil.email;
  const aberto = S.aberto.has(a.id);
  const badges = [
    '<span class="badge st-' + esc(a.status) + '">' + esc(statusNome(a.status)) + '</span>',
    '<span class="badge' + (a.tipo === "cafe" ? ' cafe' : '') + '">' + (a.tipo === "cafe" ? 'Café online' : 'Atendimento') + '</span>',
    a.responsavel_email ? '<span class="badge">' + (meu ? 'Comigo' : esc(nomeDe(a.responsavel_email))) + '</span>' : '<span class="badge alerta">Sem responsável</span>',
    a.agendado_para ? '<span class="badge">' + esc(quando(a.agendado_para)) + '</span>' : ''
  ].join("");
  return '<article class="resp' + (S.novos.has(a.id) ? ' novo' : '') + '">' +
    '<button type="button" class="resumo" data-acao="abrir" data-id="' + a.id + '" aria-expanded="' + aberto + '">' +
    '<span class="t">' + esc(a.nome || "Sem nome") + (a.cla ? ' · ' + esc(a.cla) : '') + '</span>' +
    '<span class="sub">' + (a.origem === "questionario" ? "Pedido pelo questionário" : "Registro manual") + ' · ' + esc(quando(a.criado_em)) + '</span>' +
    '<span class="badges">' + badges + '</span></button>' +
    (aberto ? detalheAtend(a, meu) : '') + '</article>';
}

function textoZap(a){
  const primeiro = String(a.nome || "").trim().split(" ")[0];
  const eu = String(S.perfil.nome || "").trim().split(" ")[0];
  const ola = "Olá" + (primeiro ? ", " + primeiro : "") + "! Aqui é " + (eu || "a liderança") + ", do Departamento de Clãs da Get Church.";
  if (a.meet_link && a.agendado_para) return ola + " Nosso café online está marcado para " + quandoLongo(a.agendado_para) + ". É só entrar por este link do Google Meet: " + a.meet_link + " Até lá!";
  return ola + " Vi que você pediu um café online de 15 minutos. Qual dia e horário ficam bons para você?";
}

function respostaResumo(a){
  if (!a.resposta_id) return "";
  const r = S.resp.find(x => x.id === a.resposta_id);
  if (!r) return "";
  const itens = [["Participa como", r.funcao], ["Frequência", r.frequencia], ["Contato na semana", r.contato_semana], ["Vida com Deus", r.vida_deus],
    ["Acolhimento", r.acolhimento != null ? r.acolhimento + " de 5" : ""], ["Quer ser preparado(a)", r.preparar]].filter(c => c[1]);
  return '<div class="bloco"><h3>Do questionário</h3><dl class="dl">' + itens.map(c => '<div><dt>' + esc(c[0]) + '</dt><dd>' + esc(c[1]) + '</dd></div>').join("") +
    (r.mensagem ? '<div class="full"><dt>Mensagem</dt><dd>' + esc(r.mensagem) + '</dd></div>' : '') + '</dl></div>';
}

function elegiveis(a){
  return S.usuarios.filter(u => u.ativo && (u.papel === "admin" || u.papel === "pastor" || (u.clas || []).indexOf(a.cla) >= 0))
    .sort((x, y) => String(x.nome || x.email).localeCompare(String(y.nome || y.email), "pt-BR"));
}

function detalheAtend(a, meu){
  const id = a.id;
  const zap = a.whatsapp ? linkZap(a.whatsapp, textoZap(a)) : "";
  const contato = '<div class="contato">' + (a.whatsapp ? '<span>WhatsApp ' + esc(a.whatsapp) + '</span>' : '<span class="muted">Sem WhatsApp</span>') +
    (a.email ? '<span>' + esc(a.email) + '</span>' : '<span class="muted">Sem e-mail</span>') + '</div>';

  const resp = '<div class="bloco"><h3>Responsável</h3><div class="linha">' +
    (podeAtribuir()
      ? campo("r-" + id, "Atribuir a", '<select id="r-' + id + '" data-acao-change="atribuir" data-id="' + id + '">' + opcoes(elegiveis(a).map(u => [u.email, (u.nome || u.email) + " · " + (PAPEIS[u.papel] || "")]), a.responsavel_email || "", "Sem responsável") + '</select>')
      : '<p>' + (a.responsavel_email ? esc(meu ? "Com você" : nomeDe(a.responsavel_email)) : "Ninguém assumiu ainda.") + '</p>') +
    (!meu && (!a.responsavel_email || podeAtribuir()) ? '<button class="btn" type="button" data-acao="assumir" data-id="' + id + '">Assumir</button>' : '') +
    '</div></div>';

  const inicioPadrao = a.agendado_para ? localStr(new Date(a.agendado_para)) : "";
  const agenda = '<div class="bloco"><h3>Agenda e Meet</h3>' +
    (a.agendado_para ? '<p><b>' + esc(quandoLongo(a.agendado_para)) + '</b> · ' + esc(a.duracao_min || 15) + ' minutos</p>' : '<p class="muted">Ainda sem data marcada.</p>') +
    '<div class="acoes">' +
      (a.meet_link ? '<a class="btn" href="' + esc(a.meet_link) + '" target="_blank" rel="noopener">Abrir o Meet</a>' : '') +
      (a.evento_link && meu ? '<a class="btn" href="' + esc(a.evento_link) + '" target="_blank" rel="noopener">Ver na minha agenda</a>' : '') +
      (zap ? '<a class="btn zap" href="' + esc(zap) + '" target="_blank" rel="noopener">' + (a.meet_link ? 'Enviar link no WhatsApp' : 'Chamar no WhatsApp') + '</a>' : '') +
    '</div>' +
    (meu
      ? '<div class="linha">' +
          campo("ag-" + id, "Dia e horário", '<input id="ag-' + id + '" type="datetime-local" data-r="' + id + ':inicio" value="' + esc(rv(id + ":inicio", inicioPadrao)) + '">') +
          campo("du-" + id, "Duração", '<select id="du-' + id + '" data-r="' + id + ':duracao">' + opcoes([["15", "15 minutos"], ["20", "20 minutos"], ["30", "30 minutos"], ["45", "45 minutos"], ["60", "1 hora"]], String(rv(id + ":duracao", String(a.duracao_min || 15)))) + '</select>') +
          '<button class="btn primary" type="button" data-acao="agendar" data-id="' + id + '">' + (a.evento_id ? 'Atualizar na minha agenda' : 'Criar na minha agenda com Meet') + '</button>' +
          (a.evento_id ? '<button class="btn" type="button" data-acao="cancelar-agenda" data-id="' + id + '">Cancelar agendamento</button>' : '') +
        '</div><p class="hint">O evento entra no seu Google Agenda com link do Meet' + (a.email ? ' e o convite vai para ' + esc(a.email) : '') + '. Horário do seu fuso: ' + esc(FUSO) + '.</p>'
      : '<p class="hint">Para marcar na agenda, o atendimento precisa estar com você.</p>') +
    '</div>';

  const situacao = '<div class="bloco"><h3>Situação e anotações</h3><div class="linha">' +
    campo("st-" + id, "Status", '<select id="st-' + id + '" data-acao-change="status" data-id="' + id + '">' + opcoes(STATUS, a.status) + '</select>') + '</div>' +
    campo("no-" + id, "Anotações do atendimento", '<textarea id="no-' + id + '" data-r="' + id + ':notas" maxlength="4000" placeholder="Como foi, pedidos de oração, próximos passos">' + esc(rv(id + ":notas", a.notas || "")) + '</textarea>') +
    '<div class="acoes"><button class="btn" type="button" data-acao="salvar-notas" data-id="' + id + '">Salvar anotação</button>' +
    (a.atualizado_por ? '<span class="hint">Última alteração por ' + esc(nomeDe(a.atualizado_por)) + ' em ' + esc(quando(a.atualizado_em)) + '</span>' : '') + '</div></div>';

  return '<div class="detalhe">' + contato + resp + agenda + situacao + respostaResumo(a) + '</div>';
}

async function atualizar(id, patch){
  const { data, error } = await sb.from("atendimentos").update(patch).eq("id", id).select().maybeSingle();
  if (error) throw new Error("Não foi possível salvar: " + error.message);
  if (!data) throw new Error("Você não tem permissão para alterar este atendimento.");
  const i = S.atend.findIndex(x => x.id === id);
  if (i >= 0) S.atend[i] = data; else S.atend.unshift(data);
  desenhar();
  return data;
}

async function salvarNovo(){
  const nome = String(rv("novo:nome", "")).trim();
  const cl = clasVisiveis();
  const cla = rv("novo:cla", cl[0] || "");
  if (!nome) return toast("Informe o nome.", true);
  if (!cla) return toast("Escolha o clã.", true);
  const linha = {
    origem: "manual", tipo: rv("novo:tipo", "cafe"), nome: nome, cla: cla,
    whatsapp: String(rv("novo:whatsapp", "")).trim() || null, email: String(rv("novo:email", "")).trim().toLowerCase() || null,
    notas: String(rv("novo:notas", "")).trim() || null, responsavel_email: S.perfil.email
  };
  const { data, error } = await sb.from("atendimentos").insert(linha).select().maybeSingle();
  if (error) return toast("Não foi possível salvar: " + error.message, true);
  if (data && !S.atend.some(x => x.id === data.id)) S.atend.unshift(data);
  limparRascunho("novo:"); S.novoForm = false;
  if (data) S.aberto.add(data.id);
  desenhar();
  toast("Atendimento registrado.");
}

/* Google Agenda */
function pedirTokenAgenda(){
  return new Promise((ok, falha) => {
    if (tokenAgenda && Date.now() < tokenExpira - 60000) return ok(tokenAgenda);
    if (!C.GOOGLE_CLIENT_ID) return falha(new Error("A agenda do Google ainda está sendo configurada."));
    if (!(window.google && google.accounts && google.accounts.oauth2)) return falha(new Error("O Google ainda está carregando. Tente de novo em instantes."));
    if (!tokenCliente){
      tokenCliente = google.accounts.oauth2.initTokenClient({
        client_id: C.GOOGLE_CLIENT_ID, scope: ESCOPO_AGENDA, login_hint: S.perfil.email,
        callback: r => {
          const e = esperaAgenda; esperaAgenda = null;
          if (!e) return;
          if (r && r.access_token && google.accounts.oauth2.hasGrantedAllScopes(r, ESCOPO_AGENDA)){
            tokenAgenda = r.access_token; tokenExpira = Date.now() + (Number(r.expires_in) || 3600) * 1000; e.ok(tokenAgenda);
          } else e.falha(new Error("Para marcar na agenda, autorize o acesso ao Google Agenda."));
        },
        error_callback: err => {
          const e = esperaAgenda; esperaAgenda = null;
          if (e) e.falha(new Error(err && err.type === "popup_closed" ? "A janela do Google foi fechada antes da autorização." : "Não foi possível abrir a autorização do Google. Libere janelas pop-up para este site."));
        }
      });
    }
    esperaAgenda = { ok: ok, falha: falha };
    tokenCliente.requestAccessToken({ prompt: "" });
  });
}

function chamarAgenda(metodo, url, corpo, token){
  const h = { Authorization: "Bearer " + token };
  if (corpo) h["Content-Type"] = "application/json";
  return fetch(url, { method: metodo, headers: h, body: corpo ? JSON.stringify(corpo) : undefined });
}

function pedidoMeet(){
  const id = (crypto.randomUUID ? crypto.randomUUID() : aleatorio());
  return { createRequest: { requestId: id, conferenceSolutionKey: { type: "hangoutsMeet" } } };
}

async function salvarEvento(a, inicioLocal, duracao, token){
  const inicio = new Date(inicioLocal), fim = new Date(inicio.getTime() + duracao * 60000);
  const corpo = {
    summary: (a.tipo === "cafe" ? "Café online · " : "Atendimento · ") + (a.nome || "membro") + (a.cla ? " · " + a.cla : ""),
    description: (a.tipo === "cafe" ? "Café online" : "Atendimento") + " do Departamento de Clãs da Get Church.\n" + (a.whatsapp ? "WhatsApp: " + a.whatsapp + "\n" : "") + "Painel: " + PAINEL_URL,
    start: { dateTime: localStr(inicio) + ":00", timeZone: FUSO },
    end: { dateTime: localStr(fim) + ":00", timeZone: FUSO },
    attendees: a.email ? [{ email: a.email }] : [],
    reminders: { useDefault: true }
  };
  const q = "?conferenceDataVersion=1&sendUpdates=all";
  let r = null;
  if (a.evento_id){
    if (!a.meet_link) corpo.conferenceData = pedidoMeet();
    r = await chamarAgenda("PATCH", AGENDA + "/" + encodeURIComponent(a.evento_id) + q, corpo, token);
    if (r.status === 404 || r.status === 403 || r.status === 410) r = null;
  }
  if (!r){
    corpo.conferenceData = pedidoMeet();
    r = await chamarAgenda("POST", AGENDA + q, corpo, token);
  }
  let ev = await r.json().catch(() => ({}));
  if (!r.ok){
    if (r.status === 401) tokenAgenda = null;
    throw new Error("Google Agenda: " + ((ev.error && ev.error.message) || ("erro " + r.status)));
  }
  const pend = ev.conferenceData && ev.conferenceData.createRequest && ev.conferenceData.createRequest.status && ev.conferenceData.createRequest.status.statusCode === "pending";
  if (!ev.hangoutLink && pend){
    await new Promise(ok => setTimeout(ok, 1500));
    const r2 = await chamarAgenda("GET", AGENDA + "/" + encodeURIComponent(ev.id), null, token);
    if (r2.ok) ev = await r2.json();
  }
  return ev;
}

async function agendar(id, btn){
  const a = S.atend.find(x => x.id === id);
  if (!a) return;
  const inicioLocal = rv(id + ":inicio", a.agendado_para ? localStr(new Date(a.agendado_para)) : "");
  if (!inicioLocal) return toast("Escolha o dia e o horário.", true);
  if (new Date(inicioLocal).getTime() < Date.now() - 60000) return toast("Escolha um horário futuro.", true);
  const duracao = Number(rv(id + ":duracao", a.duracao_min || 15)) || 15;
  const tokenPromessa = pedirTokenAgenda();
  btn.disabled = true; btn.textContent = "Aguardando o Google...";
  try {
    const token = await tokenPromessa;
    btn.textContent = "Criando o evento...";
    const ev = await salvarEvento(a, inicioLocal, duracao, token);
    delete S.rascunho[id + ":inicio"]; delete S.rascunho[id + ":duracao"];
    await atualizar(id, {
      status: "agendado", agendado_para: new Date(inicioLocal).toISOString(), duracao_min: duracao,
      evento_id: ev.id || null, evento_link: ev.htmlLink || null, meet_link: ev.hangoutLink || null
    });
    toast(ev.hangoutLink ? "Marcado na sua agenda com link do Meet." : "Marcado na sua agenda. O Meet não foi gerado; abra o evento para incluir.");
  } catch (e) {
    toast(e.message || "Não foi possível marcar na agenda.", true);
    btn.disabled = false; btn.textContent = "Tentar de novo";
  }
}

async function cancelarAgenda(id, btn){
  const a = S.atend.find(x => x.id === id);
  if (!a) return;
  if (S.confirmar !== "cancelar:" + id){
    S.confirmar = "cancelar:" + id; btn.textContent = "Confirmar cancelamento"; btn.classList.add("perigo");
    return;
  }
  S.confirmar = null;
  const tokenPromessa = a.evento_id ? pedirTokenAgenda() : Promise.resolve(null);
  btn.disabled = true; btn.textContent = "Cancelando...";
  try {
    const token = await tokenPromessa;
    if (token && a.evento_id){
      const r = await chamarAgenda("DELETE", AGENDA + "/" + encodeURIComponent(a.evento_id) + "?sendUpdates=all", null, token);
      if (!r.ok && r.status !== 404 && r.status !== 410) throw new Error("O Google Agenda recusou o cancelamento (erro " + r.status + ").");
    }
    await atualizar(id, { status: "novo", agendado_para: null, evento_id: null, evento_link: null, meet_link: null });
    toast("Agendamento cancelado.");
  } catch (e) {
    toast(e.message, true); btn.disabled = false; btn.textContent = "Cancelar agendamento"; btn.classList.remove("perigo");
  }
}

/* Respostas */
function filtrarResp(){
  const f = S.fr;
  return S.resp.filter(l => (!f.cla || l.cla === f.cla) && (!f.cafe || l.quer_cafe) && (!f.busca || JSON.stringify(l).toLowerCase().indexOf(f.busca) >= 0));
}

function dadosRespHtml(){
  const v = filtrarResp();
  const hoje = new Date().toDateString();
  const notas = v.map(l => l.acolhimento).filter(n => typeof n === "number");
  const media = notas.length ? (notas.reduce((x, y) => x + y, 0) / notas.length).toFixed(1).replace(".", ",") : "Sem notas";
  const tiles = '<div class="tiles">' +
    '<div class="tile"><span>Respostas</span><b>' + v.length + '</b></div>' +
    '<div class="tile"><span>Hoje</span><b>' + v.filter(l => new Date(l.created_at).toDateString() === hoje).length + '</b></div>' +
    '<div class="tile cafe"><span>Pediram café</span><b>' + v.filter(l => l.quer_cafe).length + '</b></div>' +
    '<div class="tile"><span>Sem contato na semana</span><b>' + v.filter(l => l.contato_semana === "Não").length + '</b></div>' +
    '<div class="tile"><span>Acolhimento médio</span><b>' + media + '</b></div></div>';
  const lista = v.length ? v.map(cartaoResp).join("") : '<div class="vazio">' + (S.resp.length ? "Nenhuma resposta com esses filtros." : "As respostas aparecem aqui assim que alguém enviar o questionário.") + '</div>';
  return tiles + '<div class="lista">' + lista + '</div>';
}

function vistaRespostas(){
  const clas = Array.from(new Set(S.resp.map(l => l.cla).filter(Boolean))).sort((x, y) => x.localeCompare(y, "pt-BR"));
  return '<div class="barra"><div><h1>Respostas da caminhada</h1><p class="muted">' + (S.resp.length ? "Última resposta em " + esc(quando(S.resp[0].created_at)) + "." : "Nenhuma resposta ainda.") + '</p></div>' +
    '<button class="btn" type="button" data-acao="baixar-csv">Baixar CSV</button></div>' +
    '<div class="filtros">' +
      campo("fr-cla", "Clã", '<select id="fr-cla" data-filtro-resp="cla">' + opcoes(clas, S.fr.cla, "Todos os clãs") + '</select>') +
      campo("fr-busca", "Buscar", '<input id="fr-busca" type="search" data-filtro-resp="busca" value="' + esc(S.fr.busca) + '" placeholder="Nome, mensagem, resposta">') +
      '<label class="check"><input type="checkbox" data-filtro-resp="cafe"' + (S.fr.cafe ? ' checked' : '') + '> Só pedidos de café</label>' +
    '</div><div id="dados-resp">' + dadosRespHtml() + '</div>';
}

function cartaoResp(l){
  const aberto = S.aberto.has(l.id);
  const cadastrado = S.clas.some(c => c.nome === l.cla);
  const campos = [
    ["Participa como", l.funcao], ["Tempo no clã", l.tempo_cla], ["Frequência", l.frequencia], ["Contato na semana", l.contato_semana],
    ["Contato quando falta", l.contato_falta], ["Pontualidade", l.pontualidade], ["Acolhimento", l.acolhimento != null ? l.acolhimento + " de 5" : ""],
    ["O que fortalece", juntar(l.ajuda)], ["O que dificulta", juntar(l.dificuldades)], ["Convidaria alguém", l.convidaria],
    ["Vida com Deus", l.vida_deus], ["Estudo", l.estudo], ["Serve", l.serve], ["Quer ser preparado(a)", l.preparar],
    ["Horas para servir", l.horas_servir], ["Rotina", juntar(l.rotina)], ["Necessidades", juntar(l.necessidades)],
    ["Ânimo para servir", l.animo_servir != null ? l.animo_servir + " de 5" : ""]
  ].filter(c => c[1]);
  const badges = [l.funcao ? '<span class="badge">' + esc(l.funcao) + '</span>' : '',
    l.quer_cafe ? '<span class="badge cafe">Pediu café</span>' : '',
    l.contato_semana === "Não" ? '<span class="badge alerta">Sem contato na semana</span>' : '',
    l.vida_deus === "Distante" ? '<span class="badge alerta">Vida com Deus distante</span>' : '',
    !cadastrado ? '<span class="badge">Clã fora da lista</span>' : ''].join("");
  return '<article class="resp' + (S.novos.has(l.id) ? ' novo' : '') + '">' +
    '<button type="button" class="resumo" data-acao="abrir" data-id="' + l.id + '" aria-expanded="' + aberto + '">' +
    '<span class="t">' + esc(l.cla || "Clã não informado") + (l.nome ? ' · ' + esc(l.nome) : '') + '</span>' +
    '<span class="sub">' + esc(quando(l.created_at)) + '</span><span class="badges">' + badges + '</span></button>' +
    (aberto ? '<div class="detalhe">' +
      (l.quer_cafe ? '<div class="contato"><span>' + esc(l.nome || "Sem nome") + '</span>' + (l.whatsapp ? '<span>WhatsApp ' + esc(l.whatsapp) + '</span>' : '') + (l.email ? '<span>' + esc(l.email) + '</span>' : '') + '</div>' : '') +
      '<dl class="dl">' + campos.map(c => '<div><dt>' + esc(c[0]) + '</dt><dd>' + esc(c[1]) + '</dd></div>').join("") +
      (l.mensagem ? '<div class="full"><dt>Mensagem para a liderança</dt><dd>' + esc(l.mensagem) + '</dd></div>' : '') + '</dl>' +
      (veTudo() && S.clas.length ? '<div class="linha">' + campo("cc-" + l.id, "Corrigir clã", '<select id="cc-' + l.id + '" data-acao-change="corrigir-cla" data-id="' + l.id + '">' +
        opcoes(S.clas.map(c => c.nome), cadastrado ? l.cla : "", cadastrado ? null : "Escolha o clã certo") + '</select>') + '</div>' : '') +
      '</div>' : '') + '</article>';
}

async function corrigirCla(id, cla){
  if (!cla) return;
  const { error } = await sb.rpc("corrigir_cla_resposta", { p_id: id, p_cla: cla });
  if (error) return toast(error.message, true);
  await Promise.all([carregarResp(), carregarAtend()]);
  desenhar(); toast("Clã corrigido.");
}

function baixarCSV(){
  const cols = ["created_at", "cla", "funcao", "tempo_cla", "frequencia", "contato_semana", "contato_falta", "pontualidade", "acolhimento", "ajuda", "dificuldades", "convidaria", "vida_deus", "estudo", "serve", "preparar", "horas_servir", "rotina", "necessidades", "animo_servir", "mensagem", "quer_cafe", "nome", "whatsapp", "email", "versao", "id"];
  const celula = v => '"' + String(Array.isArray(v) ? v.join(", ") : (v == null ? "" : v)).replace(/"/g, '""') + '"';
  const csv = String.fromCharCode(0xFEFF) + cols.join(";") + "\n" + filtrarResp().map(l => cols.map(c => celula(l[c])).join(";")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = "respostas-caminhada-no-cla.csv";
  document.body.appendChild(a); a.click(); a.remove();
}

/* Usuários */
function temPastor(){ return S.usuarios.some(u => u.papel === "pastor" && u.ativo); }
function podeEditarUsuario(u){ return S.perfil.papel === "pastor" || !(u.papel === "pastor" || u.papel === "admin"); }
function papeisPermitidos(atual){
  if (S.perfil.papel === "pastor") return ["pastor", "admin", "supervisor", "lider"];
  const l = ["supervisor", "lider"];
  if (!temPastor() || atual === "pastor") l.unshift("pastor");
  return l;
}

function vistaUsuarios(){
  const eu = S.perfil.papel;
  const lista = S.usuarios.slice().sort((x, y) => (ORDEM_PAPEL[x.papel] - ORDEM_PAPEL[y.papel]) || String(x.nome || x.email).localeCompare(String(y.nome || y.email), "pt-BR"));
  return '<div class="barra"><h1>Usuários</h1><button class="btn primary" type="button" data-acao="u-novo">Novo usuário</button></div>' +
    '<p class="muted">Cada pessoa entra com a conta Google do e-mail cadastrado aqui. ' +
      (eu === "pastor" ? 'Como pastor responsável, você pode alterar qualquer cadastro, inclusive a administração.' : 'Pastor e administração só podem ser alterados pelo pastor responsável.') + '</p>' +
    (!temPastor() && eu === "admin" ? '<div class="aviso">Cadastre o pastor responsável pela Get Online. Depois disso, só ele poderá alterar o seu acesso.</div>' : '') +
    (S.editUsuario ? formUsuario() : '') +
    '<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Clãs</th><th>Situação</th><th><span class="muted">Ações</span></th></tr></thead><tbody>' +
    lista.map(u => '<tr' + (u.ativo ? '' : ' class="inativo"') + '><td>' + esc(u.nome || "") + '</td><td>' + esc(u.email) + '</td><td>' + esc(PAPEIS[u.papel] || u.papel) + '</td><td>' +
      esc(juntar(u.clas) || (u.papel === "pastor" || u.papel === "admin" ? "Todos" : "Nenhum")) + '</td><td>' + (u.ativo ? "Ativo" : "Revogado") + '</td><td>' +
      (podeEditarUsuario(u) ? '<button class="btn" type="button" data-acao="u-editar" data-email="' + esc(u.email) + '">Editar</button>' : '') + '</td></tr>').join("") +
    '</tbody></table></div>';
}

function formUsuario(){
  const e = S.editUsuario;
  const papel = rv("u:papel", "lider");
  const clasSel = rv("u:clas", []);
  const mostraClas = papel === "lider" || papel === "supervisor";
  return '<form class="painel-form" data-form="usuario" novalidate><h2>' + (e.novo ? "Novo usuário" : "Editar usuário") + '</h2><div class="grade">' +
    campo("u-email", "E-mail da conta Google", '<input id="u-email" type="email" data-r="u:email" maxlength="160" value="' + esc(rv("u:email", "")) + '"' + (e.novo ? '' : ' readonly') + '>') +
    campo("u-nome", "Nome", '<input id="u-nome" data-r="u:nome" maxlength="120" value="' + esc(rv("u:nome", "")) + '">') +
    campo("u-papel", "Papel", '<select id="u-papel" data-r="u:papel" data-redesenha="1">' + opcoes(papeisPermitidos(e.papelAtual).map(p => [p, PAPEIS[p]]), papel) + '</select>') +
    '</div>' +
    (mostraClas ? '<fieldset class="campo" style="border:0;padding:0;margin:0"><legend style="font-weight:600;font-size:13px;margin-bottom:5px">Clãs que ' + (papel === "supervisor" ? "supervisiona" : "lidera") + '</legend>' +
      (S.clas.length ? '<div class="opcoes">' + S.clas.map(c => '<label class="check"><input type="checkbox" data-r-arr="u:clas" value="' + esc(c.nome) + '"' + (clasSel.indexOf(c.nome) >= 0 ? ' checked' : '') + '> ' + esc(c.nome) + (c.ativo ? '' : ' (inativo)') + '</label>').join("") + '</div>'
        : '<p class="hint">Cadastre os clãs na aba Clãs antes de vincular pessoas.</p>') + '</fieldset>'
      : '<p class="hint">Pastor e administração veem todos os clãs.</p>') +
    '<label class="check"><input type="checkbox" data-r="u:ativo"' + (rv("u:ativo", true) ? ' checked' : '') + '> Acesso ativo</label>' +
    '<div class="acoes"><button class="btn" type="button" data-acao="u-fechar">Cancelar</button><button class="btn primary" type="submit">Salvar usuário</button></div></form>';
}

async function salvarUsuario(){
  const email = String(rv("u:email", "")).trim().toLowerCase();
  const papel = rv("u:papel", "lider");
  const clas = (papel === "lider" || papel === "supervisor") ? rv("u:clas", []) : [];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast("Confira o e-mail.", true);
  if ((papel === "lider" || papel === "supervisor") && !clas.length) return toast("Escolha pelo menos um clã.", true);
  const { error } = await sb.rpc("salvar_usuario", { p_email: email, p_nome: String(rv("u:nome", "")).trim(), p_papel: papel, p_clas: clas, p_ativo: !!rv("u:ativo", true) });
  if (error) return toast(error.message, true);
  if (email === S.perfil.email){ location.reload(); return; }
  limparRascunho("u:"); S.editUsuario = null;
  await carregarUsuarios(); desenhar(); toast("Usuário salvo.");
}

/* Clãs */
function vistaClas(){
  return '<div class="barra"><h1>Clãs</h1></div>' +
    '<p class="muted">Os clãs ativos aparecem como opção no questionário. Renomear um clã atualiza respostas, atendimentos e usuários.</p>' +
    '<form class="painel-form" data-form="cla-novo" novalidate><div class="linha">' +
      campo("c-novo", "Novo clã", '<input id="c-novo" data-r="c:novo" maxlength="120" value="' + esc(rv("c:novo", "")) + '">') +
      '<button class="btn primary" type="submit">Adicionar clã</button></div></form>' +
    (S.clas.length ? '<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Clã</th><th>Respostas</th><th>Em aberto</th><th>Equipe</th><th>Situação</th><th><span class="muted">Ações</span></th></tr></thead><tbody>' +
      S.clas.map(c => {
        const equipe = S.usuarios.filter(u => u.ativo && (u.clas || []).indexOf(c.nome) >= 0).map(u => u.nome || u.email).join(", ");
        if (S.editCla === c.nome){
          return '<tr><td colspan="6"><form class="linha" data-form="cla-editar" novalidate>' +
            campo("c-nome", "Nome do clã", '<input id="c-nome" data-r="c:nome" maxlength="120" value="' + esc(rv("c:nome", c.nome)) + '">') +
            '<label class="check"><input type="checkbox" data-r="c:ativo"' + (rv("c:ativo", c.ativo) ? ' checked' : '') + '> Ativo</label>' +
            '<button class="btn" type="button" data-acao="c-fechar">Cancelar</button><button class="btn primary" type="submit">Salvar</button></form></td></tr>';
        }
        return '<tr' + (c.ativo ? '' : ' class="inativo"') + '><td>' + esc(c.nome) + '</td><td>' + S.resp.filter(r => r.cla === c.nome).length + '</td><td>' +
          S.atend.filter(a => a.cla === c.nome && a.status !== "encerrado").length + '</td><td>' + esc(equipe || "Sem equipe") + '</td><td>' + (c.ativo ? "Ativo" : "Inativo") + '</td><td>' +
          '<button class="btn" type="button" data-acao="c-editar" data-nome="' + esc(c.nome) + '">Editar</button></td></tr>';
      }).join("") + '</tbody></table></div>'
      : '<div class="vazio">Nenhum clã cadastrado. Enquanto a lista estiver vazia, o questionário pede o nome do clã por escrito.</div>');
}

async function salvarCla(atual){
  const nome = String(atual ? rv("c:nome", atual) : rv("c:novo", "")).trim();
  if (!nome) return toast("Informe o nome do clã.", true);
  const ativo = atual ? !!rv("c:ativo", true) : true;
  const { error } = await sb.rpc("salvar_cla", { p_nome_atual: atual || null, p_nome: nome, p_ativo: ativo });
  if (error) return toast(error.message.indexOf("duplicate") >= 0 ? "Já existe um clã com esse nome." : error.message, true);
  if (atual){ limparRascunho("c:nome"); limparRascunho("c:ativo"); S.editCla = null; } else limparRascunho("c:novo");
  await Promise.all([carregarClas(), carregarUsuarios(), carregarResp(), carregarAtend()]);
  desenhar(); toast("Clã salvo.");
}

/* Eventos */
app.addEventListener("click", ev => {
  const el = ev.target.closest("[data-acao]");
  if (!el || !app.contains(el)) return;
  const acao = el.dataset.acao, id = el.dataset.id;
  if (acao !== "cancelar-agenda") S.confirmar = null;
  if (acao === "sair") return sair();
  if (acao === "abrir"){ S.aberto.has(id) ? S.aberto.delete(id) : S.aberto.add(id); S.novos.delete(id); return desenhar(); }
  if (acao === "f-status"){ S.f.status = el.dataset.v; return desenhar(); }
  if (acao === "novo-form"){ S.novoForm = true; desenhar(); const n = document.getElementById("n-nome"); if (n) n.focus(); return; }
  if (acao === "novo-fechar"){ S.novoForm = false; limparRascunho("novo:"); return desenhar(); }
  if (acao === "assumir") return atualizar(id, { responsavel_email: S.perfil.email }).then(() => toast("Atendimento com você.")).catch(e => toast(e.message, true));
  if (acao === "agendar") return agendar(id, el);
  if (acao === "cancelar-agenda") return cancelarAgenda(id, el);
  if (acao === "salvar-notas"){
    const a = S.atend.find(x => x.id === id);
    const notas = String(rv(id + ":notas", (a && a.notas) || "")).trim();
    return atualizar(id, { notas: notas || null }).then(() => { delete S.rascunho[id + ":notas"]; toast("Anotação salva."); }).catch(e => toast(e.message, true));
  }
  if (acao === "baixar-csv") return baixarCSV();
  if (acao === "u-novo"){ limparRascunho("u:"); S.rascunho["u:papel"] = papeisPermitidos(null).indexOf("lider") >= 0 ? "lider" : papeisPermitidos(null)[0]; S.rascunho["u:ativo"] = true; S.rascunho["u:clas"] = []; S.editUsuario = { novo: true, papelAtual: null }; desenhar(); const n = document.getElementById("u-email"); if (n) n.focus(); return; }
  if (acao === "u-editar"){
    const u = S.usuarios.find(x => x.email === el.dataset.email);
    if (!u) return;
    limparRascunho("u:");
    Object.assign(S.rascunho, { "u:email": u.email, "u:nome": u.nome || "", "u:papel": u.papel, "u:clas": (u.clas || []).slice(), "u:ativo": u.ativo });
    S.editUsuario = { novo: false, papelAtual: u.papel }; desenhar(); window.scrollTo(0, 0); return;
  }
  if (acao === "u-fechar"){ S.editUsuario = null; limparRascunho("u:"); return desenhar(); }
  if (acao === "c-editar"){ S.editCla = el.dataset.nome; delete S.rascunho["c:nome"]; delete S.rascunho["c:ativo"]; return desenhar(); }
  if (acao === "c-fechar"){ S.editCla = null; return desenhar(); }
});

function guardar(el){
  if (el.dataset.r) S.rascunho[el.dataset.r] = el.type === "checkbox" ? el.checked : el.value;
  if (el.dataset.rArr){
    const k = el.dataset.rArr, s = new Set(S.rascunho[k] || []);
    if (el.checked) s.add(el.value); else s.delete(el.value);
    S.rascunho[k] = Array.from(s);
  }
}

app.addEventListener("input", ev => {
  const el = ev.target;
  guardar(el);
  if (el.dataset.filtro === "busca"){ S.f.busca = el.value; const l = document.getElementById("lista-atend"); if (l) l.innerHTML = listaAtendHtml(); }
  if (el.dataset.filtroResp === "busca"){ S.fr.busca = el.value.toLowerCase(); const d = document.getElementById("dados-resp"); if (d) d.innerHTML = dadosRespHtml(); }
});

app.addEventListener("change", ev => {
  const el = ev.target;
  guardar(el);
  if (el.dataset.redesenha){ el.blur(); desenhar(); return; }
  if (el.dataset.filtro === "cla"){ S.f.cla = el.value; el.blur(); return desenhar(); }
  if (el.dataset.filtro === "meus"){ S.f.meus = el.checked; return desenhar(); }
  if (el.dataset.filtroResp === "cla"){ S.fr.cla = el.value; el.blur(); return desenhar(); }
  if (el.dataset.filtroResp === "cafe"){ S.fr.cafe = el.checked; return desenhar(); }
  const id = el.dataset.id;
  if (el.dataset.acaoChange === "status"){ el.blur(); atualizar(id, { status: el.value }).then(() => toast("Status atualizado.")).catch(e => { toast(e.message, true); desenhar(); }); }
  if (el.dataset.acaoChange === "atribuir"){ el.blur(); atualizar(id, { responsavel_email: el.value || null }).then(() => toast(el.value ? "Responsável definido." : "Responsável removido.")).catch(e => { toast(e.message, true); desenhar(); }); }
  if (el.dataset.acaoChange === "corrigir-cla"){ el.blur(); corrigirCla(id, el.value); }
});

app.addEventListener("submit", ev => {
  const f = ev.target.closest("form[data-form]");
  if (!f) return;
  ev.preventDefault();
  const t = f.dataset.form;
  if (t === "novo") salvarNovo();
  else if (t === "usuario") salvarUsuario();
  else if (t === "cla-novo") salvarCla(null);
  else if (t === "cla-editar") salvarCla(S.editCla);
});

app.addEventListener("focusout", () => {
  setTimeout(() => { if (S.pendente && !campoAtivo()) desenhar(); }, 400);
});

window.addEventListener("hashchange", () => {
  if (!S.perfil) return;
  S.aba = abaDoHash(); S.aberto.clear(); desenhar(); window.scrollTo(0, 0);
});

sb.auth.onAuthStateChange((evento, sessao) => {
  if (evento === "SIGNED_IN" && sessao && !S.perfil && !iniciando) setTimeout(() => iniciar(sessao), 0);
});

(async () => {
  const { data } = await sb.auth.getSession();
  if (data.session) iniciar(data.session); else telaLogin();
})();

})();
