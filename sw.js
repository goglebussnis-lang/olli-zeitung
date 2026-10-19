/* Oli Zeitung – Offline-Speicher */
const APP = 'olli-app-v16', TILES = 'olli-tiles-v2';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'leaflet.js', 'leaflet.css', 'manifest.json', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(APP).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== APP && k !== TILES).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
let puts = 0;
async function trim() { const c = await caches.open(TILES); const ks = await c.keys(); if (ks.length > 4000) for (const k of ks.slice(0, ks.length - 3500)) await c.delete(k); }
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.origin === location.origin) {
    // App-Dateien: erst Netz (für Updates), sonst Speicher
    e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(APP).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
    return;
  }
  if (/tile\.openstreetmap\.org|arcgisonline\.com/.test(u.host)) {
    // Kartenkacheln: aus dem Speicher, sonst laden und merken
    e.respondWith(caches.open(TILES).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok || r.type === 'opaque') { c.put(e.request, r.clone()); if (++puts % 200 === 0) trim(); } return r; }))));
  }
});
