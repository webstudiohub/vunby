/* VUNBY Service Worker — cacheia só o casco estático */
const CACHE = 'vunby-v1';
const STATIC = [
  '/', '/entrar', '/cadastro',
  '/style.css', '/app.js',
  '/dashboard.html', '/radar.html', '/historico.html',
  '/pacotes.html', '/novo-orcamento.html',
  '/manifest.json',
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
  // NUNCA cacheia /api/
  if (url.pathname.startsWith('/api/')) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
