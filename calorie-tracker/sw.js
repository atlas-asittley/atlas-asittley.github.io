const C = 'ct-v1';
const ASSETS = ['./', './index.html', './icon-192.png', './icon-512.png', './manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.hostname.indexOf('openfoodfacts.org') !== -1 || u.hostname.indexOf('supabase') !== -1) return; // network for APIs
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
    if (resp.ok && u.origin === location.origin) { const cp = resp.clone(); caches.open(C).then(c => c.put(e.request, cp)); }
    return resp;
  }).catch(() => caches.match('./index.html'))));
});
