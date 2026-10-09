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
  const links = [
    ['dashboard.html', 'Início'],
    ['radar.html', 'Radar'],
    ['historico.html', 'Histórico'],
    ['pacotes.html', 'Pacotes'],
  ];
  return `<nav class="topbar">
    <a class="topbar-logo" href="dashboard.html">VUN<span>BY</span></a>
    <div class="topbar-nav">
      ${links.map(([href, label]) => `<a href="${href}" class="${href === active ? 'active' : ''}">${label}</a>`).join('')}
      <button id="btn-logout">Sair</button>
    </div>
  </nav>`;
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
