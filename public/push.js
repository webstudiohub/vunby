/* VUNBY — ativar notificações no aparelho (Web Push) */
(function () {
  function b64uParaBytes(s) {
    const pad = '='.repeat((4 - (s.length % 4)) % 4);
    const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  }
  const suportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const ehIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
  const instalado = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  async function estado() {
    if (!suportado()) return ehIphone() && !instalado() ? 'iphone-instalar' : 'sem-suporte';
    if (Notification.permission === 'denied') return 'negado';
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub && Notification.permission === 'granted' ? 'ativo' : 'inativo';
  }

  async function ativar() {
    const st = await api('/api/push/status');
    if (!st.disponivel || !st.chave) throw new Error('Notificações ainda não estão disponíveis.');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Você não permitiu as notificações.');
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uParaBytes(st.chave) });
    await api('/api/push/inscrever', { method: 'POST', body: sub.toJSON() });
    await api('/api/push/teste', { method: 'POST' }).catch(() => {});
  }

  async function desativar() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await api('/api/push/cancelar', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {}); await sub.unsubscribe(); }
  }

  // Desenha o cartão "Notificações" dentro de um elemento
  async function itemConta(el) {
    if (!el) return;
    async function desenhar() {
      const st = await estado();
      if (st === 'ativo') {
        el.innerHTML = '<p><strong>Ativadas <span style="color:var(--green)">' + ic('ok', 18) + '</span></strong> neste aparelho.</p><button class="btn-outline btn-sm" id="np-off" style="margin-top:var(--sp-3)">Desativar</button>';
        el.querySelector('#np-off').onclick = async () => { await desativar(); desenhar(); };
      } else if (st === 'inativo') {
        el.innerHTML = '<p class="muted">Receba um aviso no celular quando um cliente abrir ou aprovar seu orçamento.</p><button class="btn-primary btn-sm" id="np-on" style="margin-top:var(--sp-3)">Ativar notificações</button><div id="np-msg" class="error"></div>';
        el.querySelector('#np-on').onclick = async (ev) => {
          ev.target.disabled = true;
          try { await ativar(); VUI.toast('Notificações ativadas!', 'ok'); } catch (e) { el.querySelector('#np-msg').textContent = e.message; }
          desenhar();
        };
      } else if (st === 'negado') {
        el.innerHTML = '<p class="muted">As notificações estão bloqueadas neste aparelho. Libere em <strong>Configurações do navegador → Notificações → vunby.com.br</strong> e volte aqui.</p>';
      } else if (st === 'iphone-instalar') {
        el.innerHTML = '<p class="muted">No iPhone, primeiro <strong>instale o VUNBY na tela inicial</strong> (Safari → Compartilhar → Adicionar à Tela de Início). Depois abra o app e ative aqui.</p>';
      } else {
        el.innerHTML = '<p class="muted">Este aparelho ou navegador não aceita notificações.</p>';
      }
    }
    desenhar();
  }

  window.VunbyPush = { estado, ativar, desativar, itemConta, suportado };
})();
