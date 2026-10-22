/* VUNBY Service Worker — versão atualizada a cada deploy */
const CACHE = 'vunby-v43';
const STATIC = [
  '/', '/entrar', '/cadastro',
  '/style.css', '/ui.js', '/app.js', '/instalar.js', '/push.js',
  '/dashboard.html', '/radar.html', '/historico.html',
  '/pacotes.html', '/novo-orcamento.html',
  '/conta.html', '/configurar-empresa.html', '/marca.js', '/pdf.js', '/imagem.js', '/calc.js', '/itens-editor.js', '/montar-tabela.js', '/kits.js', '/tabela.html', '/manifest.json', '/icons/icon-192.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/')) return;
  // Network-first para HTML (sempre pega versão mais recente)
  if (e.request.destination === 'document') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }
  // Assets: responde do cache (rápido) e atualiza o cache em segundo plano,
  // assim uma nova versão do app.js/style.css chega sozinha no próximo acesso
  e.respondWith(
    caches.open(CACHE).then(cache => cache.match(e.request).then(cached => {
      const rede = fetch(e.request).then(resp => {
        if (resp && resp.ok && e.request.method === 'GET') cache.put(e.request, resp.clone());
        return resp;
      }).catch(() => cached);
      return cached || rede;
    }))
  );
});


// ── Notificações push ──────────────────────────────────────────
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { titulo: 'VUNBY', texto: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'VUNBY', {
    body: d.texto || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/favicon-32.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || '/dashboard.html' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const alvo = new URL((e.notification.data && e.notification.data.url) || '/dashboard.html', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(lista => {
    for (const c of lista) { if ('focus' in c) { c.navigate(alvo).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(alvo);
  }));
});
