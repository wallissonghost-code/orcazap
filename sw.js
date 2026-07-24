const CACHE = 'orcazap-v9';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app-core.js',
  '/app-views.js',
  '/app-events.js',
  '/app-quotes.js',
  '/app-pdf.js',
  '/pdf-fix.js?v=7',
  '/pdf-luxury.js?v=9',
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
  event.respondWith(fetch(event.request).then(response => {
    const clone = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, clone));
    return response;
  }).catch(() => caches.match(event.request).then(hit => hit || caches.match('/'))));
});