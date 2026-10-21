/* VUNBY — app.js (prestador) */
'use strict';

// ─── API helper ───────────────────────────────────────────────
async function api(path, { method = 'GET', body } = {}) {
  const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' };
  if (body) opts.body = JSON.stringify(body);
  let res;
  try {
    res = await fetch(path, opts);
  } catch {
    throw new Error('Sem conexão. Verifique sua internet e tente novamente.');
  }
  const data = await res.json().catch(() => ({}));
  // 402 = teste grátis terminou e a ação exige assinatura
  if (res.status === 402 && data.bloqueado) { window.location.href = '/planos.html?bloqueado=1'; }
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

// ─── Sessão ───────────────────────────────────────────────────
async function requireSession() {
  try {
    return await api('/api/auth/me');
  } catch {
    // Depois do login, volta para a página que a pessoa tentou abrir (ex.: link do e-mail)
    window.location.href = '/entrar?volta=' + encodeURIComponent(location.pathname + location.search);
    return null;
  }
}

// ─── Aviso do plano (teste grátis / assinatura) ───────────────
// Devolve o HTML do aviso para o topo das páginas, ou '' quando não há nada a avisar.
function avisoPlano(st) {
  if (!st) return '';
  let html = '';
  if (st.tipo === 'expirado') {
    html += `<div class="card aviso-plano aviso-plano-fim">
      <strong>${st.status === 'pix' ? 'Seu mês pago terminou.' : 'Seu teste grátis terminou.'}</strong>
      <p>Seus orçamentos continuam salvos aqui. Para criar novos, assine o VUNBY.</p>
      <a href="planos.html"><button class="btn-primary btn-gold">Ver planos</button></a>
    </div>`;
  } else if (st.tipo === 'pix' && st.acessoAte && new Date(st.acessoAte) - Date.now() < 3 * 86400000) {
    html += `<a href="planos.html" class="card aviso-plano aviso-plano-trial">
      <span>${ic('calendario')} Seu acesso vence dia <strong>${new Date(st.acessoAte).toLocaleDateString('pt-BR')}</strong></span>
      <span class="aviso-plano-link">Pagar com Pix ›</span>
    </a>`;
  } else if (st.tipo === 'trial') {
    const d = st.diasTrial;
    html += `<a href="planos.html" class="card aviso-plano aviso-plano-trial">
      <span>${ic('presente')} Teste grátis: <strong>${d === 1 ? 'último dia' : 'faltam ' + d + ' dias'}</strong></span>
      <span class="aviso-plano-link">Ver planos ›</span>
    </a>`;
  }
  if (st.feedbackPendente) {
    html += `<a href="opiniao.html" class="card aviso-plano aviso-plano-trial">
      <span>${ic('conversa')} <strong>Como está sendo o VUNBY?</strong> 2 minutos para nos contar.</span>
      <span class="aviso-plano-link">Responder ›</span>
    </a>`;
  }
  if (st.pulsoPendente && !st.feedbackPendente) {
    html += `<a href="opiniao-rapida.html" class="card aviso-plano aviso-plano-trial">
      <span>${ic('conversa')} <strong>30 segundos?</strong> Uma nota rápida sobre o VUNBY.</span>
      <span class="aviso-plano-link">Responder ›</span>
    </a>`;
  }
  return html;
}

// ─── Logout ───────────────────────────────────────────────────
function wireLogout() {
  const btn = document.getElementById('btn-logout');
  if (btn) btn.addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/entrar';
  });
}

// ─── Topbar ───────────────────────────────────────────────────
const ICON_CONTA = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;
const ICON_PLANO = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/></svg>`;

const ABAS_PRINCIPAIS = ['dashboard.html', 'radar.html', 'historico.html', 'tabela.html'];
const ICON_VOLTAR = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`;
// Seta de voltar: volta à tela anterior do app; se a pessoa abriu direto nesta tela, vai para o Início
function voltarTela() {
  let veioDoApp = false;
  try { veioDoApp = !!document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1; } catch {}
  if (veioDoApp) history.back(); else location.href = 'dashboard.html';
}
function topbar(active) {
  const pagina = (location.pathname.split('/').pop() || '').replace(/^$/, 'dashboard.html');
  const nome = pagina.indexOf('.') < 0 ? pagina + '.html' : pagina;
  const interna = !ABAS_PRINCIPAIS.includes(nome);
  const voltar = interna ? `<button type="button" class="topbar-voltar" aria-label="Voltar" onclick="voltarTela()">${ICON_VOLTAR}</button>` : '';
  return `<nav class="topbar">
    <span class="topbar-esq">${voltar}<a class="topbar-logo" href="dashboard.html"><img src="/icons/logo-app.png" alt="VUNBY"/></a></span>
    <span class="topbar-acoes">
    <a href="planos.html" class="topbar-icon${active==='planos.html'?' topbar-icon-active':''}" aria-label="Meu plano e pagamento">${ICON_PLANO}<span class="topbar-icon-txt">Plano</span></a>
    <a href="conta.html" class="topbar-icon${active==='conta.html'?' topbar-icon-active':''}" aria-label="Minha conta">${ICON_CONTA}<span class="topbar-icon-txt">Conta</span></a>
    </span>
  </nav>`;
}

// ─── Bottom Nav (mobile) ──────────────────────────────────────
const NAV_ICONS = {
  home: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>`,
  radar: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><line x1="12" y1="2" x2="12" y2="6"/></svg>`,
  historico: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="8" y2="14"/><line x1="12" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="8" y2="18"/><line x1="12" y1="18" x2="16" y2="18"/></svg>`,
  tabela: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>`,
  pacotes: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
  plus: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
};

function bottomNav(active) {
  const items = [
    ['dashboard.html', 'home',     'Início'],
    ['radar.html',     'radar',    'Radar'],
    ['historico.html', 'historico','Histórico'],
    ['tabela.html',    'tabela',   'Preços'],
  ];
  const navItems = items.map(([href, icon, label]) => `
    <a href="${href}" class="${href === active ? 'active' : ''}">
      ${NAV_ICONS[icon]}
      <span>${label}</span>
    </a>`).join('');
  const cta = `
    <a href="novo-orcamento.html" class="nav-cta">
      <span class="nav-icon-wrap" style="color:#1C1C1E">${NAV_ICONS.plus}</span>
      <span>Orçar</span>
    </a>`;
  return `<nav class="bottom-nav">${navItems}${cta}</nav>`;
}

// ─── Loading / erro ───────────────────────────────────────────
function skeletonRows(n = 3) {
  return Array.from({length: n}, () =>
    `<div class="skeleton-row"><div class="skeleton-line" style="width:60%"></div><div class="skeleton-line" style="width:35%"></div></div>`
  ).join('');
}

function errorBlock(msg, onRetry) {
  const id = 'retry-' + Math.random().toString(36).slice(2);
  setTimeout(() => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', onRetry);
  }, 0);
  return `<div class="error-block"><p>${msg}</p><button id="${id}" class="btn-outline" style="margin-top:var(--sp-3)">Tentar novamente</button></div>`;
}

// ─── Formatação ───────────────────────────────────────────────
function brl(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function badgeClass(status) {
  const map = {
    'Enviado': 'badge badge-enviado',
    'Visualizado': 'badge badge-visualizado',
    'Sem resposta': 'badge badge-sem-resposta',
    'Aprovado': 'badge badge-aprovado',
    'Recusado': 'badge badge-recusado',
  };
  return map[status] || 'badge';
}

function relDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'agora';
  if (diff < 3600) return `${Math.floor(diff/60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h atrás`;
  if (diff < 7*86400) return `${Math.floor(diff/86400)}d atrás`;
  return d.toLocaleDateString('pt-BR');
}

// ─── PWA Service Worker ───────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// ─── Logo: reduz a imagem escolhida (máx. 400px) antes de enviar ─────
function reduzirImagem(file){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      const max=400, k=Math.min(1,max/Math.max(img.width,img.height));
      const c=document.createElement('canvas'); c.width=Math.round(img.width*k); c.height=Math.round(img.height*k);
      c.getContext('2d').drawImage(img,0,0,c.width,c.height);
      // PNG mantém fundo transparente (logo redonda continua redonda)
      const png=file.type!=='image/jpeg';
      let url=c.toDataURL(png?'image/png':'image/jpeg',0.85);
      if(url.length>500000) url=c.toDataURL('image/jpeg',0.8);
      URL.revokeObjectURL(img.src); resolve(url);
    };
    img.onerror=()=>reject(new Error('Não foi possível ler essa imagem.'));
    img.src=URL.createObjectURL(file);
  });
}

// ─── Atalho no editor de itens: montar o orçamento pela tabela de preços do prestador ─────
function ferramentasItens(editorRef, campoObs) {
  return { ferramentas: [{ rotulo: 'Montar pela minha tabela de preços', icone: 'lista', acao: () => abrirMontarTabela(
    itens => editorRef().adicionarItens(itens),
    texto => { const o = document.getElementById(campoObs); if (o) { o.value = (o.value.trim() ? o.value.trim() + '\n' : '') + texto; o.dispatchEvent(new Event('input', { bubbles: true })); } }) }] };
}

// ─── Dados opcionais do cliente (e-mail, endereço, CPF/CNPJ) ──
function camposExtrasCliente(pfx, c) {
  c = c || {};
  const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const aberto = c.email || c.endereco || c.documento;
  return `<details class="cli-extras"${aberto ? ' open' : ''}>
    <summary>+ Mais dados (opcional)</summary>
    <label for="${pfx}-end">Endereço do serviço</label>
    <input id="${pfx}-end" maxlength="200" autocomplete="street-address" placeholder="Rua, número, bairro, cidade" value="${esc(c.endereco)}"/>
    <label for="${pfx}-email">E-mail</label>
    <input id="${pfx}-email" type="email" inputmode="email" maxlength="120" placeholder="cliente@email.com" value="${esc(c.email)}"/>
    <label for="${pfx}-doc">CPF ou CNPJ</label>
    <input id="${pfx}-doc" inputmode="numeric" maxlength="18" placeholder="Só se precisar no contrato ou na nota" value="${esc(c.documento)}"/>
    <p class="muted cli-extras-dica">Se preencher, o endereço e o CPF/CNPJ aparecem no PDF.</p>
  </details>`;
}
function lerExtrasCliente(pfx) {
  const v = id => { const el = document.getElementById(`${pfx}-${id}`); return el ? el.value : undefined; };
  return { endereco: v('end'), email: v('email'), documento: v('doc') };
}

// ─── Editar cliente (janela) ──────────────────────────────────
// abrirEditarCliente({id,nome,telefone}, clienteSalvo => {...})
function abrirEditarCliente(c, aoSalvar) {
  const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const fundo = document.createElement('div');
  fundo.className = 'ec-fundo'; fundo.setAttribute('role', 'dialog'); fundo.setAttribute('aria-modal', 'true'); fundo.setAttribute('aria-label', 'Editar cliente');
  fundo.innerHTML = `<div class="ec-folha">
    <h2>${ic('lapis',22)} Editar cliente</h2>
    <label for="ec-nome">Nome</label>
    <input id="ec-nome" maxlength="100" value="${esc(c.nome)}" autocomplete="off"/>
    <label for="ec-tel">Telefone (WhatsApp)</label>
    <input id="ec-tel" type="tel" inputmode="tel" value="${esc(c.telefone)}"/>
    ${camposExtrasCliente('ec', c)}
    <p class="muted ec-dica">Os orçamentos deste cliente passam a usar os dados novos.</p>
    <p id="ec-msg" class="error" role="alert"></p>
    <div class="ec-btns">
      <button type="button" class="btn-outline" data-ec="cancelar">Cancelar</button>
      <button type="button" class="btn-primary btn-gold" data-ec="salvar">Salvar</button>
    </div></div>`;
  const fechar = () => { fundo.remove(); document.removeEventListener('keydown', tecla); };
  const tecla = e => { if (e.key === 'Escape') fechar(); };
  document.addEventListener('keydown', tecla);
  fundo.addEventListener('click', async e => {
    if (e.target === fundo || e.target.dataset.ec === 'cancelar') return fechar();
    if (e.target.dataset.ec !== 'salvar') return;
    const btn = e.target, msg = fundo.querySelector('#ec-msg');
    msg.textContent = ''; btn.disabled = true; btn.textContent = 'Salvando…';
    try {
      const novo = await api(`/api/clients/${c.id}`, { method: 'PUT', body: { nome: fundo.querySelector('#ec-nome').value, telefone: fundo.querySelector('#ec-tel').value, ...lerExtrasCliente('ec') } });
      fechar(); aoSalvar && aoSalvar(novo);
    } catch (err) { msg.textContent = err.message; btn.disabled = false; btn.textContent = 'Salvar'; }
  });
  document.body.appendChild(fundo);
  fundo.querySelector('#ec-nome').focus();
}
