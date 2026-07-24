const CACHE = 'orcazap-v11';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/whatsapp.css?v=2',
  '/app-core.js',
  '/app-views.js',
  '/app-events.js',
  '/app-quotes.js',
  '/app-pdf.js',
  '/pdf-fix.js?v=7',
  '/pdf-luxury.js?v=9',
  '/app-whatsapp.js?v=1',
  '/icon.svg',
  '/manifest.webmanifest'
];
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).then(response => {
    const clone = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, clone));
    return response;
  }).catch(() => caches.match(event.request).then(hit => hit || caches.match('/'))));
});