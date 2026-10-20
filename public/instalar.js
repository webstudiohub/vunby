/* VUNBY — "Instale o app no seu celular".
   Android/Chrome: usa o pedido de instalação do navegador (1 toque).
   iPhone/iPad: o Safari não tem botão, então mostramos o passo a passo.
   Quem já abriu pelo app instalado não vê nada. */
'use strict';

(function () {
  const CHAVE_FECHADO = 'vunby_instalar_fechado';
  let pedido = null; // evento beforeinstallprompt guardado

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    pedido = e;
    document.querySelectorAll('[data-instalar-btn]').forEach(b => { b.textContent = 'Instalar agora'; });
  });
  window.addEventListener('appinstalled', () => {
    pedido = null;
    try { localStorage.setItem(CHAVE_FECHADO, '1'); } catch (e) { /* ignora */ }
    document.querySelectorAll('[data-instalar-banner]').forEach(el => el.remove());
    fecharModal();
  });

  function instalado() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }
  function ehIOS() {
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function ehSafariIOS() {
    const ua = navigator.userAgent || '';
    return ehIOS() && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  }
  function fechado() {
    try { return localStorage.getItem(CHAVE_FECHADO) === '1'; } catch (e) { return false; }
  }

  const ICONE_COMPARTILHAR = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
  const ICONE_MAIS = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';
  const ICONE_MENU = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';

  function passo(n, html) {
    return `<li style="display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-bottom:1px solid var(--gray2)">
      <span style="flex-shrink:0;width:30px;height:30px;border-radius:9px;background:var(--chrome-blue);color:#fff;font-weight:800;display:grid;place-items:center">${n}</span>
      <span style="font-size:var(--fs-md);line-height:1.45;padding-top:3px">${html}</span></li>`;
  }
  function chip(icone, texto) {
    return `<span style="display:inline-flex;align-items:center;gap:6px;background:var(--navy-light);color:var(--navy);font-weight:700;padding:3px 9px;border-radius:8px;vertical-align:middle">${icone}${texto}</span>`;
  }

  function conteudoPassos() {
    if (ehIOS()) {
      const aviso = ehSafariIOS() ? '' :
        `<p style="background:#FFF7E0;border-radius:10px;padding:10px 12px;margin-bottom:8px;font-size:var(--fs-sm)">No iPhone, a instalação só funciona pelo <strong>Safari</strong>. Abra <strong>vunby.com.br</strong> no Safari e siga os passos.</p>`;
      return aviso + `<ol style="list-style:none;margin:0;padding:0">
        ${passo(1, `Toque no botão ${chip(ICONE_COMPARTILHAR, 'Compartilhar')} na barra de baixo do Safari.`)}
        ${passo(2, `Role a lista e toque em ${chip(ICONE_MAIS, 'Adicionar à Tela de Início')}.`)}
        ${passo(3, `Toque em <strong>Adicionar</strong>, no canto de cima.`)}
        ${passo(4, `Pronto! O ícone do <strong>VUNBY</strong> aparece na tela do celular, como um aplicativo.`)}
      </ol>`;
    }
    return `<ol style="list-style:none;margin:0;padding:0">
      ${passo(1, `Toque nos ${chip(ICONE_MENU, '3 pontinhos')} no canto de cima do Chrome.`)}
      ${passo(2, `Toque em <strong>Instalar app</strong> (ou <strong>Adicionar à tela inicial</strong>).`)}
      ${passo(3, `Confirme em <strong>Instalar</strong>.`)}
      ${passo(4, `Pronto! O ícone do <strong>VUNBY</strong> aparece na tela do celular, como um aplicativo.`)}
    </ol>`;
  }

  function fecharModal() {
    const m = document.getElementById('instalar-modal');
    if (m) m.remove();
  }

  function abrirModal() {
    fecharModal();
    const m = document.createElement('div');
    m.id = 'instalar-modal';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.setAttribute('aria-label', 'Como instalar o VUNBY');
    m.style.cssText = 'position:fixed;inset:0;z-index:1000;background:rgba(7,27,77,.6);display:flex;align-items:flex-end;justify-content:center;padding:16px';
    m.innerHTML = `<div style="background:#fff;border-radius:20px;max-width:440px;width:100%;max-height:90dvh;overflow:auto;padding:22px 20px calc(20px + env(safe-area-inset-bottom));box-shadow:0 20px 60px rgba(0,0,0,.35)">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">
          <img src="/icons/icon-192.png" alt="" width="48" height="48" style="border-radius:12px"/>
          <div><div style="font-size:var(--fs-lg);font-weight:800">Instale o VUNBY</div>
          <div class="muted" style="font-size:var(--fs-sm)">Grátis, sem loja de aplicativos</div></div>
        </div>
        ${conteudoPassos()}
        <button type="button" class="btn-primary" style="margin-top:16px" data-fechar>Entendi</button>
      </div>`;
    m.addEventListener('click', (e) => { if (e.target === m || e.target.hasAttribute('data-fechar')) fecharModal(); });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { fecharModal(); document.removeEventListener('keydown', esc); } });
    document.body.appendChild(m);
    const b = m.querySelector('[data-fechar]'); if (b) b.focus();
  }

  async function instalar() {
    if (pedido) {
      pedido.prompt();
      try { await pedido.userChoice; } catch (e) { /* ignora */ }
      pedido = null;
      return;
    }
    abrirModal();
  }

  // Banner no painel. Some se já instalou ou se a pessoa fechou.
  function banner(alvo) {
    if (!alvo || instalado() || fechado()) return;
    alvo.innerHTML = `<div class="card" data-instalar-banner style="border:1.5px solid var(--gold);background:linear-gradient(180deg,#FFFBEA,#fff)">
        <div style="display:flex;align-items:center;gap:12px">
          <img src="/icons/icon-192.png" alt="" width="44" height="44" style="border-radius:11px;flex-shrink:0"/>
          <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:var(--fs-md)">📲 Instale o VUNBY no celular</div>
            <div class="muted" style="font-size:var(--fs-sm)">Abra com 1 toque, como um aplicativo.</div>
          </div>
          <button type="button" data-instalar-fechar aria-label="Fechar aviso" style="flex-shrink:0;border:none;background:transparent;font-size:24px;color:var(--muted);cursor:pointer;width:40px;height:40px;align-self:flex-start">×</button>
        </div>
        <button type="button" data-instalar-btn style="margin-top:12px;width:100%;border:none;border-radius:10px;padding:12px 14px;font-weight:800;font-family:inherit;font-size:var(--fs-md);background:var(--chrome-gold);color:#1C1C1E;cursor:pointer;min-height:48px">${pedido ? 'Instalar agora' : 'Como instalar'}</button>
      </div>`;
    alvo.querySelector('[data-instalar-btn]').addEventListener('click', instalar);
    alvo.querySelector('[data-instalar-fechar]').addEventListener('click', () => {
      try { localStorage.setItem(CHAVE_FECHADO, '1'); } catch (e) { /* ignora */ }
      alvo.innerHTML = '';
    });
  }

  // Item fixo na tela Conta (aparece mesmo se a pessoa fechou o banner).
  function itemConta(alvo) {
    if (!alvo) return;
    if (instalado()) {
      alvo.innerHTML = `<p class="muted">✅ Você já está usando o VUNBY instalado no celular.</p>`;
      return;
    }
    alvo.innerHTML = `<p class="muted" style="margin-bottom:var(--sp-3)">Coloque o VUNBY na tela inicial e abra com 1 toque, como um aplicativo. É grátis e não precisa de loja.</p>
      <button type="button" class="btn-primary" data-instalar-btn>${pedido ? 'Instalar agora' : 'Ver como instalar'}</button>`;
    alvo.querySelector('[data-instalar-btn]').addEventListener('click', instalar);
  }

  window.VunbyInstalar = { banner, itemConta, instalar, abrirModal, instalado };
})();
