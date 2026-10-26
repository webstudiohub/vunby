/* VUNBY — interface comum: ícones de linha (no lugar de emojis),
   avisos que somem sozinhos (toast) e janela própria de confirmação
   (no lugar do alert/confirm do navegador). */
'use strict';

(function (raiz) {
  // Ícones 24x24, traço 2 (estilo "linha"). Um nome por linha: nome: 'conteúdo do <svg>'.
  const ICONES = {
    calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    presente: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    conversa: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    lista: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h6"/>',
    lapis: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    celular: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
    ok: '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
    empresa: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
    documento: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
    busca: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    alerta: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    regua: '<path d="M21.3 15.3 8.7 2.7a1 1 0 0 0-1.4 0L2.7 7.3a1 1 0 0 0 0 1.4l12.6 12.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4z"/><path d="m7.5 10.5 2-2M10.5 13.5l2-2M13.5 16.5l2-2"/>',
    whatsapp: '<path d="M3 21l1.6-4.7A8.5 8.5 0 1 1 7.7 19.4z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1.5-1.5-2-1-1 1a4 4 0 0 1-2.5-2.5l1-1-1-2z"/>',
    coracao: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    estrela: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    festa: '<path d="M5.8 11.3 2 22l10.7-3.8"/><path d="M4 3h.01M22 8h.01M15 2h.01M22 20h.01M22 2l-2.2.7a3 3 0 0 0-2 3.3c.1.7-.4 1.4-1.2 1.5-.7.1-1.2.7-1.3 1.4L15 10M22 13l-.8-.3a2.5 2.5 0 0 0-2.8.8c-.4.5-1.1.7-1.7.4l-.7-.3"/><path d="M11 13c1.9 1.9 2.8 4.1 2 4.9s-3-.1-4.9-2-2.8-4.1-2-4.9 3 .1 4.9 2z"/>',
    joinha: '<path d="M7 10v12M15 5.9 14 10h5.8a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.4 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9z"/>',
    recusado: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
    nota: '<path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5z"/><path d="M15 3v6h6"/><path d="M8 13h8M8 17h5"/>',
    lixeira: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>',
    lampada: '<path d="M9 18h6M10 22h4"/><path d="M15.1 14c.2-1 .7-1.7 1.4-2.5A6 6 0 1 0 6 8c0 1.4.5 2.5 1.5 3.5.7.7 1.2 1.5 1.4 2.5"/>',
    email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    pessoa: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1"/><path d="M19 8v6M16 11h6"/>',
    foto: '<rect x="3" y="5" width="18" height="15" rx="2"/><circle cx="12" cy="12.5" r="3.5"/><path d="M8 5l1.5-2h5L16 5"/>',
    copiar: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    olho: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    alvo: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    sino: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    itens: '<path d="M10 6h11M10 12h11M10 18h11"/><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/>',
    preco: '<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    selo: '<path d="M3.9 8.6a2 2 0 0 1 1.2-2.5l1.4-.5a2 2 0 0 0 1.2-1.2l.5-1.4a2 2 0 0 1 2.5-1.2l1.3.6a2 2 0 0 0 1.7 0l1.3-.6a2 2 0 0 1 2.5 1.2l.5 1.4a2 2 0 0 0 1.2 1.2l1.4.5a2 2 0 0 1 1.2 2.5l-.6 1.3a2 2 0 0 0 0 1.7l.6 1.3a2 2 0 0 1-1.2 2.5l-1.4.5a2 2 0 0 0-1.2 1.2l-.5 1.4a2 2 0 0 1-2.5 1.2l-1.3-.6a2 2 0 0 0-1.7 0l-1.3.6a2 2 0 0 1-2.5-1.2l-.5-1.4a2 2 0 0 0-1.2-1.2l-1.4-.5a2 2 0 0 1-1.2-2.5l.6-1.3a2 2 0 0 0 0-1.7z"/><path d="m9 12 2 2 4-4"/>',
    caixa: '<path d="M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>',
    caminhao: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.7a1 1 0 0 0-.2-.6l-3.5-4.3A1 1 0 0 0 17.5 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
    chave: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
    raio: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
    floco: '<path d="M2 12h20M12 2v20M20 16l-4-4 4-4M4 8l4 4-4 4M16 4l-4 4-4-4M8 20l4-4 4 4"/>',
    pincel: '<rect x="2" y="2" width="16" height="6" rx="2"/><path d="M10 16v-2a2 2 0 0 1 2-2h8a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="8" y="16" width="4" height="6" rx="1"/>',
    tijolo: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M12 3v6M8 9v6M16 9v6M12 15v6"/>',
    gota: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5S5 13 5 15a7 7 0 0 0 7 7z"/>',
    brilho: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/>',
    folha: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z"/><path d="M2 21c0-3 1.9-5.4 5.2-6"/>',
    bolo: '<path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1M2 21h20M7 8v3M12 8v3M17 8v3M7 4h.01M12 4h.01M17 4h.01"/>',
    martelo: '<path d="m15 12-8.4 8.4a2.1 2.1 0 1 1-3-3L12 9"/><path d="M17.6 15 22 10.6M20.9 11.7l-1.3-1.3c-.6-.6-.9-1.4-.9-2.2v-.9l-2.3-2.3a5.5 5.5 0 0 0-3.9-1.6H9l.9.8A6.2 6.2 0 0 1 12 8.7v1.6l2 2h1c.8 0 1.6.3 2.1.9l1.4 1.4"/>',
    mais: '<path d="M12 5v14M5 12h14"/>',
    triste: '<circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2M9 9h.01M15 9h.01"/>',
    cerebro: '<path d="M12 5a3 3 0 1 0-6 .1 4 4 0 0 0-2.5 5.8 4 4 0 0 0 .6 6.6A4 4 0 1 0 12 18z"/><path d="M12 5a3 3 0 1 1 6 .1 4 4 0 0 1 2.5 5.8 4 4 0 0 1-.6 6.6A4 4 0 1 1 12 18z"/><path d="M12 5v13"/>',
    compartilhar: '<path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
    instagram: '<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
    fechar: '<path d="M18 6 6 18M6 6l12 12"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  };

  function ic(nome, tam, extra) {
    const p = ICONES[nome] || ICONES.info;
    const t = tam || 20;
    return `<svg class="ic${extra ? ' ' + extra : ''}" width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p}</svg>`;
  }

  // Troca <i data-ic="nome"></i> por ícone (para HTML fixo das páginas)
  function hidratar(raizEl) {
    (raizEl || document).querySelectorAll('i[data-ic]').forEach(el => {
      const span = document.createElement('span');
      span.innerHTML = ic(el.getAttribute('data-ic'), Number(el.getAttribute('data-tam')) || undefined);
      el.replaceWith(span.firstChild);
    });
  }

  // ── Estilos (uma vez) ──
  function estilos() {
    if (document.getElementById('vui-css')) return;
    const s = document.createElement('style');
    s.id = 'vui-css';
    s.textContent = `
.ic{display:inline-block;vertical-align:-0.2em;flex-shrink:0}
.vui-toasts{position:fixed;left:0;right:0;bottom:calc(var(--nav-h,64px) + 16px + env(safe-area-inset-bottom));z-index:2000;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;padding:0 16px}
.vui-toast{pointer-events:auto;max-width:440px;width:100%;background:#0F1923;color:#fff;border-radius:12px;padding:13px 16px;font-size:15px;font-weight:600;line-height:1.4;display:flex;gap:10px;align-items:flex-start;box-shadow:0 10px 30px rgba(0,0,0,.25);animation:vuiIn .2s ease-out}
.vui-toast .ic{margin-top:1px}
.vui-toast.ok .ic{color:#5BD392}.vui-toast.erro .ic{color:#FF8A80}.vui-toast.info .ic{color:#E4C677}
.vui-toast.sai{animation:vuiOut .2s ease-in forwards}
@keyframes vuiIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes vuiOut{to{opacity:0;transform:translateY(10px)}}
.vui-fundo{position:fixed;inset:0;z-index:2100;background:rgba(7,27,77,.55);display:flex;align-items:flex-end;justify-content:center;padding:16px;animation:vuiFade .15s ease-out}
@media(min-width:600px){.vui-fundo{align-items:center}}
@keyframes vuiFade{from{opacity:0}to{opacity:1}}
.vui-caixa{background:#fff;border-radius:18px;max-width:420px;width:100%;padding:22px 20px calc(18px + env(safe-area-inset-bottom));box-shadow:0 24px 60px rgba(0,0,0,.3);animation:vuiIn .2s ease-out}
.vui-caixa .vui-ic{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;margin-bottom:12px;background:#E6EEFB;color:#0F3A8C}
.vui-caixa.perigo .vui-ic{background:#FDECEA;color:#C0392B}
.vui-caixa h3{font-size:19px;font-weight:800;margin:0 0 6px}
.vui-caixa p{font-size:16px;color:#3A4550;line-height:1.5;margin:0 0 18px;white-space:pre-line}
.vui-botoes{display:flex;gap:10px;flex-direction:column-reverse}
@media(min-width:420px){.vui-botoes{flex-direction:row;justify-content:flex-end}}
.vui-botoes button{min-height:48px;border-radius:12px;padding:0 18px;font:inherit;font-weight:800;font-size:16px;cursor:pointer;border:1.5px solid transparent;flex:1}
.vui-nao{background:#fff;border-color:#CBD2DA!important;color:#0F1923}
.vui-sim{background:#0F3A8C;color:#fff}
.vui-caixa.perigo .vui-sim{background:#C0392B}
.vui-botoes button:focus-visible{outline:3px solid #E4C677;outline-offset:2px}
.vui-combo{position:relative}
.vui-combo .vui-cb-campo{position:relative}
.vui-combo .vui-cb-campo .ic{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:#5B6675;pointer-events:none}
.vui-combo input{padding-left:42px!important;padding-right:40px!important;margin:0!important;display:block;width:100%}
.vui-cb-limpar{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:36px;height:36px;border:none;background:transparent;color:#5B6675;cursor:pointer;border-radius:8px;display:grid;place-items:center}
.vui-cb-lista{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:50;background:#fff;border:1px solid #E4E8EE;border-radius:12px;box-shadow:0 14px 34px rgba(15,25,35,.14);max-height:280px;overflow:auto;padding:6px;margin:0;list-style:none}
.vui-cb-lista li{padding:11px 12px;border-radius:9px;cursor:pointer;font-size:16px;line-height:1.3}
.vui-cb-lista li small{display:block;color:#5B6675;font-size:14px}
.vui-cb-lista li[aria-selected="true"],.vui-cb-lista li:hover{background:#E6EEFB}
.vui-cb-lista .vui-cb-novo{color:#0F3A8C!important;font-weight:700;border-top:1px solid #E5E9F0}
.vui-cb-lista .vui-cb-vazio{color:#5B6675;cursor:default;background:none!important}
@media(prefers-reduced-motion:reduce){.vui-toast,.vui-caixa,.vui-fundo{animation:none}}
`;
    document.head.appendChild(s);
  }

  // ── Aviso que some sozinho ──
  function toast(msg, tipo) {
    estilos();
    tipo = tipo || 'ok';
    let box = document.querySelector('.vui-toasts');
    if (!box) { box = document.createElement('div'); box.className = 'vui-toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'vui-toast ' + tipo;
    t.innerHTML = ic(tipo === 'erro' ? 'alerta' : tipo === 'info' ? 'info' : 'ok', 20) + '<span></span>';
    t.querySelector('span').textContent = msg;
    box.appendChild(t);
    setTimeout(() => { t.classList.add('sai'); setTimeout(() => t.remove(), 220); }, tipo === 'erro' ? 5000 : 3200);
  }

  // ── Janela própria (Promise<boolean>) ──
  function janela({ titulo, texto, sim, nao, perigo, icone }) {
    estilos();
    return new Promise(resolve => {
      const ativo = document.activeElement;
      const f = document.createElement('div');
      f.className = 'vui-fundo';
      f.innerHTML = `<div class="vui-caixa${perigo ? ' perigo' : ''}" role="alertdialog" aria-modal="true" aria-labelledby="vui-t" aria-describedby="vui-p">
        <div class="vui-ic">${ic(icone || (perigo ? 'alerta' : 'info'), 22)}</div>
        <h3 id="vui-t"></h3><p id="vui-p"></p>
        <div class="vui-botoes">${nao === null ? '' : '<button type="button" class="vui-nao"></button>'}<button type="button" class="vui-sim"></button></div></div>`;
      f.querySelector('h3').textContent = titulo || '';
      f.querySelector('p').textContent = texto || '';
      f.querySelector('.vui-sim').textContent = sim || 'OK';
      const bNao = f.querySelector('.vui-nao'); if (bNao) bNao.textContent = nao || 'Cancelar';
      function fim(v) { document.removeEventListener('keydown', tecla); f.remove(); if (ativo && ativo.focus) ativo.focus(); resolve(v); }
      function tecla(e) { if (e.key === 'Escape') fim(false); }
      f.addEventListener('click', e => { if (e.target === f) fim(false); });
      f.querySelector('.vui-sim').addEventListener('click', () => fim(true));
      if (bNao) bNao.addEventListener('click', () => fim(false));
      document.addEventListener('keydown', tecla);
      document.body.appendChild(f);
      (bNao || f.querySelector('.vui-sim')).focus();
    });
  }
  function confirmar(texto, opc) {
    opc = opc || {};
    return janela({ titulo: opc.titulo || 'Tem certeza?', texto, sim: opc.sim || 'Confirmar', nao: opc.nao || 'Cancelar', perigo: !!opc.perigo, icone: opc.icone });
  }
  function avisar(texto, opc) {
    opc = opc || {};
    return janela({ titulo: opc.titulo || 'Atenção', texto, sim: opc.sim || 'Entendi', nao: null, icone: opc.icone || 'info' });
  }


  // ── Campo com busca no lugar de um <select> (o select continua existindo, escondido) ──
  function buscaSelect(sel, opc) {
    if (!sel || sel._vuiInput) return;
    estilos(); opc = opc || {};
    const box = document.createElement('div'); box.className = 'vui-combo';
    const lid = (sel.id || 'cb') + '-lista';
    box.innerHTML = `<div class="vui-cb-campo">${ic('busca', 18)}<input type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${lid}" autocomplete="off"/>
      <button type="button" class="vui-cb-limpar" aria-label="Limpar" hidden>${ic('fechar', 18)}</button></div>
      <ul class="vui-cb-lista" id="${lid}" role="listbox" hidden></ul>`;
    const inp = box.querySelector('input'), lista = box.querySelector('ul'), limpar = box.querySelector('.vui-cb-limpar');
    inp.placeholder = opc.placeholder || 'Digite para buscar…';
    sel.style.display = 'none'; sel.setAttribute('aria-hidden', 'true'); sel.tabIndex = -1;
    sel.after(box); sel._vuiInput = inp;
    let ativo = -1, filtrados = [];
    const opcoes = () => [...sel.options].filter(o => o.value !== '');
    const sem = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    function partes(t) { const i = t.indexOf(' — '); return i > 0 ? [t.slice(0, i), t.slice(i + 3)] : [t, '']; }
    function sync() {
      const o = sel.selectedOptions[0];
      inp.value = o && o.value ? partes(o.textContent)[0] : '';
      limpar.hidden = !inp.value;
    }
    function fechar() { lista.hidden = true; inp.setAttribute('aria-expanded', 'false'); ativo = -1; }
    function desenhar() {
      const q = sem(inp.value), o = sel.selectedOptions[0];
      const atual = o && o.value ? partes(o.textContent)[0] : null;
      filtrados = opcoes().filter(op => !q || (atual && inp.value === atual) || sem(op.textContent).includes(q) || sem(op.textContent).replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§'));
      const txtNovo = String(inp.value || '').trim();
      const podeNovo = opc.novo && txtNovo && !(atual && inp.value === atual) && !filtrados.some(op => sem(partes(op.textContent)[0]) === sem(txtNovo));
      lista.innerHTML = (filtrados.length ? filtrados.map((op, k) => { const [a, b] = partes(op.textContent);
        return `<li role="option" id="${lid}-${k}" aria-selected="${k === ativo}" data-k="${k}"></li>`; }).join('')
        : (podeNovo ? '' : `<li class="vui-cb-vazio" role="option" aria-disabled="true">${opcoes().length ? 'Nenhum cliente encontrado' : 'Nenhum cliente ainda'}</li>`))
        + (podeNovo ? `<li role="option" class="vui-cb-novo" data-novo="1"></li>` : '');
      if (podeNovo) lista.querySelector('[data-novo]').textContent = `+ Cadastrar “${txtNovo}” como novo cliente`;
      filtrados.forEach((op, k) => { const [a, b] = partes(op.textContent); const li = lista.children[k];
        li.textContent = a; if (b) { const sm = document.createElement('small'); sm.textContent = b; li.appendChild(sm); } });
      lista.hidden = false; inp.setAttribute('aria-expanded', 'true');
      if (ativo >= 0) inp.setAttribute('aria-activedescendant', `${lid}-${ativo}`); else inp.removeAttribute('aria-activedescendant');
    }
    function escolher(op) { sel.value = op.value; sel.dispatchEvent(new Event('change', { bubbles: true })); fechar(); }
    inp.addEventListener('focus', () => { inp.select(); desenhar(); });
    inp.addEventListener('input', () => { ativo = filtrados.length ? 0 : -1; limpar.hidden = !inp.value; desenhar(); ativo = filtrados.length ? 0 : -1; desenhar(); });
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (lista.hidden) desenhar(); ativo = Math.min(ativo + 1, filtrados.length - 1); desenhar(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); ativo = Math.max(ativo - 1, 0); desenhar(); }
      else if (e.key === 'Enter') { if (!lista.hidden && filtrados[ativo]) { e.preventDefault(); escolher(filtrados[ativo]); } }
      else if (e.key === 'Escape') { fechar(); sync(); }
    });
    lista.addEventListener('mousedown', e => e.preventDefault());
    lista.addEventListener('click', e => { if (e.target.closest('li[data-novo]')) { const t = inp.value.trim(); fechar(); opc.novo(t); return; } const li = e.target.closest('li[data-k]'); if (li) escolher(filtrados[Number(li.dataset.k)]); });
    inp.addEventListener('blur', () => setTimeout(() => { fechar(); sync(); }, 120));
    limpar.addEventListener('click', () => { sel.value = ''; sel.dispatchEvent(new Event('change', { bubbles: true })); inp.value = ''; limpar.hidden = true; inp.focus(); });
    sel.addEventListener('change', sync);
    new MutationObserver(sync).observe(sel, { childList: true });
    const d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    Object.defineProperty(sel, 'value', { configurable: true, get() { return d.get.call(this); }, set(v) { d.set.call(this, v); sync(); } });
    sync();
    return inp;
  }

  raiz.ic = ic;
  raiz.VUI = { ic, hidratar, toast, confirmar, avisar, buscaSelect, ICONES };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => hidratar());
    else hidratar();
  }
})(typeof window !== 'undefined' ? window : globalThis);
