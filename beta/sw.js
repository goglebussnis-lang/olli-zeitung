/* Oli Beta – Offline-Speicher (eigene Caches, die der normalen App bleiben unberührt) */
const APP = 'olli-beta-app-v1', TILES = 'olli-beta-tiles-v1';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'maplibre-gl.js', 'maplibre-gl.css', 'manifest.json', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(APP).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('olli-beta-') && k !== APP && k !== TILES).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
let puts = 0;
async function trim() { const c = await caches.open(TILES); const ks = await c.keys(); if (ks.length > 6000) for (const k of ks.slice(0, ks.length - 5000)) await c.delete(k); }
const fromNet = (req, cacheName) => fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(cacheName).then(c => c.put(req, cp)); } return r; });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.origin === location.origin) {
    // App-Dateien: erst Netz (für Updates), sonst Speicher
    e.respondWith(fromNet(e.request, APP).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
    return;
  }
  const tile = /tile\.openstreetmap\.org|arcgisonline\.com/.test(u.host) || (/openfreemap\.org/.test(u.host) && /\.(pbf|png|webp|jpg)$/.test(u.pathname));
  if (tile) {
    // Kartenstücke + Schriften: aus dem Speicher, sonst laden und merken
    e.respondWith(caches.open(TILES).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok || r.type === 'opaque') { c.put(e.request, r.clone()); if (++puts % 200 === 0) trim(); } return r; }))));
    return;
  }
  if (/openfreemap\.org/.test(u.host)) {
    // Kartenstil: erst Netz, ohne Netz der gemerkte
    e.respondWith(fromNet(e.request, TILES).catch(() => caches.match(e.request)));
  }
});
