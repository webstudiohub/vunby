/* VUNBY Service Worker — versão atualizada a cada deploy */
const CACHE = 'vunby-v4';
const STATIC = [
  '/', '/entrar', '/cadastro',
  '/style.css', '/app.js',
  '/dashboard.html', '/radar.html', '/historico.html',
  '/pacotes.html', '/novo-orcamento.html',
  '/conta.html', '/manifest.json',
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
  // Cache-first para assets estáticos
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
