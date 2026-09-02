/* Blacktop Blitz — Service Worker (network-first, no cache) */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  // Wipe ALL old caches so phones always get fresh files
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))));
  self.clients.claim();
});
// Always go to network — never serve stale cached files
self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request));
});
