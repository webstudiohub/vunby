/* VUNBY — app.js (prestador) */
'use strict';

// ─── API helper ───────────────────────────────────────────────
async function api(path, { method = 'GET', body } = {}) {
  const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

// ─── Sessão ───────────────────────────────────────────────────
async function requireSession() {
  try {
    return await api('/api/auth/me');
  } catch {
    window.location.href = '/entrar';
    return null;
  }
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
function topbar(active) {
  return `<nav class="topbar">
    <a class="topbar-logo" href="dashboard.html">VUN<span>BY</span></a>
    <button id="btn-logout">Sair</button>
  </nav>`;
}

// ─── Bottom Nav (mobile) ──────────────────────────────────────
const NAV_ICONS = {
  home: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>`,
  radar: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><line x1="12" y1="2" x2="12" y2="6"/></svg>`,
  historico: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="8" y2="14"/><line x1="12" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="8" y2="18"/><line x1="12" y1="18" x2="16" y2="18"/></svg>`,
  pacotes: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
  plus: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
};

function bottomNav(active) {
  const items = [
    ['dashboard.html', 'home',     'Início'],
    ['radar.html',     'radar',    'Radar'],
    ['historico.html', 'historico','Histórico'],
    ['pacotes.html',   'pacotes',  'Pacotes'],
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
