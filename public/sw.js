/* VUNBY Service Worker — versão atualizada a cada deploy */
const CACHE = 'vunby-v27';
const STATIC = [
  '/', '/entrar', '/cadastro',
  '/style.css', '/app.js',
  '/dashboard.html', '/radar.html', '/historico.html',
  '/pacotes.html', '/novo-orcamento.html',
  '/conta.html', '/configurar-empresa.html', '/marca.js', '/pdf.js', '/calc.js', '/itens-editor.js', '/montar-tabela.js', '/kits.js', '/tabela.html', '/manifest.json', '/icons/icon-192.png',
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
