const CACHE = 'orcazap-v14';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css?v=12',
  '/whatsapp.css?v=3',
  '/app-core.js?v=12',
  '/app-views.js?v=12',
  '/app-events.js?v=12',
  '/app-quotes.js?v=12',
  '/app-pdf.js?v=12',
  '/pdf-fix.js?v=7',
  '/pdf-luxury.js?v=9',
  '/app-whatsapp.js?v=4',
  '/app-update.js?v=14',
  '/icon.svg',
  '/manifest.webmanifest'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request).then(hit => hit || caches.match('/')))
  );
});