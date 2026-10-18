/* Oli Zeitung – Austrage-App
   Alle Daten bleiben nur auf diesem Handy (localStorage). */
'use strict';

const VERSION = '2.3';
const KEY = 'olli.v1';
const TEST = /[?&]test\b/.test(location.search);
const API = {
  nominatim: 'https://nominatim.openstreetmap.org/search',
  photon: 'https://photon.komoot.io/api/',
  osrm: 'https://routing.openstreetmap.de/routed-bike',
  elev: 'https://api.open-meteo.com/v1/elevation',
  tiles: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  sat: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  satRoads: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
  satLabels: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
};
/* Suchgebiet ergibt sich nur aus deinen eigenen Daten (Startadresse + Stopps) */
function area() {
  const pts = [];
  const h = S && S.settings.home; if (h && h.lat != null) pts.push(h);
  const r = S && R(); if (r) r.stops.forEach(s => s.lat != null && pts.push(s));
  if (!pts.length) return null;
  const la = pts.map(p => p.lat), lo = pts.map(p => p.lon);
  const [a, b, c, d] = [Math.min(...lo) - .06, Math.max(...la) + .04, Math.max(...lo) + .06, Math.min(...la) - .04];
  return { lat: (b + d) / 2, lon: (a + c) / 2, viewbox: [a, b, c, d].map(v => v.toFixed(4)).join(',') };
}
const areaParams = () => { const a = area(); return a ? { viewbox: a.viewbox, bounded: 1 } : {}; };
const defaultCity = () => { const h = S.settings.home; if (h.city) return { zip: h.zip, city: h.city }; const st = S.routes.flatMap(r => r.stops).find(s => s.city); return st ? { zip: st.zip, city: st.city } : { zip: '', city: '' }; };
function parseAddr(v) {
  const m = v.match(/^(.*?)[,\s]+(\d{5})\s+(.+)$/);
  if (m) return { label: m[1].trim(), zip: m[2], city: m[3].trim() };
  const dc = defaultCity(); return { label: v.trim(), zip: dc.zip, city: dc.city };
}
const COLORS = ['#2970ff', '#8b5cf6', '#14b8a6', '#22a35a', '#f59e0b', '#e5484d', '#ec4899', '#64748b'];
const HILL = { 0: 0, 1: 3, 2: 8 }; // Sekunden Strafe pro Höhenmeter bergauf

/* ---------- Icons ---------- */
const I = (p, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const ic = {
  menu: I('<path d="M4 7h16M4 12h16M4 17h16"/>', 2.2),
  search: I('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  more: I('<circle cx="12" cy="5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/>'),
  layers: I('<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>'),
  locate: I('<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7.5"/>'),
  fit: I('<path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3"/><path d="m9 15 3-7 3 7M10 13h4"/>'),
  map: I('<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2Z"/><path d="M9 4v14M15 6v14"/>'),
  check: I('<path d="m5 12.5 4.5 4.5L19 7"/>', 2.6),
  play: I('<path d="M7 4.5v15l12.5-7.5Z" fill="currentColor"/>'),
  opt: I('<path d="M20 11a8 8 0 0 0-14.4-4.6L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.4 4.6L20 16"/><path d="M20 20v-4h-4"/>'),
  x: I('<path d="M6 6l12 12M18 6 6 18"/>'),
  help: I('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4v.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>'),
  gear: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>', 2.4),
  flag: I('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
  chev: I('<path d="m9 6 6 6-6 6"/>'),
  back: I('<path d="m15 6-6 6 6 6"/>'),
  trash: I('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  pin: I('<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  move: I('<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>'),
  user: I('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  note: I('<path d="M5 4h14v12l-4 4H5Z"/><path d="M15 20v-4h4M8 9h8M8 13h5"/>'),
  clock: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  timer: I('<circle cx="12" cy="13" r="8"/><path d="M12 9v4M10 2h4"/>'),
  sort: I('<path d="M4 6h16M4 12h10M4 18h5"/>', 2.4),
  vol: I('<path d="M4 9v6h4l5 4V5L8 9Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
  mute: I('<path d="M4 9v6h4l5 4V5L8 9Z"/><path d="m17 9 5 6M22 9l-5 6"/>'),
  pause: I('<path d="M8 5v14M16 5v14"/>', 3),
  undo: I('<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
  skip: I('<path d="m5 5 9 7-9 7Z"/><path d="M19 5v14"/>'),
  upload: I('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>'),
  download: I('<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v4h16v-4"/>'),
  edit: I('<path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>'),
  copy: I('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>'),
  mountain: I('<path d="m3 20 6.5-11 4 6.5 2.5-4L21 20Z"/>'),
  reverse: I('<path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/>'),
  reset: I('<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"/><path d="M4 4v4.6h4.6"/>'),
  lock: I('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  stop: I('<rect x="6" y="6" width="12" height="12" rx="2"/>'),
  home: I('<path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10"/>'),
  csv: I('<path d="M6 3h9l4 4v14H6Z"/><path d="M14 3v5h5M9 13h7M9 17h7"/>'),
  left: I('<path d="M18 19v-6a3 3 0 0 0-3-3H6M10 6l-4 4 4 4"/>', 2.6),
  right: I('<path d="M6 19v-6a3 3 0 0 1 3-3h9M14 6l4 4-4 4"/>', 2.6),
  straight: I('<path d="M12 20V4M7 9l5-5 5 5"/>', 2.6),
  uturn: I('<path d="M8 20V9a4 4 0 0 1 8 0v6M12 11l4 4 4-4"/>', 2.6),
  drive: I('<path d="M3.5 17a8.5 8.5 0 1 1 17 0"/><path d="m12 17 4.5-5"/><circle cx="12" cy="17" r="1.4" fill="currentColor"/><path d="M6.5 11.5 8 12.5M12 7v1.8M17.5 11.5 16 12.5"/>', 2.2),
  left2: I('<path d="M20 12H5M11 5l-7 7 7 7"/>', 2.8),
  right2: I('<path d="M4 12h15M13 5l7 7-7 7"/>', 2.8),
  round: I('<circle cx="12" cy="10" r="4"/><path d="M12 14v7M15 7l4-4M19 7V3h-4"/>', 2.4)
};

/* ---------- Hilfsfunktionen ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pad2 = n => String(n).padStart(2, '0');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function hav(a, b) {
  const R = 6371000, t = Math.PI / 180;
  const dLat = (b.lat - a.lat) * t, dLon = (b.lon - a.lon) * t;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function fmtDur(sec) {
  sec = Math.max(0, Math.round(sec / 60));
  if (sec < 60) return sec + ' min';
  return Math.floor(sec / 60) + ' h ' + pad2(sec % 60) + ' min';
}
const fmtKm = m => m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(1).replace('.', ',') + ' km';
const fmtTime = d => new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const fmtDate = d => new Date(d).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b);
function splitAddr(street) {
  const m = String(street).trim().match(/^(.*?)[\s,]+(\d+\s*[a-zA-Z]?(?:\s*[\/-]\s*\d+[a-zA-Z]?)?)$/);
  return m ? { str: m[1].trim(), hn: m[2].replace(/\s+/g, '') } : { str: String(street).trim(), hn: '' };
}

/* ---------- Speicher ---------- */
const DEFAULTS = {
  settings: {
    home: { label: '', zip: '', city: '', lat: null, lon: null, ele: null },
    returnHome: true, speed: 18, stopSec: 15, hill: 1, radius: 25,
    voiceNav: false, voiceName: true, vibrate: true, keepAwake: true, autoNext: false,
    driveMode: false, sat: false,
    theme: 'system', clickSound: true, autoDone: false, autoSec: 8, autoRad: 15,
    dayOn: true, dayNext: null, dayEvery: 14, remindWhen: 'before', remindTime: '18:00', remindText: 'Zeitung austragen 📰',
    backupOn: true, backupEvery: 14, backupDay: 0, backupTime: '19:00'
  },
  routes: [], activeId: null, run: null, pw: null, lastBackup: null, backupAsked: null, dayGreeted: null
};
let S;
function load() {
  try { S = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { S = {}; }
  S = Object.assign(structuredClone(DEFAULTS), S);
  S.settings = Object.assign(structuredClone(DEFAULTS.settings), S.settings || {});
}
let saveT;
function save(now) {
  clearTimeout(saveT);
  const f = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Speichern fehlgeschlagen – Speicher voll?'); } };
  now ? f() : (saveT = setTimeout(f, 150));
}
const R = () => S.routes.find(r => r.id === S.activeId) || null;
const stopsOrdered = r => {
  if (!r) return [];
  if (r.order && r.order.length === r.stops.length) {
    const m = new Map(r.stops.map(s => [s.id, s]));
    const out = r.order.map(id => m.get(id)).filter(Boolean);
    if (out.length === r.stops.length) return out;
  }
  return r.stops.slice();
};

/* ---------- Netzwerk ---------- */
async function getJSON(url, ms = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'Accept-Language': 'de' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { clearTimeout(t); }
}
let lastNomi = 0;
async function nomi(params) {
  const wait = (TEST ? 0 : 1100) - (Date.now() - lastNomi);
  if (wait > 0) await sleep(wait);
  lastNomi = Date.now();
  const q = new URLSearchParams(Object.assign({ format: 'jsonv2', addressdetails: 1, countrycodes: 'de', limit: 5 }, params));
  return getJSON(API.nominatim + '?' + q);
}
/* Adresse → Koordinaten. quality: exact | street | none */
async function geocode(street, zip, city) {
  const { str, hn } = splitAddr(street);
  const hnBase = hn.split(/[\/-]/)[0];
  const tries = [
    { street: `${hn} ${str}`.trim(), postalcode: zip, city },
    hnBase !== hn ? { street: `${hnBase} ${str}`.trim(), postalcode: zip, city } : null,
    { q: `${street}, ${zip} ${city}` },
    { q: `${str} ${hnBase}, ${city}` }
  ].filter(Boolean);
  for (const p of tries) {
    try {
      const res = await nomi(Object.assign(areaParams(), p));
      const hit = res.find(x => x.address && (x.address.house_number || '').replace(/\s/g, '').toLowerCase() === hn.toLowerCase())
        || res.find(x => x.address && x.address.house_number && x.address.house_number.split(/[\/-]/)[0] === hnBase)
        || null;
      if (hit) return { lat: +hit.lat, lon: +hit.lon, quality: 'exact' };
    } catch (e) { if (!navigator.onLine) throw e; }
  }
  // Photon als zweite Quelle
  try {
    const a = area();
    const res = await getJSON(`${API.photon}?q=${encodeURIComponent(street + ', ' + zip + ' ' + city)}${a ? `&lat=${a.lat}&lon=${a.lon}` : ''}&limit=5&lang=de`);
    const f = (res.features || []).find(f => (f.properties.housenumber || '').split(/[\/-]/)[0] === hnBase && (f.properties.postcode || zip) === zip);
    if (f) return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], quality: 'exact' };
  } catch (e) { }
  // nur Straße
  try {
    const res = await nomi(Object.assign(areaParams(), { street: str, postalcode: zip, city }));
    if (res[0]) return { lat: +res[0].lat, lon: +res[0].lon, quality: 'street' };
  } catch (e) { }
  return { lat: null, lon: null, quality: 'none' };
}
async function searchPlaces(q) {
  const dc = defaultCity(), a = area();
  const res = await nomi(Object.assign({ q: q + (/,|\d{5}/.test(q) || !dc.city ? '' : ', ' + dc.city), limit: 8 }, a ? { viewbox: a.viewbox, bounded: 0 } : {}));
  return res.map(x => {
    const a = x.address || {};
    const road = a.road || a.pedestrian || a.footway || x.name || '';
    const street = (road + (a.house_number ? ' ' + a.house_number : '')).trim() || x.display_name.split(',')[0];
    return { street, zip: a.postcode || '', city: a.city || a.town || a.village || '', sub: a.suburb || a.city_district || '', lat: +x.lat, lon: +x.lon, exact: !!a.house_number };
  });
}
async function elevations(pts) {
  const out = new Array(pts.length).fill(null);
  for (let i = 0; i < pts.length; i += 90) {
    const chunk = pts.slice(i, i + 90);
    const url = `${API.elev}?latitude=${chunk.map(p => p.lat.toFixed(5)).join(',')}&longitude=${chunk.map(p => p.lon.toFixed(5)).join(',')}`;
    const res = await getJSON(url);
    (res.elevation || []).forEach((e, k) => out[i + k] = e);
  }
  return out;
}
const coordStr = pts => pts.map(p => p.lon.toFixed(6) + ',' + p.lat.toFixed(6)).join(';');
async function osrmTable(pts) {
  const res = await getJSON(`${API.osrm}/table/v1/driving/${coordStr(pts)}?annotations=duration,distance`, 30000);
  if (res.code !== 'Ok') throw new Error(res.code);
  return { dur: res.durations, dist: res.distances };
}
async function osrmRoute(pts, steps = false) {
  const res = await getJSON(`${API.osrm}/route/v1/driving/${coordStr(pts)}?overview=full&geometries=geojson&steps=${steps}`, 20000);
  if (res.code !== 'Ok' || !res.routes[0]) throw new Error(res.code);
  return res.routes[0];
}
function fallbackTable(pts, speedMs) {
  const n = pts.length, dur = [], dist = [];
  for (let i = 0; i < n; i++) {
    dur.push([]); dist.push([]);
    for (let j = 0; j < n; j++) { const d = hav(pts[i], pts[j]) * 1.35; dist[i].push(d); dur[i].push(d / speedMs); }
  }
  return { dur, dist, approx: true };
}

/* ---------- Routen-Optimierung ---------- */
/* Pfad: start s → alle Knoten in M → Ende e (oder freies Ende) */
function solvePath(c, s, M, e, budgetMs = 1200) {
  const n = M.length;
  if (n <= 1) return M.slice();
  const cost = o => { let t = c[s][o[0]]; for (let i = 1; i < o.length; i++) t += c[o[i - 1]][o[i]]; if (e != null) t += c[o[o.length - 1]][e]; return t; };
  // Nächster Nachbar
  const nn = start => {
    const left = new Set(M), o = []; let cur = start;
    while (left.size) { let best = null, bv = Infinity; for (const j of left) if (c[cur][j] < bv) { bv = c[cur][j]; best = j; } o.push(best); left.delete(best); cur = best; }
    return o;
  };
  const local = o => {
    let best = cost(o), improved = true;
    while (improved) {
      improved = false;
      // 2-opt (umdrehen)
      for (let i = 0; i < n - 1; i++) for (let k = i + 1; k < n; k++) {
        const t = o.slice(0, i).concat(o.slice(i, k + 1).reverse(), o.slice(k + 1));
        const v = cost(t); if (v < best - 1e-6) { o = t; best = v; improved = true; }
      }
      // Or-opt (Stück verschieben)
      for (let len = 1; len <= 3; len++) for (let i = 0; i + len <= n; i++) {
        const seg = o.slice(i, i + len), rest = o.slice(0, i).concat(o.slice(i + len));
        for (let j = 0; j <= rest.length; j++) {
          if (j === i) continue;
          for (const sg of [seg, seg.slice().reverse()]) {
            const t = rest.slice(0, j).concat(sg, rest.slice(j));
            const v = cost(t); if (v < best - 1e-6) { o = t; best = v; improved = true; }
          }
        }
      }
    }
    return { o, v: best };
  };
  let cur = local(nn(s)), best = cur;
  const t0 = performance.now();
  // Iterierte lokale Suche (Double-Bridge-Störung)
  while (performance.now() - t0 < budgetMs && n >= 8) {
    const o = best.o.slice();
    const p = [1, 2, 3].map(() => 1 + Math.floor(Math.random() * (n - 2))).sort((a, b) => a - b);
    const t = o.slice(0, p[0]).concat(o.slice(p[2]), o.slice(p[1], p[2]), o.slice(p[0], p[1]));
    cur = local(t);
    if (cur.v < best.v - 1e-6) best = cur;
  }
  return best.o;
}

/* ---------- Karte ---------- */
let map, baseLayer, satLayer, satLabels, sat = false, routeLine, doneLine, legLine, markersLayer, homeMarker, meMarker, meAcc;
const markerById = new Map();
function initMap() {
  map = L.map('map', { zoomControl: false, attributionControl: true, tap: true }).setView([51.16, 10.45], 6);
  map.attributionControl.setPrefix('');
  baseLayer = L.tileLayer(API.tiles, { maxZoom: 20, maxNativeZoom: 19, attribution: '© OpenStreetMap-Mitwirkende' }).addTo(map);
  satLayer = L.tileLayer(API.sat, { maxZoom: 20, maxNativeZoom: 19, attribution: 'Esri, Maxar' });
  satLabels = L.layerGroup([L.tileLayer(API.satRoads, { maxZoom: 20, maxNativeZoom: 19, opacity: .8 }), L.tileLayer(API.satLabels, { maxZoom: 20, maxNativeZoom: 19 })]);
  markersLayer = L.layerGroup().addTo(map);
  map.on('dragstart', () => { follow = false; });
}
function applyTheme() {
  const t = S.settings.theme || 'system';
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = dark ? '#1a2130' : '#ffffff';
  const mp = $('#map'); if (mp) mp.classList.toggle('darkmap', dark && !sat);
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => S && applyTheme());
function setSat(on, quiet) {
  sat = on; applyTheme(); if (S.settings.sat !== on) { S.settings.sat = on; save(); }
  if (on) { map.removeLayer(baseLayer); satLayer.addTo(map); satLabels.addTo(map); }
  else { map.removeLayer(satLayer); map.removeLayer(satLabels); baseLayer.addTo(map); }
  $('#btnLayer').classList.toggle('on', on);
  if (quiet) return;
  const l = $('#satLabel'); l.textContent = on ? 'Satellit an' : 'Satellit aus'; l.classList.add('show');
  clearTimeout(l._t); l._t = setTimeout(() => l.classList.remove('show'), 1500);
}
function pinIcon(label, cls) {
  return L.divIcon({ className: '', html: `<div class="pin ${cls}">${label}</div>`, iconSize: [34, 42], iconAnchor: [17, 42] });
}
function drawMarkers() {
  markersLayer.clearLayers(); markerById.clear();
  const r = R(); const h = S.settings.home;
  if (h.lat != null) {
    homeMarker = L.marker([h.lat, h.lon], { icon: pinIcon(I('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>', 2.6).replace('<svg', '<svg width="16" height="16"'), 'home'), zIndexOffset: 500 })
      .bindTooltip('Start: ' + esc(h.label), { direction: 'top', offset: [0, -40] }).addTo(markersLayer);
  }
  if (!r) return;
  const list = stopsOrdered(r);
  const nextId = S.run && S.run.routeId === r.id ? nextStop()?.id : null;
  list.forEach((s, i) => {
    if (s.lat == null) return;
    const cls = [s.status === 'done' ? 'done' : '', s.status === 'skip' ? 'skip' : '', s.id === nextId ? 'next' : '', s.quality === 'street' ? 'warn' : ''].join(' ');
    const label = r.optimized ? (i + 1) : `<span class="dot" style="background:${s.color || COLORS[0]}"></span>`;
    const m = L.marker([s.lat, s.lon], { icon: pinIcon(label, cls), zIndexOffset: s.id === nextId ? 1000 : 0 }).addTo(markersLayer);
    if (!r.optimized && s.color && s.color !== COLORS[0]) m.getElement()?.querySelector('.pin')?.style.setProperty('border-color', s.color);
    m.on('click', () => { if (S.run && S.run.routeId === r.id) showArrive(s, true); else openStop(s.id); });
    markerById.set(s.id, m);
  });
}
function drawRouteLine() {
  [routeLine, doneLine].forEach(l => l && map.removeLayer(l));
  routeLine = doneLine = null;
  const r = R();
  if (!r || !r.optimized || !r.geom) return;
  routeLine = L.polyline(r.geom.map(p => [p[1], p[0]]), { color: '#2970ff', weight: 5, opacity: .75 }).addTo(map);
  routeLine.bringToBack();
}
function fitAll(pad = true) {
  const r = R(); const pts = [];
  if (r) r.stops.forEach(s => s.lat != null && pts.push([s.lat, s.lon]));
  const h = S.settings.home; if (h.lat != null) pts.push([h.lat, h.lon]);
  if (!pts.length) return pos ? map.setView([pos.lat, pos.lon], 15) : map.setView([51.16, 10.45], 6);
  const peek = sheetPeek();
  map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [40, 90], paddingBottomRight: [80, pad ? peek + 30 : 40], maxZoom: 17 });
}

/* ---------- GPS ---------- */
let pos = null, gpsSpeed = null, heading = null, watchId = null, follow = false;
function startGPS() {
  if (watchId != null || !navigator.geolocation) return;
  watchId = navigator.geolocation.watchPosition(p => {
    const c = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() };
    if (!acceptFix(c)) return;
    pos = c;
    gpsSpeed = p.coords.speed != null && !isNaN(p.coords.speed) ? p.coords.speed : null;
    if (p.coords.heading != null && !isNaN(p.coords.heading) && p.coords.speed > 0.8) heading = p.coords.heading;
    drawMe();
    if (S.run) onRunPosition();
  }, err => {
    if (err.code === 1) toast('Standort ist blockiert – bitte in Chrome erlauben');
  }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
}
/* GPS-Ausreißer (z. B. plötzlich viele km weg) ignorieren */
let jumpBuf = [];
function acceptFix(c) {
  if (c.acc > 150) return false;
  if (!pos) return true;
  const d = hav(pos, c), dt = Math.max(1, (c.t - pos.t) / 1000);
  if (d > 150 && d / dt > 35) {
    jumpBuf.push(c);
    const ok = jumpBuf.length >= 5 && jumpBuf.every(x => hav(x, c) < 80);
    if (!ok) { if (jumpBuf.length > 8) jumpBuf.shift(); return false; }
  }
  jumpBuf = [];
  return true;
}
function drawMe() {
  if (!pos) return;
  const html = `<div class="me-wrap">${heading != null ? `<div class="me-cone" style="transform:rotate(${heading - 30}deg)"></div>` : ''}<div class="me"></div></div>`;
  const icon = L.divIcon({ className: '', html, iconSize: [22, 22], iconAnchor: [11, 11] });
  if (!meMarker) { meMarker = L.marker([pos.lat, pos.lon], { icon, zIndexOffset: 2000, interactive: false }).addTo(map); meAcc = L.circle([pos.lat, pos.lon], { radius: pos.acc, weight: 0, fillColor: '#2970ff', fillOpacity: .08, interactive: false }).addTo(map); }
  else { meMarker.setLatLng([pos.lat, pos.lon]).setIcon(icon); meAcc.setLatLng([pos.lat, pos.lon]).setRadius(pos.acc); }
  if (follow) map.panTo([pos.lat, pos.lon], { animate: true });
}

/* ---------- Bottom Sheet ---------- */
const sheet = () => $('#sheet');
function sheetPeek() { return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--peek')) || 172; }
function setSheet(full) {
  if (full) arm();
  sheet().classList.toggle('full', full);
  sheet().style.transform = '';
  if (!full) { const i = $('#q'); if (i) { i.value = ''; i.blur(); } searchMode = false; renderList(); }
}
function initSheetDrag() {
  const el = sheet(); let y0 = null, t0 = 0, base = 0, moved = false;
  const start = e => { y0 = (e.touches ? e.touches[0] : e).clientY; t0 = Date.now(); moved = false; base = el.classList.contains('full') ? 0 : el.offsetHeight - sheetPeek(); el.classList.add('dragging'); };
  const move = e => {
    if (y0 == null) return; const y = (e.touches ? e.touches[0] : e).clientY; const dy = y - y0;
    if (Math.abs(dy) > 5) moved = true;
    el.style.transform = `translateY(${clamp(base + dy, 0, el.offsetHeight - sheetPeek())}px)`;
  };
  const end = e => {
    if (y0 == null) return; el.classList.remove('dragging');
    const y = (e.changedTouches ? e.changedTouches[0] : e).clientY; const dy = y - y0; const v = dy / Math.max(1, Date.now() - t0);
    y0 = null;
    if (!moved) { if (e.target.closest('button,input')) { el.style.transform = ''; return; } setSheet(!el.classList.contains('full')); return; }
    const full = v < -0.35 ? true : v > 0.35 ? false : (base + dy) < (el.offsetHeight - sheetPeek()) / 2;
    setSheet(full);
  };
  ['#sheetHandle', '#sheetHead'].forEach(s => {
    const h = $(s);
    h.addEventListener('touchstart', start, { passive: true });
    h.addEventListener('touchmove', move, { passive: true });
    h.addEventListener('touchend', end);
    h.addEventListener('mousedown', e => { if (e.target.closest('input')) return; start(e); const mm = ev => move(ev); const mu = ev => { end(ev); removeEventListener('mousemove', mm); removeEventListener('mouseup', mu); }; addEventListener('mousemove', mm); addEventListener('mouseup', mu); });
  });
}
let searchMode = false, searchT, searchSeq = 0;
function renderSheet() {
  const r = R();
  const n = r ? r.stops.length : 0;
  const info = r && r.optimized && r.plan ? `ca. ${fmtDur(r.plan.total)} · ${fmtKm(r.plan.dist)}${r.plan.returnHome ? ' · zurück zum Start' : ''}` : (n ? 'noch nicht optimiert' : '');
  $('#sheetHead').innerHTML = `
    <div class="head-row full-only">
      <div class="search"><span>${ic.search}</span><input id="q" placeholder="Stopps hinzufügen…" autocomplete="off" enterkeyhint="search"><button class="clear" id="qx" style="display:none">${ic.x}</button></div>
      <button class="icon-btn" id="moreBtn2" style="margin-bottom:6px">${ic.more}</button>
    </div>
    <div class="head-row">
      <div class="head-count"><b>${r ? esc(r.name) : 'Keine Route'}</b> · ${plural(n, 'Stopp', 'Stopps')}${r && r.stops.some(x => x.count > 1) ? ' · ' + r.stops.reduce((a, x) => a + (x.count || 1), 0) + ' Blätter' : ''}${info ? `<div class="head-sub">${info}</div>` : ''}</div>
      <button class="icon-btn peek-only" id="searchBtn">${ic.search}</button>
      <button class="icon-btn peek-only" id="moreBtn">${ic.more}</button>
    </div>`;
  const q = $('#q');
  q.addEventListener('input', () => {
    const v = q.value.trim(); $('#qx').style.display = v ? '' : 'none';
    clearTimeout(searchT);
    if (!v) { searchMode = false; renderList(); return; }
    searchMode = true; renderSearch(v, null);
    if (v.length >= 3) searchT = setTimeout(() => doSearch(v), 600);
  });
  q.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(searchT); doSearch(q.value.trim()); } });
  $('#qx').onclick = () => { q.value = ''; q.dispatchEvent(new Event('input')); q.focus(); };
  $('#searchBtn').onclick = () => { setSheet(true); setTimeout(() => $('#q').focus(), 280); };
  $('#moreBtn').onclick = e => routeMenu(e.currentTarget);
  $('#moreBtn2').onclick = e => routeMenu(e.currentTarget);
  renderList();
  renderFooter();
  updatePeek();
}
function updatePeek() {
  requestAnimationFrame(() => {
    const rows = $('#sheetHead').querySelectorAll('.head-row');
    const h = $('#sheetHandle').offsetHeight + (rows[1] ? rows[1].offsetHeight : 54) + $('#footer').offsetHeight + 6;
    document.documentElement.style.setProperty('--peek', h + 'px');
  });
}
function renderList() {
  if (searchMode) return;
  const r = R(), body = $('#sheetBody');
  if (!r) {
    body.innerHTML = `<div class="empty">${ic.map.replace('<svg', '<svg width="54" height="54" style="margin:0 auto;color:#2970ff"')}<h3>Noch keine Route</h3><button class="btn btn-p" id="eNew">${ic.plus} Route erstellen</button></div>`;
    $('#eNew').onclick = createRoute; return;
  }
  if (!r.stops.length) {
    body.innerHTML = `<div class="empty"><h3>Route ist leer</h3>
      <button class="btn btn-p" id="eCsv">${ic.csv} CSV-Datei laden</button><button class="btn btn-s" id="eSearch">${ic.search} Adresse suchen</button></div>`;
    $('#eCsv').onclick = importCSV; $('#eSearch').onclick = () => { setSheet(true); setTimeout(() => $('#q').focus(), 280); }; return;
  }
  const list = stopsOrdered(r);
  const bad = list.filter(s => s.quality !== 'exact').length;
  let html = '';
  if (bad) html += `<div class="note-box warn">${ic.pin.replace('<svg', '<svg width="20" height="20" style="display:inline;vertical-align:-4px"')} ${plural(bad, 'Adresse', 'Adressen')} ungenau – antippen und Position korrigieren.</div>`;
  html += `<div class="section-h">Stopps${r.optimized ? ' · optimierte Reihenfolge' : ''}</div>`;
  html += list.map((s, i) => {
    const sub = [(s.count > 1 ? `<span class="cnt">${s.count}×</span> ` : '') + esc(s.zip + ' ' + s.city), s.name ? `<span class="nm">${esc(s.name)}</span>` : '', s.quality === 'none' ? '<span class="warn">⚠ nicht gefunden</span>' : s.quality === 'street' ? '<span class="warn">⚠ ungenau</span>' : ''].filter(Boolean).join(' · ');
    const done = s.status === 'done';
    return `<div class="stop ${done ? 'done' : ''}" data-id="${s.id}"><div class="num">${r.optimized ? pad2(i + 1) : '–'}</div><div class="txt"><div class="a">${esc(s.street)}</div><div class="b">${sub}</div></div><div class="tag">${done ? ic.check : `<i style="background:${s.color || COLORS[0]}"></i>`}</div></div>`;
  }).join('');
  body.innerHTML = html;
  body.querySelectorAll('.stop').forEach(el => el.onclick = () => openStop(el.dataset.id));
}
function renderSearch(q, results) {
  const r = R(); const body = $('#sheetBody');
  const ql = q.toLowerCase();
  const own = r ? r.stops.filter(s => (s.street + ' ' + (s.name || '') + ' ' + (s.note || '')).toLowerCase().includes(ql)).slice(0, 20) : [];
  let html = '';
  if (own.length) {
    html += `<div class="section-h">In dieser Route</div>` + own.map(s => `<div class="res" data-own="${s.id}">${ic.pin}<div class="t"><b>${esc(s.street)}</b><small>${esc(s.name || s.zip + ' ' + s.city)}</small></div>${ic.chev.replace('<svg', '<svg style="width:20px;height:20px"')}</div>`).join('');
  }
  html += `<div class="section-h">Neue Adresse hinzufügen</div>`;
  if (results === null) html += `<div class="empty" style="padding:18px">${q.length < 3 ? 'Weiter tippen…' : 'Suche…'}</div>`;
  else if (results === 'err') html += `<div class="empty" style="padding:18px">Kein Internet</div>`;
  else if (!results.length) html += `<div class="empty" style="padding:18px">Nichts gefunden.</div>`;
  else html += results.map((x, i) => `<div class="res" data-i="${i}">${ic.search}<div class="t"><b>${esc(x.street)}</b><small>${esc([x.zip, x.city, x.sub].filter(Boolean).join(' '))}</small></div><span class="add">${ic.plus.replace('<svg', '<svg style="width:26px;height:26px;color:#2970ff"')}</span></div>`).join('');
  body.innerHTML = html;
  body.querySelectorAll('[data-own]').forEach(el => el.onclick = () => openStop(el.dataset.own));
  body.querySelectorAll('[data-i]').forEach(el => el.onclick = () => addFromSearch(results[+el.dataset.i]));
}
async function doSearch(q) {
  if (q.length < 3) return;
  const seq = ++searchSeq;
  try { const res = await searchPlaces(q); if (seq === searchSeq && searchMode) renderSearch(q, res); }
  catch (e) { if (seq === searchSeq && searchMode) renderSearch(q, 'err'); }
}
function addFromSearch(x) {
  let r = R(); if (!r) { r = newRoute('Meine Route'); }
  const s = { id: uid(), street: x.street, zip: x.zip || '', city: x.city || '', name: '', note: '', color: COLORS[0], lat: x.lat, lon: x.lon, quality: x.exact ? 'exact' : 'street', ele: null, pos: 'auto', status: 'open' };
  r.stops.push(s); invalidate(r); save();
  toast('Hinzugefügt: ' + x.street);
  const i = $('#q'); i.value = ''; i.dispatchEvent(new Event('input')); i.focus();
  drawMarkers(); renderSheet(); setSheet(true); setTimeout(() => $('#q') && $('#q').focus(), 50);
}
function invalidate(r) { r.optimized = false; r.order = null; r.plan = null; r.geom = null; r.matrix = null; drawRouteLine(); }
function renderFooter() {
  const r = R(); const f = $('#footer');
  const hasStops = S.routes.some(x => x.stops.length);
  f.innerHTML = `<button class="btn btn-o" id="bOpt" ${r && r.stops.length > 1 ? '' : 'disabled'}>${ic.opt}<span>${r && r.optimized ? 'Neu' : 'Optimieren'}</span></button>
    <button class="btn btn-p" id="bStart" ${hasStops ? '' : 'disabled'}>${ic.play} ${S.run ? 'Route fortsetzen' : 'Route starten'}</button>`;
  $('#bOpt').onclick = () => optimize(R(), true);
  $('#bStart').onclick = () => S.run ? resumeRun() : pickRoute();
}

/* ---------- Seiten / Dialoge ---------- */
function openPage(html, { sheetlike = false, onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.innerHTML = (sheetlike ? '<div class="page-scrim"></div>' : '') + `<div class="page ${sheetlike ? 'sheetlike' : ''}">${html}</div>`;
  $('#pages').appendChild(wrap);
  const close = () => { wrap.remove(); onClose && onClose(); };
  wrap.querySelector('.page-scrim')?.addEventListener('click', close);
  wrap.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
  arm();
  wrap._close = close;
  return { el: wrap.querySelector('.page'), close, wrap };
}
/* Zurück-Taste (Android): schließt das oberste Fenster statt die App */
let armed = false;
function arm() { if (!armed) { history.pushState({ olli: 1 }, ''); armed = true; } }
const anythingOpen = () => $('#pages').children.length || $('#drawer').classList.contains('show') || sheet().classList.contains('full') || !!arriveEl;
addEventListener('popstate', () => {
  armed = false;
  const pages = $('#pages').children;
  if (arriveEl) closeArrive();
  else if (driveEl) closeDrive();
  else if (pages.length) pages[pages.length - 1]._close();
  else if ($('#drawer').classList.contains('show')) closeDrawer();
  else if (sheet().classList.contains('full')) setSheet(false);
  if (anythingOpen() || document.body.classList.contains('nav')) arm();
});
function dialog({ title, text = '', input = null, buttons }) {
  return new Promise(res => {
    const w = document.createElement('div'); w.className = 'dlg-wrap';
    w.innerHTML = `<div class="dlg"><h2>${title}</h2>${text ? `<p>${text}</p>` : ''}${input ? `<input id="dlgIn" value="${esc(input.value || '')}" placeholder="${esc(input.placeholder || '')}" type="${input.type || 'text'}">` : ''}<div class="btns">${buttons.map((b, i) => `<button class="btn ${b.cls || 'btn-s'}" data-i="${i}">${b.label}</button>`).join('')}</div></div>`;
    document.body.appendChild(w);
    const inp = w.querySelector('#dlgIn'); if (inp) { setTimeout(() => { inp.focus(); inp.select(); }, 60); inp.onkeydown = e => { if (e.key === 'Enter') w.querySelector('[data-i="' + (buttons.length - 1) + '"]').click(); }; }
    w.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { const v = buttons[+b.dataset.i].value; w.remove(); res(inp ? (v === false ? null : inp.value.trim()) : v); });
    w.onclick = e => { if (e.target === w) { w.remove(); res(inp ? null : undefined); } };
  });
}
const confirmDlg = (title, text, ok = 'OK', cls = 'btn-p') => dialog({ title, text, buttons: [{ label: 'Abbrechen', value: false }, { label: ok, value: true, cls }] });
function busy(text) {
  const w = document.createElement('div'); w.className = 'dlg-wrap';
  w.innerHTML = `<div class="dlg"><h2 id="bT">${text}</h2><p id="bS" style="margin:0">Einen Moment…</p><div class="prog"><i id="bP"></i></div></div>`;
  document.body.appendChild(w);
  return { set(sub, p) { w.querySelector('#bS').textContent = sub; if (p != null) w.querySelector('#bP').style.width = Math.round(p * 100) + '%'; }, title(t) { w.querySelector('#bT').textContent = t; }, close() { w.remove(); } };
}
function popMenu(anchor, items) {
  const sc = document.createElement('div'); sc.className = 'menu-scrim';
  const m = document.createElement('div'); m.className = 'menu-pop';
  m.innerHTML = items.map((it, i) => `<button data-i="${i}" class="${it.red ? 'red' : ''}">${it.icon || ''}<span>${it.label}</span></button>`).join('');
  document.body.append(sc, m);
  const b = anchor.getBoundingClientRect();
  const h = m.offsetHeight, w = m.offsetWidth;
  let top = b.bottom + 6; if (top + h > innerHeight - 10) top = Math.max(10, b.top - h - 6);
  m.style.top = top + 'px'; m.style.left = clamp(b.right - w, 10, innerWidth - w - 10) + 'px';
  const close = () => { sc.remove(); m.remove(); };
  sc.onclick = close;
  m.querySelectorAll('button').forEach(btn => btn.onclick = () => { close(); items[+btn.dataset.i].do(); });
}
let toastT;
function toast(t, ms = 2600) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), ms); }

/* ---------- Seitenmenü ---------- */
function openDrawer() {
  const routes = S.routes.slice().sort((a, b) => b.created - a.created);
  $('#drawer').innerHTML = `
    <div class="dr-top"><div class="dr-icons"><button class="icon-btn" id="dSet">${ic.gear}</button></div>
      <div class="dr-user"><img src="icon-192.png" alt=""><div><h2>Oli Zeitung</h2><p>Kostenlos · für immer 😉</p></div></div></div>
    <div class="dr-list">${(() => { const d = S.settings.dayOn ? nextDeliveryDay() : null; return d ? `<div class="dr-day">📰 Austragetag ${dayIn(d)}</div>` : ''; })()}<div class="dr-h">Meine Routen</div>
      ${routes.length ? routes.map(r => `<div class="route-it ${r.id === S.activeId ? 'act' : ''}" data-id="${r.id}"><span class="d">${fmtDate(r.created)}</span><div class="n"><b>${esc(r.name)}</b><small>${plural(r.stops.length, 'Stopp', 'Stopps')}${r.plan ? ' · ' + fmtDur(r.plan.total) : ''}${r.history && r.history.length ? ' · ' + r.history.length + '× gefahren' : ''}</small></div><button class="icon-btn" data-m="${r.id}">${ic.more}</button></div>`).join('') : '<div class="empty" style="padding:12px">Noch keine Routen.</div>'}
    </div>
    <div class="dr-foot"><button class="btn btn-p" id="dNew">${ic.plus} Route erstellen</button></div>`;
  $('#drawer').classList.add('show'); $('#scrim').classList.add('show');
  arm();
  $('#dNew').onclick = () => { closeDrawer(); createRoute(); };
  $('#dSet').onclick = () => { closeDrawer(); openSettings(); };
  $('#drawer').querySelectorAll('.route-it').forEach(el => el.onclick = e => {
    if (e.target.closest('[data-m]')) return;
    selectRoute(el.dataset.id); closeDrawer();
  });
  $('#drawer').querySelectorAll('[data-m]').forEach(b => b.onclick = e => { e.stopPropagation(); routeItemMenu(b, b.dataset.m); });
}
function closeDrawer() { $('#drawer').classList.remove('show'); $('#scrim').classList.remove('show'); }
function selectRoute(id) { S.activeId = id; save(); drawMarkers(); drawRouteLine(); renderSheet(); fitAll(); }
function newRoute(name) {
  const r = { id: uid(), name, created: Date.now(), stops: [], order: null, optimized: false, plan: null, geom: null, history: [] };
  S.routes.push(r); S.activeId = r.id; save(); return r;
}
async function createRoute() {
  const name = await dialog({ title: 'Neue Route', input: { value: '', placeholder: 'Name' }, buttons: [{ label: 'Abbrechen', value: false }, { label: 'Erstellen', cls: 'btn-p', value: true }] });
  if (!name) return;
  newRoute(name); drawMarkers(); drawRouteLine(); renderSheet(); setSheet(false);
  const how = await dialog({ title: 'Adressen hinzufügen', buttons: [{ label: 'Einzeln suchen', value: 's' }, { label: 'CSV laden', value: 'c', cls: 'btn-p' }] });
  if (how === 'c') importCSV(); else if (how === 's') { setSheet(true); setTimeout(() => $('#q').focus(), 280); }
}
function routeInfo(r) {
  const L = learned(r), hist = r.history || [], last = hist[hist.length - 1];
  const sheets = r.stops.reduce((a, s) => a + (s.count || 1), 0);
  const row = (l, v) => `<div class="row"><div class="l">${l}</div><div class="v">${v}</div></div>`;
  openPage(`<div class="page-h"><span style="width:46px"></span><h1>${esc(r.name)}</h1><button class="icon-btn" data-close>${ic.x}</button></div>
  <div class="page-b set-page"><div class="set-card">
    ${row('Stopps', r.stops.length)}${row('Blätter', sheets)}
    ${row('Strecke', r.plan ? fmtKm(r.plan.dist) : '–')}${row('Höhenmeter', r.plan ? r.plan.up + ' m' : '–')}
    ${row('Geschätzte Dauer', r.plan ? fmtDur(r.plan.total) : '–')}
  </div><div class="set-card">
    ${row('Gefahrene Touren', hist.length)}
    ${row('Ø pro Briefkasten', Math.round(L.b) + ' s' + (L.n ? '' : ' (Start)'))}
    ${row('Ø Tempo', (S.settings.speed / L.a).toFixed(1).replace('.', ',') + ' km/h' + (L.n ? '' : ' (Start)'))}
    ${row('Gelernt aus', plural(L.n, 'Tour', 'Touren'))}
  </div>${last ? `<div class="set-card">
    ${row('Letzte Tour', fmtDate(last.date))}${row('Gebraucht', fmtDur(last.sec))}${last.planned ? row('Geschätzt', fmtDur(last.planned)) : ''}
  </div>` : ''}</div>`, { sheetlike: true });
}
function routeItemMenu(anchor, id) {
  const r = S.routes.find(x => x.id === id);
  popMenu(anchor, [
    { label: 'Info', icon: ic.help, do: () => { closeDrawer(); routeInfo(r); } },
    { label: 'Umbenennen', icon: ic.edit, do: async () => { const n = await dialog({ title: 'Umbenennen', input: { value: r.name }, buttons: [{ label: 'Abbrechen', value: false }, { label: 'Speichern', cls: 'btn-p', value: true }] }); if (n) { r.name = n; save(); openDrawer(); renderSheet(); } } },
    { label: 'Duplizieren', icon: ic.copy, do: () => { const c = structuredClone(r); c.id = uid(); c.name += ' (Kopie)'; c.created = Date.now(); c.history = []; c.stops.forEach(s => { const old = s.id; s.id = uid(); if (c.order) c.order = c.order.map(x => x === old ? s.id : x); s.status = 'open'; }); S.routes.push(c); save(); openDrawer(); } },
    { label: 'Als CSV exportieren', icon: ic.download, do: () => exportCSV(r) },
    { label: 'Löschen', icon: ic.trash, red: true, do: async () => { if (await confirmDlg('Route löschen?', `„${esc(r.name)}“ mit ${r.stops.length} Stopps wird gelöscht.`, 'Löschen', 'btn-r')) { if (S.run && S.run.routeId === id) S.run = null; S.routes = S.routes.filter(x => x.id !== id); if (S.activeId === id) S.activeId = S.routes[0]?.id || null; save(); openDrawer(); drawMarkers(); drawRouteLine(); renderSheet(); } } }
  ]);
}
function routeMenu(anchor) {
  const r = R(); if (!r) return createRoute();
  popMenu(anchor, [
    { label: 'Info', icon: ic.help, do: () => routeInfo(r) },
    { label: 'CSV-Datei laden', icon: ic.csv, do: importCSV },
    { label: 'Route optimieren', icon: ic.opt, do: () => optimize(r, true) },
    { label: 'Reihenfolge umdrehen', icon: ic.reverse, do: () => { if (!r.optimized) return toast('Erst optimieren'); r.order.reverse(); r.geom && r.geom.reverse(); recomputePlan(r); save(); drawMarkers(); drawRouteLine(); renderSheet(); toast('Reihenfolge umgedreht'); } },
    { label: 'Alle Häkchen entfernen', icon: ic.reset, do: () => { r.stops.forEach(s => s.status = 'open'); save(); drawMarkers(); renderList(); toast('Alles zurückgesetzt'); } },
    { label: 'Ungenaue Adressen neu suchen', icon: ic.search, do: () => geocodeAll(r, true) },
    { label: 'Als CSV exportieren', icon: ic.download, do: () => exportCSV(r) },
    { label: 'Route umbenennen', icon: ic.edit, do: async () => { const n = await dialog({ title: 'Umbenennen', input: { value: r.name }, buttons: [{ label: 'Abbrechen', value: false }, { label: 'Speichern', cls: 'btn-p', value: true }] }); if (n) { r.name = n; save(); renderSheet(); } } }
  ]);
}

/* ---------- CSV ---------- */
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const delim = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  const split = l => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === delim && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(x => x.trim()); };
  let head = split(lines[0]).map(h => h.toLowerCase());
  const has = k => head.findIndex(h => k.some(x => h.includes(x)));
  let iA = has(['adresse', 'straße', 'strasse', 'address', 'street']), iP = has(['plz', 'postleit', 'zip']), iO = has(['ort', 'stadt', 'city']), iN = has(['name', 'empfänger']), iNo = has(['notiz', 'note', 'info', 'hinweis']), iC = has(['anzahl', 'stück', 'stueck', 'menge', 'count']);
  let start = 1;
  if (iA < 0) { iA = 0; iP = 1; iO = 2; iN = 3; iNo = 4; iC = 5; start = 0; }
  const out = [];
  for (let k = start; k < lines.length; k++) {
    const c = split(lines[k]); const street = c[iA]; if (!street) continue;
    out.push({ street, zip: (iP >= 0 && c[iP]) || '', city: (iO >= 0 && c[iO]) || '', name: iN >= 0 ? (c[iN] || '') : '', note: iNo >= 0 ? (c[iNo] || '') : '', count: iC >= 0 && +c[iC] > 0 ? Math.round(+c[iC]) : 0 });
  }
  return out;
}
function importCSV() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,text/csv,text/plain';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    let text = await f.text();
    if (text.includes('�')) { const buf = await f.arrayBuffer(); text = new TextDecoder('windows-1252').decode(buf); }
    const rows = parseCSV(text);
    if (!rows.length) return toast('Keine Adressen in der Datei gefunden');
    let r = R(); if (!r) r = newRoute(f.name.replace(/\.csv$/i, '').replace(/[_]+/g, ' ').replace(/\s*\d+$/, ''));
    const key = s => (s.street + s.zip).toLowerCase().replace(/\s/g, '');
    const before = new Map(r.stops.map(s => [key(s), s]));   // schon in der Route
    const fromFile = new Map();                               // in dieser Datei
    let added = 0, merged = 0, updated = 0;
    for (const x of rows) {
      const k = key(x);
      if (fromFile.has(k)) { // gleiche Adresse mehrmals in der Datei → Anzahl erhöhen
        const s = fromFile.get(k); s.count = (s.count || 1) + (x.count || 1); if (x.name && !(s.name || '').includes(x.name)) s.name = s.name ? s.name + ' / ' + x.name : x.name; merged++; continue;
      }
      if (before.has(k)) { // Adresse gibt es schon → Name/Notiz/Anzahl übernehmen
        const s = before.get(k); if (x.name) s.name = x.name; if (x.note) s.note = x.note; s.count = x.count || 1; fromFile.set(k, s); updated++; continue;
      }
      const s = { id: uid(), street: x.street, zip: x.zip, city: x.city, name: x.name, note: x.note, count: x.count || 1, color: COLORS[0], lat: null, lon: null, quality: null, ele: null, pos: 'auto', status: 'open' };
      r.stops.push(s); fromFile.set(k, s); added++;
    }
    if (added) invalidate(r); else recomputePlan(r);
    save(); renderSheet(); drawMarkers();
    toast([added && `${added} Adressen geladen`, updated && `${updated} aktualisiert`, merged && `${merged}× doppelt → Anzahl erhöht`].filter(Boolean).join(', ') || 'Nichts Neues in der Datei');
    if (!added) return;
    await geocodeAll(r);
  };
  inp.click();
}
async function geocodeAll(r, retryBad = false) {
  const todo = r.stops.filter(s => s.lat == null || (retryBad && s.quality !== 'exact'));
  if (!S.settings.home.lat && S.settings.home.label) todo.unshift('home');
  if (!todo.length) { toast('Alle Adressen sind schon gefunden'); return; }
  const b = busy('Adressen werden gesucht');
  let i = 0, fail = 0;
  for (const s of todo) {
    i++;
    if (s === 'home') { b.set('Startadresse: ' + S.settings.home.label, i / todo.length); await geocodeHome(); continue; }
    b.set(`${i} / ${todo.length}: ${s.street}`, i / todo.length);
    try {
      const g = await geocode(s.street, s.zip, s.city);
      if (g.lat != null && !(retryBad && s.quality === 'street' && g.quality === 'street')) { s.lat = g.lat; s.lon = g.lon; s.quality = g.quality; s.ele = null; }
      else if (s.lat == null) s.quality = 'none';
      if (s.quality !== 'exact') fail++;
    } catch (e) { b.close(); toast('Keine Internetverbindung – später nochmal versuchen'); save(); renderSheet(); drawMarkers(); return; }
    if (i % 5 === 0) { save(); drawMarkers(); }
  }
  b.close(); invalidate(r); save(); drawMarkers(); renderSheet(); fitAll();
  if (fail) dialog({ title: 'Fast fertig 👍', text: `${plural(fail, 'Adresse wurde', 'Adressen wurden')} nicht ganz genau gefunden (gelb markiert). Tippe sie in der Liste an und wähle „Position auf Karte korrigieren“.`, buttons: [{ label: 'OK', cls: 'btn-p', value: 1 }] });
  else toast('Alle Adressen gefunden ✓');
}
async function askHome() {
  const v = await dialog({ title: 'Startadresse', input: { value: S.settings.home.label ? S.settings.home.label + ', ' + S.settings.home.zip + ' ' + S.settings.home.city : '', placeholder: 'Straße Nr, PLZ Ort' }, buttons: [{ label: 'Abbrechen', value: false }, { label: 'Speichern', cls: 'btn-p', value: true }] });
  if (!v) return false;
  S.settings.home = Object.assign(parseAddr(v), { lat: null, lon: null, ele: null }); save(true);
  return true;
}
async function geocodeHome() {
  const h = S.settings.home;
  if (!h.label) return;
  try { const g = await geocode(h.label, h.zip, h.city); if (g.lat != null) { h.lat = g.lat; h.lon = g.lon; h.ele = null; h.quality = g.quality; save(); } } catch (e) { }
}
function exportCSV(r) {
  const rows = [['Adresse', 'PLZ', 'Ort', 'Name', 'Notiz', 'Anzahl']].concat(stopsOrdered(r).map(s => [s.street, s.zip, s.city, s.name || '', s.note || '', String(s.count || 1)]));
  const csv = '﻿' + rows.map(x => x.map(v => /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v).join(';')).join('\n');
  download(r.name.replace(/[^\wäöüÄÖÜß -]/g, '') + '.csv', csv, 'text/csv');
}
function download(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- Optimieren ---------- */
async function ensureData(r, b) {
  const st = S.settings;
  if (st.home.lat == null) { b.set('Startadresse suchen…', .05); await geocodeHome(); }
  if (st.home.lat == null) throw new Error('Startadresse „' + st.home.label + '“ wurde nicht gefunden. Bitte in den Einstellungen prüfen.');
  const stops = r.stops.filter(s => s.lat != null);
  const pts = [st.home].concat(stops);
  // Höhen
  if (pts.some(p => p.ele == null)) {
    b.set('Höhen (Berg) werden geladen…', .15);
    try { const e = await elevations(pts); pts.forEach((p, i) => { if (e[i] != null) p.ele = e[i]; }); } catch (e) { }
  }
  // Fahrzeiten
  const key = pts.map(p => p.lat.toFixed(5) + p.lon.toFixed(5)).join('|');
  if (!r.matrix || r.matrix.key !== key) {
    b.set('Wege zwischen allen Häusern werden berechnet…', .35);
    let m;
    try { m = await osrmTable(pts); } catch (e) { m = fallbackTable(pts, 15 / 3.6); }
    r.matrix = { key, dur: m.dur, dist: m.dist, approx: !!m.approx };
  }
  return { pts, stops };
}
function costMatrix(r, pts) {
  const st = S.settings, f = 15 / st.speed, hill = HILL[st.hill] || 0;
  const n = pts.length, c = [];
  for (let i = 0; i < n; i++) {
    c.push([]);
    for (let j = 0; j < n; j++) {
      let d = r.matrix.dur[i][j]; if (d == null) d = hav(pts[i], pts[j]) * 1.4 / (15 / 3.6);
      const up = pts[i].ele != null && pts[j].ele != null ? Math.max(0, pts[j].ele - pts[i].ele) : 0;
      c[i].push(d * f + up * hill);
    }
  }
  return c;
}
/* Gelernte Werte pro Route (Ø der letzten 5 Touren) */
function learned(r) {
  const runs = (r && r.learn && r.learn.runs) || [];
  if (!runs.length) return { a: 1, b: 15, n: 0 };
  return { a: runs.reduce((x, k) => x + k.a, 0) / runs.length, b: runs.reduce((x, k) => x + k.b, 0) / runs.length, n: runs.length };
}
const stopTime = (r, s) => learned(r).b * (s.count > 1 ? 1 + .3 * (s.count - 1) : 1);
function planFor(r, pts, idxOrder, returnHome) {
  const st = S.settings, f = 15 / st.speed * learned(r).a;
  let dur = 0, dist = 0, up = 0, prev = 0; const legs = [];
  const step = (a, b) => { const d = (r.matrix.dur[a][b] ?? hav(pts[a], pts[b]) * 1.4 / 4.2) * f; const m = r.matrix.dist[a][b] ?? hav(pts[a], pts[b]) * 1.4; dur += d; dist += m; if (pts[a].ele != null && pts[b].ele != null) up += Math.max(0, pts[b].ele - pts[a].ele); return d; };
  for (const k of idxOrder) { legs.push(step(prev, k)); prev = k; }
  let back = 0; if (returnHome) back = step(prev, 0);
  const stopsT = idxOrder.reduce((a, k) => a + stopTime(r, pts[k]), 0);
  return { drive: dur, total: dur + stopsT, dist, up: Math.round(up), legs, back, returnHome, endName: pts[prev].street || 'Start' };
}
function recomputePlan(r) {
  if (!r.matrix || !r.order) return;
  const st = S.settings; const stops = r.stops.filter(s => s.lat != null); const pts = [st.home].concat(stops);
  const idx = new Map(stops.map((s, i) => [s.id, i + 1]));
  const ord = r.order.map(id => idx.get(id)).filter(Boolean);
  r.plan = planFor(r, pts, ord, r.plan ? r.plan.returnHome : st.returnHome);
}
async function optimize(r, interactive) {
  if (!r || r.stops.length < 2) { toast('Mindestens 2 Stopps nötig'); return false; }
  if (!S.settings.home.label && !(await askHome())) return false;
  if (r.stops.some(s => s.lat == null && s.quality == null)) { await geocodeAll(r); }
  const b = busy('Route wird optimiert');
  try {
    const { pts, stops } = await ensureData(r, b);
    b.set('Beste Reihenfolge wird gesucht…', .7);
    await sleep(30);
    const c = costMatrix(r, pts);
    const firsts = stops.map((s, i) => s.pos === 'first' ? i + 1 : 0).filter(Boolean);
    const lasts = stops.map((s, i) => s.pos === 'last' ? i + 1 : 0).filter(Boolean);
    const mids = stops.map((s, i) => s.pos !== 'first' && s.pos !== 'last' ? i + 1 : 0).filter(Boolean);
    const fixFirst = firsts.length > 1 ? solvePath(c, 0, firsts, null, 200) : firsts;
    const s0 = fixFirst.length ? fixFirst[fixFirst.length - 1] : 0;
    const solve = ret => {
      let fixLast = lasts.length > 1 ? solvePath(c, mids.length ? mids[0] : s0, lasts, ret ? 0 : null, 200) : lasts;
      const e = fixLast.length ? fixLast[0] : (ret ? 0 : null);
      const mid = solvePath(c, s0, mids, e, 1100);
      return fixFirst.concat(mid, fixLast);
    };
    const withRet = solve(true);
    b.set('Variante ohne Rückweg wird verglichen…', .88); await sleep(20);
    const noRet = solve(false);
    const pA = planFor(r, pts, withRet, true), pB = planFor(r, pts, noRet, false);
    // Geometrie der ganzen Route
    b.set('Strecke wird gezeichnet…', .95);
    const choose = async ret => {
      const ord = ret ? withRet : noRet;
      r.order = ord.map(k => stops[k - 1].id).concat(r.stops.filter(s => s.lat == null).map(s => s.id));
      S.settings.returnHome = ret;
      r.plan = ret ? pA : pB; r.plan.alt = ret ? { total: pB.total, endName: pB.endName } : { total: pA.total };
      r.optimized = true;
      const seq = [pts[0]].concat(ord.map(k => pts[k])).concat(ret ? [pts[0]] : []);
      try {
        let g = [];
        for (let i = 0; i < seq.length - 1; i += 60) { const part = await osrmRoute(seq.slice(i, i + 61)); g = g.concat(part.geometry.coordinates); }
        r.geom = g;
      } catch (e) { r.geom = seq.map(p => [p.lon, p.lat]); }
      save(); drawMarkers(); drawRouteLine(); renderSheet(); fitAll();
    };
    await choose(S.settings.returnHome);
    b.close();
    if (interactive) showOptResult(r, pA, pB, choose);
    return true;
  } catch (e) {
    b.close(); dialog({ title: 'Optimieren ging nicht', text: esc(e.message || 'Unbekannter Fehler') + '<br><br>Hast du Internet?', buttons: [{ label: 'OK', cls: 'btn-p', value: 1 }] });
    return false;
  }
}
function showOptResult(r, pA, pB, choose) {
  const st = S.settings;
  const approx = r.matrix.approx ? '<div class="note-box warn" style="margin:0 0 12px">Wege nur geschätzt (kein Internet).</div>' : '';
  const w = document.createElement('div'); w.className = 'dlg-wrap';
  const sel = () => r.plan.returnHome;
  const draw = () => {
    w.innerHTML = `<div class="dlg"><h2>Route optimiert ✓</h2>${approx}
      <div class="stats"><div><b>${fmtDur(r.plan.total)}</b><small>Dauer gesamt</small></div><div><b>${fmtKm(r.plan.dist)}</b><small>Strecke</small></div>
      <div><b>${r.stops.length}</b><small>Briefkästen</small></div><div><b>${r.plan.up} m</b><small>bergauf</small></div></div>
      <p style="margin:0 0 4px"><b>Ende der Route:</b></p>
      <div class="cmp"><button data-r="1" class="${sel() ? 'sel' : ''}"><b>${fmtDur(pA.total)}</b><small>zurück zum ${esc(st.home.label)}</small></button>
      <button data-r="0" class="${!sel() ? 'sel' : ''}"><b>${fmtDur(pB.total)}</b><small>endet bei ${esc(pB.endName)}</small></button></div>
      
      <div class="btns"><button class="btn btn-s" id="oList">Liste ansehen</button><button class="btn btn-p" id="oGo">${ic.play} Starten</button></div></div>`;
    w.querySelectorAll('[data-r]').forEach(bn => bn.onclick = async () => { const ret = bn.dataset.r === '1'; if (ret === sel()) return; await choose(ret); draw(); });
    w.querySelector('#oList').onclick = () => { w.remove(); setSheet(true); };
    w.querySelector('#oGo').onclick = () => { w.remove(); startRun(r.id, true); };
  };
  draw(); document.body.appendChild(w);
  w.onclick = e => { if (e.target === w) w.remove(); };
}

/* ---------- Stopp bearbeiten ---------- */
function openStop(id) {
  const r = R(); const s = r.stops.find(x => x.id === id); if (!s) return;
  const list = stopsOrdered(r); const no = list.indexOf(s) + 1;
  const pg = openPage(`
    <div class="page-h"><span style="width:46px"></span><h1>Stopp bearbeiten</h1><button class="act" data-close>Fertig</button></div>
    <div class="page-b">
      <div class="ed-top"><div class="ed-id">${r.optimized ? 'Stopp ' + no + ' von ' + list.length : 'Noch nicht optimiert'}${s.ele != null ? ' · ' + Math.round(s.ele) + ' m hoch' : ''}${s.status === 'done' ? ' · ✓ erledigt' : ''}</div>
        <div class="ed-addr">${esc(s.street)}</div><div class="ed-city">${esc(s.zip + ' ' + s.city)}</div></div>
      <div class="chips">${COLORS.map(c => `<button class="chip ${(s.color || COLORS[0]) === c ? 'sel' : ''}" data-c="${c}"><i style="background:${c}"></i></button>`).join('')}</div>
      <div class="field"><label>Name auf dem Briefkasten</label><input id="sName" value="${esc(s.name)}" autocomplete="off"></div>
      <div class="row">${ic.copy}<div class="l">Anzahl Blätter</div><div class="step"><button id="cM">−</button><span id="cV">${s.count || 1}</span><button id="cP">+</button></div></div>
      <div class="field"><label>Notizen</label><textarea id="sNote" rows="2" >${esc(s.note)}</textarea></div>
      <div class="row">${ic.sort}<div class="l">Reihenfolge</div><div class="seg" id="sPos">${[['first', 'Erster'], ['auto', 'Auto'], ['last', 'Letzter']].map(([v, l]) => `<button data-v="${v}" class="${(s.pos || 'auto') === v ? 'sel' : ''}">${l}</button>`).join('')}</div></div>
      <div class="row">${ic.check}<div class="l">Erledigt</div><button class="tog ${s.status === 'done' ? 'on' : ''}" id="sDone"></button></div>
      <div class="grey" style="margin-top:8px">
        <div class="link-row" id="sMove">${ic.move}<span>Position auf Karte korrigieren</span>${ic.chev.replace('<svg', '<svg class="chev"')}</div>
        <div class="link-row" id="sAddr">${ic.search}<span>Adresse ändern</span>${ic.chev.replace('<svg', '<svg class="chev"')}</div>
        <div class="link-row" id="sDup">${ic.copy}<span>Stopp duplizieren</span>${ic.chev.replace('<svg', '<svg class="chev"')}</div>
        <div class="link-row red" id="sDel">${ic.trash}<span>Stopp löschen</span></div>
      </div>
      ${s.quality === 'street' ? '<div class="note-box warn">Nur ungefähr gefunden – Position prüfen.</div>' : s.quality === 'none' ? '<div class="note-box warn">Nicht gefunden – Adresse ändern oder Position setzen.</div>' : ''}
    </div>`, { onClose: () => { save(); drawMarkers(); renderList(); } });
  const el = pg.el;
  if (s.lat != null) map.setView([s.lat, s.lon], Math.max(map.getZoom(), 17));
  el.querySelectorAll('.chip').forEach(c => c.onclick = () => { s.color = c.dataset.c; el.querySelectorAll('.chip').forEach(x => x.classList.toggle('sel', x === c)); save(); });
  $('#sName', el).oninput = e => { s.name = e.target.value; save(); };
  $('#sNote', el).oninput = e => { s.note = e.target.value; save(); };
  el.querySelectorAll('#sPos button').forEach(b => b.onclick = () => { s.pos = b.dataset.v; el.querySelectorAll('#sPos button').forEach(x => x.classList.toggle('sel', x === b)); if (r.optimized) { r.optimized = false; toast('Bitte neu optimieren'); renderFooter(); } save(); });
  const setC = d => { s.count = clamp((s.count || 1) + d, 1, 20); $('#cV', el).textContent = s.count; save(); };
  $('#cM', el).onclick = () => setC(-1); $('#cP', el).onclick = () => setC(1);
  $('#sDone', el).onclick = e => { s.status = s.status === 'done' ? 'open' : 'done'; e.currentTarget.classList.toggle('on', s.status === 'done'); save(); };
  $('#sMove', el).onclick = () => { pg.close(); dragStop(s); };
  $('#sAddr', el).onclick = async () => {
    const v = await dialog({ title: 'Adresse ändern', input: { value: s.street }, buttons: [{ label: 'Abbrechen', value: false }, { label: 'Suchen', cls: 'btn-p', value: true }] });
    if (!v) return; const b = busy('Adresse wird gesucht');
    try { const g = await geocode(v, s.zip, s.city); s.street = v; if (g.lat != null) { s.lat = g.lat; s.lon = g.lon; s.ele = null; } s.quality = g.quality; invalidate(r); save(); b.close(); pg.close(); openStop(s.id); toast(g.quality === 'exact' ? 'Gefunden ✓' : 'Nur ungefähr gefunden'); }
    catch (e) { b.close(); toast('Kein Internet'); }
  };
  $('#sDup', el).onclick = () => { const c = Object.assign({}, s, { id: uid(), status: 'open' }); r.stops.push(c); invalidate(r); save(); pg.close(); renderSheet(); toast('Stopp dupliziert'); };
  $('#sDel', el).onclick = async () => { if (!(await confirmDlg('Stopp löschen?', esc(s.street), 'Löschen', 'btn-r'))) return; r.stops = r.stops.filter(x => x.id !== s.id); if (r.order) { r.order = r.order.filter(x => x !== s.id); recomputePlan(r); } pg.close(); renderSheet(); drawMarkers(); };
}
function dragStop(s) {
  document.body.classList.add('dragmode');
  const ll = s.lat != null ? [s.lat, s.lon] : map.getCenter();
  map.setView(ll, 18);
  const m = L.marker(ll, { draggable: true, icon: pinIcon(I('<path d="M12 3v18M3 12h18"/>', 3).replace('<svg', '<svg width="16" height="16"'), 'drag'), zIndexOffset: 3000 }).addTo(map);
  const ban = document.createElement('div'); ban.className = 'drag-banner';
  ban.innerHTML = `<span><b>${esc(s.street)}</b><br>Pin auf den richtigen Briefkasten ziehen (oder auf die Karte tippen).</span><button class="btn btn-p" id="dOk">Fertig</button>`;
  document.body.appendChild(ban);
  const onMap = e => m.setLatLng(e.latlng); map.on('click', onMap);
  $('#dOk', ban).onclick = () => {
    const p = m.getLatLng(); s.lat = p.lat; s.lon = p.lng; s.quality = 'exact'; s.ele = null;
    map.off('click', onMap); m.remove(); ban.remove(); document.body.classList.remove('dragmode');
    const r = R(); invalidate(r); save(); drawMarkers(); renderSheet(); toast('Position gespeichert – bitte neu optimieren');
  };
}

/* ---------- Routenauswahl & Fahrt ---------- */
function pickRoute() {
  const rs = S.routes.filter(r => r.stops.length);
  if (!rs.length) return toast('Erst Adressen hinzufügen');
  const pg = openPage(`<div class="page-h"><span style="width:46px"></span><h1>Welche Route?</h1><button class="icon-btn" data-close>${ic.x}</button></div>
    <div class="page-b">${rs.map(r => {
      const last = r.history && r.history.length ? r.history[r.history.length - 1] : null;
      return `<div class="pick" data-id="${r.id}"><div class="ic">${ic.map}</div><div class="n"><b>${esc(r.name)}${r.optimized ? '<span class="badge">optimiert</span>' : '<span class="badge o">neu</span>'}</b>
      <small>${plural(r.stops.length, 'Stopp', 'Stopps')}${r.plan ? ' · ca. ' + fmtDur(r.plan.total) + ' · fertig ca. ' + fmtTime(Date.now() + r.plan.total * 1000) : ''}</small>
      ${last ? `<small>Zuletzt ${fmtDate(last.date)} · ${fmtDur(last.sec)}</small>` : ''}</div>${ic.play.replace('<svg', '<svg style="width:28px;height:28px;color:#2970ff"')}</div>`;
    }).join('')}</div>`, { sheetlike: true });
  pg.el.querySelectorAll('.pick').forEach(el => el.onclick = () => { pg.close(); startRun(el.dataset.id); });
}
async function startRun(id, skipOpt) {
  const r = S.routes.find(x => x.id === id); if (!r) return;
  if (S.activeId !== id) selectRoute(id);
  if (!r.optimized && !skipOpt) { const ok = await optimize(r, false); if (!ok) return; }
  if (!r.optimized) return;
  const startedBefore = r.stops.some(s => s.status !== 'open');
  if (startedBefore) {
    const v = await dialog({ title: 'Neue Runde?', text: `${r.stops.filter(s => s.status === 'done').length} Häuser sind noch abgehakt.`, buttons: [{ label: 'Weitermachen', value: 'keep' }, { label: 'Neue Runde', cls: 'btn-p', value: 'new' }] });
    if (!v) return;
    if (v === 'new') r.stops.forEach(s => s.status = 'open');
  }
  S.run = { routeId: id, started: Date.now(), paused: 0, pausedAt: null, doneLog: [], plannedTotal: r.plan.total, segs: [], segStart: Date.now(), segPaused: 0, segIdle: 0, lastId: null, dist: 0 };
  save(true); enterNav();
  lastStreet = null;
  speak('Route ' + r.name + ' gestartet. ' + plural(openStops().length, 'Stopp', 'Stopps') + '.', true);
}
function resumeRun() { const r = S.routes.find(x => x.id === S.run.routeId); if (!r) { S.run = null; save(); return renderFooter(); } if (S.activeId !== r.id) selectRoute(r.id); enterNav(); }
const runRoute = () => S.run && S.routes.find(x => x.id === S.run.routeId);
const openStops = () => { const r = runRoute(); return r ? stopsOrdered(r).filter(s => s.status === 'open' && s.lat != null) : []; };
const nextStop = () => openStops()[0] || null;
let wakeLock = null, etaTimer = null, legReqAt = 0, leg = null, lastTarget = null, arriveShownFor = null, spokenSteps = new Set();
async function keepAwake(on) {
  try {
    if (on && S.settings.keepAwake && 'wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); }
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S && S.run) keepAwake(true); });
/* Automatisch abhaken: nah am Haus + stehen geblieben */
let dwell = null, autoTimer = null;
function autoTick() {
  idleTick();
  const st = S.settings;
  if (!st.autoDone || !S.run || S.run.pausedAt || !pos) { dwell = null; return; }
  const n = nextStop(); if (!n) { dwell = null; return; }
  const acc = Math.min(15, pos.acc || 10);
  const green = arriveShownFor === n.id || driveArrived === n.id;
  const inRange = hav(pos, n) <= st.autoRad + acc || (green && hav(pos, n) <= st.radius + acc);
  if (!inRange) { if (dwell && dwell.id === n.id && ++dwell.out <= 3) return; dwell = null; return; }
  const tol = Math.max(15, acc * 1.5);
  if (!dwell || dwell.id !== n.id) { dwell = { id: n.id, anchor: { lat: pos.lat, lon: pos.lon }, t: Date.now(), out: 0, moved: 0 }; return; }
  dwell.out = 0;
  const moving = hav(pos, dwell.anchor) > tol || (gpsSpeed != null && gpsSpeed > 2);
  if (moving) { if (++dwell.moved >= 2) { dwell.anchor = { lat: pos.lat, lon: pos.lon }; dwell.t = Date.now(); dwell.moved = 0; } return; }
  dwell.moved = 0;
  if (Date.now() - dwell.t >= st.autoSec * 1000) { dwell = null; driveArrived = null; markDone(n); toast('✓ ' + n.street); }
}
function enterNav() {
  clearInterval(autoTimer); autoTimer = setInterval(autoTick, 1000);
  document.body.classList.add('nav'); setSheet(false);
  follow = true; startGPS(); keepAwake(true);
  drawMarkers(); drawRouteLine(); renderNav(); arm();
  if (S.settings.driveMode) openDrive();
  const n = nextStop(); if (pos) map.setView([pos.lat, pos.lon], 18); else if (n) map.setView([n.lat, n.lon], 17);
  clearInterval(etaTimer); etaTimer = setInterval(() => { renderNavBottom(); maybeLeg(); }, 15000);
  maybeLeg(true);
}
function exitNav() {
  document.body.classList.remove('nav'); clearInterval(etaTimer); clearInterval(autoTimer); dwell = null; keepAwake(false); follow = false; closeDrive(true);
  if (legLine) { map.removeLayer(legLine); legLine = null; } leg = null; lastTarget = null;
  $('#navTop').innerHTML = ''; $('#navBottom').innerHTML = '';
  drawMarkers(); renderSheet(); fitAll();
}
function remainingEstimate() {
  const r = runRoute(); if (!r || !r.plan) return null;
  const st = S.settings, f = 15 / st.speed * learned(r).a;
  const stops = r.stops.filter(s => s.lat != null); const pts = [st.home].concat(stops);
  const idx = new Map(stops.map((s, i) => [s.id, i + 1]));
  const open = openStops(); if (!open.length) return { sec: 0, dist: 0 };
  let sec = 0, dist = 0;
  // bis zum nächsten Stopp
  if (leg && leg.target === open[0].id && pos) { sec += leg.dur * f * (leg.remainFrac ?? 1); dist += leg.dist * (leg.remainFrac ?? 1); }
  else if (pos) { const d = hav(pos, open[0]) * 1.4; sec += d / (st.speed / 3.6) * learned(r).a; dist += d; }
  for (let i = 0; i < open.length; i++) {
    sec += stopTime(r, open[i]);
    if (i > 0) { const a = idx.get(open[i - 1].id), b = idx.get(open[i].id); sec += (r.matrix.dur[a][b] ?? 0) * f; dist += r.matrix.dist[a][b] ?? 0; }
  }
  if (r.plan.returnHome) { const a = idx.get(open[open.length - 1].id); sec += (r.matrix.dur[a][0] ?? 0) * f; dist += r.matrix.dist[a][0] ?? 0; }
  // Tempo-Faktor aus der bisherigen Runde
  const log = S.run.doneLog;
  let factor = 1;
  if (log.length >= 4) {
    const plannedSoFar = Math.max(120, S.run.plannedTotal - sec);
    factor = clamp(activeElapsed() / 1000 / plannedSoFar, .6, 2);
  }
  return { sec: sec * factor, dist, factor };
}
const activeElapsed = () => (S.run.pausedAt || Date.now()) - S.run.started - S.run.paused;
function renderNav() { renderNavTop(); renderNavBottom(); renderDrive(); }
function renderNavTop() {
  const r = runRoute(); const n = nextStop();
  if (!r) return;
  if (!n) { $('#navTop').innerHTML = `<div class="nt-card"><div class="nt-body"><div class="nt-num" style="background:var(--green)">${ic.check.replace('<svg', '<svg width="26" height="26"')}</div><div class="nt-main"><div class="a">Alle Briefkästen erledigt!</div><div class="s">${r.plan.returnHome ? 'Jetzt zurück zum ' + esc(S.settings.home.label) : 'Fertig 🎉'}</div></div></div></div>`; return; }
  const list = stopsOrdered(r); const no = list.indexOf(n) + 1;
  const d = wayLeft(n);
  let man = '';
  if (leg && leg.steps && S.settings.voiceNav) {
    const stp = currentStep();
    if (stp) man = `<div class="man">${stp.icon}<div class="t">${stp.dist != null ? 'In ' + fmtKm(stp.dist) : ''}<small>${esc(stp.text)}</small></div></div>`;
  }
  $('#navTop').innerHTML = `<div class="nt-card">${man}<div class="nt-body"><div class="nt-num">${no}</div><div class="nt-main"><div class="s">Nächster Stopp · ${no} von ${list.length}</div><div class="a">${esc(n.street)}</div>${n.name || n.count > 1 ? `<div class="n">${n.count > 1 ? `<span class="cnt">${n.count}×</span> ` : ''}${esc(n.name || '')}</div>` : ''}${n.note ? `<div class="o">📝 ${esc(n.note)}</div>` : ''}</div>${d != null ? `<div class="nt-dist">${fmtKm(d)}</div>` : ''}</div></div>`;
  $('#navTop .nt-body').onclick = () => openDrive();
}
function renderNavBottom() {
  const r = runRoute(); if (!r) return;
  const total = r.stops.length, done = r.stops.filter(s => s.status !== 'open').length;
  const est = remainingEstimate();
  const paused = !!S.run.pausedAt;
  const end = est ? Date.now() + est.sec * 1000 : null;
  $('#navBottom').innerHTML = `${paused ? '<div class="paused-banner">⏸ Pausiert – Zeit läuft nicht</div>' : ''}
    <div class="nb-prog"><i style="width:${total ? done / total * 100 : 0}%"></i></div>
    <div class="nb-info"><div class="big">${done}<small>von ${total} erledigt</small></div>
      <div class="r">noch <b>${est ? fmtDur(est.sec) : '–'}</b> · ${est ? fmtKm(est.dist) : ''}<br>${r.plan.returnHome ? 'zu Hause' : 'fertig'} ca. <b>${end ? fmtTime(end) : '–'}</b></div></div>
    <div class="nb-btns"><button class="btn btn-s" id="nSkip">${ic.skip}Überspringen</button><button class="btn btn-g" id="nDone" ${nextStop() ? '' : 'disabled'}>${ic.check} Eingeworfen</button></div>
    <div class="nb-tools">
      <button id="nPause">${paused ? ic.play : ic.pause}${paused ? 'Weiter' : 'Pause'}</button>
      <button id="nUndo">${ic.undo}Rückgängig</button>
      <button id="nVoice" class="${S.settings.voiceNav ? 'on' : ''}">${S.settings.voiceNav ? ic.vol : ic.mute}Ansagen</button>
      <button id="nList">${ic.sort}Liste</button>
      <button id="nEnd">${ic.stop}Beenden</button></div>`;
  document.documentElement.style.setProperty('--navb', $('#navBottom').offsetHeight + 'px');
  $('#nDone').onclick = () => { const n = nextStop(); if (n) markDone(n); };
  $('#nSkip').onclick = () => { const n = nextStop(); if (n) skipStop(n); };
  $('#nPause').onclick = togglePause;
  $('#nUndo').onclick = undo;
  $('#nVoice').onclick = () => { S.settings.voiceNav = !S.settings.voiceNav; save(); renderNav(); if (S.settings.voiceNav) { speak('Sprachansagen an', true); maybeLeg(true); } };
  $('#nList').onclick = runList;
  $('#nEnd').onclick = endRunAsk;
}
function markDone(s, auto) {
  if (s.status === 'done') return;
  s.status = 'done'; S.run.doneLog.push({ id: s.id, t: Date.now(), prev: 'open' });
  if (S.run.pausedAt) togglePause();
  recordSeg(s);
  save(); closeArrive();
  clickSound();
  if (S.settings.vibrate && navigator.vibrate) navigator.vibrate(40);
  afterChange();
}
function skipStop(s) {
  s.status = 'skip'; S.run.doneLog.push({ id: s.id, t: Date.now(), prev: 'open' }); segReset(null); save(); closeArrive();
  toast('Übersprungen: ' + s.street); afterChange();
}
function undo() {
  const r = runRoute(); const l = S.run.doneLog.pop(); if (!l) return toast('Nichts zum Rückgängig machen');
  const s = r.stops.find(x => x.id === l.id); if (s) s.status = 'open'; segReset(null); save(); toast('Rückgängig: ' + (s ? s.street : '')); afterChange();
}
function afterChange() {
  arriveShownFor = null; drawMarkers(); renderNav(); maybeLeg(true);
  const n = nextStop();
  if (!n) return finishRun();
}
/* Lernen: Zeit je Abschnitt messen (ohne Pausen und langes Stehen) */
function baseDrive(r, fromId, toId) {
  if (!r.matrix) return null;
  const stops = r.stops.filter(x => x.lat != null), idx = new Map(stops.map((x, i) => [x.id, i + 1]));
  const a = idx.get(fromId), b = idx.get(toId); if (a == null || b == null) return null;
  const d = r.matrix.dur[a][b]; return d == null ? null : d * 15 / S.settings.speed;
}
function segReset(lastId) {
  const R0 = S.run; if (!R0) return;
  R0.segStart = Date.now(); R0.segPaused = R0.paused; R0.segIdle = 0; R0.lastId = lastId;
}
function recordSeg(s) {
  const R0 = S.run, r = runRoute(); if (!R0 || !r) return;
  if (!R0.segs) { R0.segs = []; segReset(null); }
  if (R0.lastId) {
    const T = (Date.now() - R0.segStart - (R0.paused - R0.segPaused)) / 1000 - R0.segIdle;
    const D = baseDrive(r, R0.lastId, s.id);
    if (D != null && T > 1) R0.segs.push({ T, D, N: s.count || 1 });
  }
  segReset(s.id);
}
function fitRun(segs) {
  const fit = list => { let dd = 0, dn = 0, nn = 0, td = 0, tn = 0; for (const g of list) { dd += g.D * g.D; dn += g.D * g.N; nn += g.N * g.N; td += g.T * g.D; tn += g.T * g.N; } const det = dd * nn - dn * dn; if (Math.abs(det) < 1e-6) return null; return { a: (td * nn - tn * dn) / det, b: (tn * dd - td * dn) / det }; };
  if (!segs || segs.length < 5) return null;
  let f = fit(segs); if (!f) return null;
  const res = segs.map(g => Math.abs(g.T - f.a * g.D - f.b * g.N)), med = res.slice().sort((x, y) => x - y)[Math.floor(res.length / 2)];
  const kept = segs.filter((g, i) => res[i] <= Math.max(20, med * 3));
  if (kept.length >= 5) f = fit(kept) || f;
  return { a: clamp(f.a, .5, 2.5), b: clamp(f.b, 5, 60), n: segs.length };
}
function learnFromRun(r) {
  const f = fitRun(S.run && S.run.segs); if (!f) return false;
  r.learn = r.learn || { runs: [] };
  r.learn.runs = r.learn.runs.concat({ a: f.a, b: f.b, date: Date.now() }).slice(-5);
  recomputePlan(r); return true;
}
let idleT = null;
function idleTick() {
  const R0 = S.run; if (!R0 || R0.pausedAt || !pos) { idleT = null; return; }
  if (!idleT || hav(pos, idleT.p) > Math.max(15, (pos.acc || 0) * 1.5)) { idleT = { p: { lat: pos.lat, lon: pos.lon }, t: Date.now() }; return; }
  if (Date.now() - idleT.t > 120000) R0.segIdle = (R0.segIdle || 0) + 1;
}
/* Sanfter Klick-Ton */
let actx = null;
function clickSound() {
  if (!S.settings.clickSound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t = actx.currentTime;
    [[880, 0], [1320, .07]].forEach(([fr, d]) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = fr;
      g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.18, t + d + .01); g.gain.exponentialRampToValueAtTime(0.0001, t + d + .16);
      o.connect(g).connect(actx.destination); o.start(t + d); o.stop(t + d + .18);
    });
  } catch (e) { }
}
addEventListener('pointerdown', () => { try { if (actx && actx.state === 'suspended') actx.resume(); else if (!actx && S && S.settings.clickSound) actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }, { passive: true });
/* Zusammenfassung nach der Tour */
function showSummary(r, info) {
  const w = document.createElement('div'); w.className = 'dlg-wrap';
  w.innerHTML = `<div class="dlg"><h2>${info.finished ? 'Geschafft! 🎉' : 'Tour beendet'}</h2><p>${esc(r.name)} · ${fmtDate(info.date)}</p>
    <div class="stats"><div><b>${fmtDur(info.sec)}</b><small>gebraucht</small></div><div><b>${fmtDur(info.planned)}</b><small>geschätzt</small></div>
    <div><b>${fmtKm(info.dist)}</b><small>Strecke</small></div><div><b>${info.sheets}</b><small>Blätter</small></div></div>
    ${info.learned ? '<p>✓ Schätzung angepasst</p>' : ''}
    <div class="btns"><button class="btn btn-p" id="fOk">OK</button></div></div>`;
  document.body.appendChild(w);
  $('#fOk', w).onclick = () => { w.remove(); exitNav(); };
}
function closeRun(finished) {
  const r = runRoute(); if (!r) return;
  const sec = Math.round(activeElapsed() / 1000);
  const done = r.stops.filter(s => s.status === 'done');
  const info = { finished, date: S.run.started, sec, planned: S.run.plannedTotal, dist: S.run.dist > 50 ? S.run.dist : (r.plan ? r.plan.dist : 0), sheets: done.reduce((a, s) => a + (s.count || 1), 0) };
  if (done.length) r.history = (r.history || []).concat({ date: S.run.started, sec, planned: S.run.plannedTotal, done: done.length, total: r.stops.length });
  info.learned = learnFromRun(r);
  S.run = null; save(true);
  if (done.length) showSummary(r, info); else exitNav();
}
function togglePause() {
  if (S.run.pausedAt) { S.run.paused += Date.now() - S.run.pausedAt; S.run.pausedAt = null; toast('Weiter geht\'s'); }
  else { S.run.pausedAt = Date.now(); toast('Pause – die Zeit läuft nicht mit'); }
  save(); renderNavBottom();
}
async function endRunAsk() {
  const open = openStops().length;
  const v = await dialog({ title: 'Route beenden?', text: open ? `Noch ${plural(open, 'Stopp', 'Stopps')} offen.` : '', buttons: [{ label: 'Abbrechen', value: false }, { label: 'Beenden', cls: 'btn-r', value: true }] });
  if (!v) return;
  closeRun(false);
}
function finishRun() {
  if (!runRoute()) return;
  speak('Super, alle Briefkästen erledigt!', true);
  closeRun(true);
}
function runList() {
  const r = runRoute(); const list = stopsOrdered(r);
  const pg = openPage(`<div class="page-h"><span style="width:46px"></span><h1>${esc(r.name)}</h1><button class="icon-btn" data-close>${ic.x}</button></div>
  <div class="page-b">${list.map((s, i) => `<div class="stop ${s.status === 'done' ? 'done' : ''}" data-id="${s.id}"><div class="num">${pad2(i + 1)}</div><div class="txt"><div class="a">${esc(s.street)}</div><div class="b">${s.status === 'skip' ? '<span class="warn">übersprungen</span> · ' : ''}${s.name ? `<span class="nm">${esc(s.name)}</span>` : esc(s.zip + ' ' + s.city)}</div></div><div class="tag">${s.status === 'done' ? ic.check : '<i></i>'}</div></div>`).join('')}</div>`, { sheetlike: true });
  pg.el.querySelectorAll('.stop').forEach(el => el.onclick = () => {
    const s = r.stops.find(x => x.id === el.dataset.id);
    popMenu(el, [
      { label: s.status === 'done' ? 'Wieder öffnen' : 'Als erledigt markieren', icon: ic.check, do: () => { if (s.status === 'done') { s.status = 'open'; save(); afterChange(); } else markDone(s); pg.close(); } },
      { label: 'Als Nächstes anfahren', icon: ic.flag, do: () => { s.status = 'open'; const ids = r.order.filter(x => x !== s.id); const nx = nextStop(); const at = nx ? ids.indexOf(nx.id) : 0; ids.splice(Math.max(0, at), 0, s.id); r.order = ids; save(); pg.close(); afterChange(); } },
      { label: 'Stopp bearbeiten', icon: ic.edit, do: () => { pg.close(); openStop(s.id); } }
    ]);
  });
}

/* ---------- Unterwegs: Position, Ankunft, Navigation ---------- */
let lastRunPos = null;
function onRunPosition() {
  const r = runRoute(); if (!r) return;
  if (lastRunPos) { const d = hav(lastRunPos, pos); if (d > 4 && d < 300) { S.run.dist = (S.run.dist || 0) + d; lastRunPos = pos; } } else lastRunPos = pos;
  const n = nextStop();
  // Ankunft: nächstgelegener offener Stopp im Radius
  const rad = S.settings.radius + Math.min(20, (pos.acc || 0) / 2);
  let near = null, nd = Infinity;
  for (const s of openStops()) { const d = hav(pos, s) * (n && s.id === n.id ? 1 : 2.2); if (d < nd) { nd = d; near = s; } }
  if (near && nd <= rad && arriveShownFor !== near.id) {
    if (driveEl && n && near.id === n.id) { arriveShownFor = n.id; driveArrived = n.id; arrivalSignal(n); renderDrive(); }
    else showArrive(near, false);
  }
  if (leg && n && leg.target === n.id) updateLegProgress();
  if (Date.now() - (renderNavTop._t || 0) > 2500) { renderNavTop._t = Date.now(); renderNavTop(); renderDrive(); }
  maybeLeg();
  voiceStep();
}
async function maybeLeg(force) {
  const n = nextStop(); if (!n || !pos) { if (legLine) { map.removeLayer(legLine); legLine = null; } return; }
  const off = leg && leg.target === n.id ? distToLine(pos, leg.coords) : Infinity;
  const need = force || !leg || leg.target !== n.id || off > 40;
  if (!need || legBusy) return;
  if (leg && leg.target === n.id && Date.now() - legReqAt < (force ? 2000 : 12000)) return;
  legReqAt = Date.now(); legBusy = true;
  let rt = null;
  try { rt = await osrmRoute([pos, n], true); } catch (e) { }
  legBusy = false;
  if (nextStop() !== n) return;
  const coords = rt ? rt.geometry.coordinates.map(c => ({ lat: c[1], lon: c[0] })) : [pos, { lat: n.lat, lon: n.lon }];
  leg = { target: n.id, coords, dur: rt ? rt.duration : hav(pos, n) * 1.4 / 4.2, dist: rt ? rt.distance : hav(pos, n) * 1.4, steps: rt ? buildSteps(rt) : null, remainFrac: 1, real: !!rt };
  prepLeg(leg);
  spokenSteps = new Set();
  if (legLine) map.removeLayer(legLine);
  legLine = L.polyline(coords.map(p => [p.lat, p.lon]), { color: '#1f9d55', weight: 7, opacity: .9, dashArray: rt ? null : '8 10' }).addTo(map);
  if (lastTarget !== n.id) {
    lastTarget = n.id; follow = true;
    announceNext(n);
    const top = ($('#navTop').offsetHeight || 90) + 30, bot = ($('#navBottom').offsetHeight || 200) + 30;
    map.fitBounds(L.latLngBounds(coords.map(p => [p.lat, p.lon]).concat([[n.lat, n.lon]])), { paddingTopLeft: [40, top], paddingBottomRight: [80, bot], maxZoom: 18 });
    follow = false; setTimeout(() => { follow = true; }, 6000);
  }
  renderNav();
}
/* Ansage für den nächsten Stopp: in derselben Straße nur die Nummer */
let legBusy = false, lastStreet = null;
function announceNext(n) {
  if (!S.settings.voiceNav) return;
  const { str, hn } = splitAddr(n.street);
  let t = (str === lastStreet && hn) ? 'Weiter zu Nummer ' + hn.replace('/', ' Strich ') : 'Weiter zu ' + speakAddr(n);
  lastStreet = str;
  if (n.count > 1) t += '. ' + n.count + ' Blätter';
  if (n.name) t += '. ' + n.name;
  if (n.note) t += '. ' + n.note;
  const st = currentStep();
  if (st && !/Ziel/.test(st.text)) {
    if (st.dist > 25) { spokenSteps.add(st.i + 'pre'); t += '. In ' + Math.max(10, Math.round(st.dist / 10) * 10) + ' Metern ' + st.text.replace(/^./, c => c.toLowerCase()); }
    else { spokenSteps.add(st.i + 'now'); spokenSteps.add(st.i + 'done'); t += '. Jetzt ' + st.text.replace(/^./, c => c.toLowerCase()); }
  } else { const w = wayLeft(n); if (w != null && w > 30) t += '. Noch ' + Math.round(w / 10) * 10 + ' Meter'; }
  speak(t);
}
/* Liegt das Haus links oder rechts von der Fahrtrichtung? */
function houseSide(n) {
  let a = null, b = null;
  if (leg && leg.target === n.id && leg.real && leg.coords.length >= 2) {
    const c = leg.coords; b = c[c.length - 1];
    for (let i = c.length - 2; i >= 0; i--) if (hav(c[i], b) > 8) { a = c[i]; break; }
  }
  if (!a && pos && heading != null) { b = pos; a = { lat: pos.lat - Math.cos(heading * Math.PI / 180) * 1e-4, lon: pos.lon - Math.sin(heading * Math.PI / 180) * 1e-4 / Math.cos(pos.lat * Math.PI / 180) }; }
  if (!a || !b || hav(b, n) < 3) return null;
  const kx = Math.cos(b.lat * Math.PI / 180);
  const dx = (b.lon - a.lon) * kx, dy = b.lat - a.lat, hx = (n.lon - b.lon) * kx, hy = n.lat - b.lat;
  const cross = dx * hy - dy * hx;
  return Math.abs(cross) < 1e-12 ? null : cross > 0 ? 'links' : 'rechts';
}
function distToLine(p, line) {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) best = Math.min(best, distSeg(p, line[i], line[i + 1]));
  return line.length === 1 ? hav(p, line[0]) : best;
}
function distSeg(p, a, b) {
  const kx = 111320 * Math.cos(p.lat * Math.PI / 180), ky = 110540;
  const ax = (a.lon - p.lon) * kx, ay = (a.lat - p.lat) * ky, bx = (b.lon - p.lon) * kx, by = (b.lat - p.lat) * ky;
  const dx = bx - ax, dy = by - ay; const t = clamp(-(ax * dx + ay * dy) / ((dx * dx + dy * dy) || 1), 0, 1);
  return Math.hypot(ax + t * dx, ay + t * dy);
}
function prepLeg(l) {
  const c = l.coords; l.cum = [0];
  for (let i = 1; i < c.length; i++) l.cum.push(l.cum[i - 1] + hav(c[i - 1], c[i]));
  l.total = l.cum[l.cum.length - 1] || 0;
  if (l.steps) l.steps.forEach(st => st.along = projectAlong(l, st).along);
}
function projectAlong(l, p) {
  const c = l.coords; if (c.length < 2) return { d: hav(p, c[0]), along: 0 };
  const kx = 111320 * Math.cos(p.lat * Math.PI / 180), ky = 110540;
  let best = { d: Infinity, along: 0 };
  for (let i = 0; i < c.length - 1; i++) {
    const ax = (c[i].lon - p.lon) * kx, ay = (c[i].lat - p.lat) * ky, bx = (c[i + 1].lon - p.lon) * kx, by = (c[i + 1].lat - p.lat) * ky;
    const dx = bx - ax, dy = by - ay, t = clamp(-(ax * dx + ay * dy) / ((dx * dx + dy * dy) || 1), 0, 1);
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best.d) best = { d, along: l.cum[i] + t * (l.cum[i + 1] - l.cum[i]) };
  }
  return best;
}
/* Meter bis zum Haus über die Straße (nicht Luftlinie) */
function wayLeft(n) {
  if (!pos || !n) return null;
  if (leg && leg.target === n.id && leg.cum && leg.real) return Math.max(0, leg.total - projectAlong(leg, pos).along);
  return hav(pos, n) * 1.3;
}
function updateLegProgress() {
  if (!leg || !pos || !leg.cum) return;
  leg.remainFrac = clamp((leg.total - projectAlong(leg, pos).along) / Math.max(1, leg.total), 0, 1);
}
const DIRS = { left: 'links', right: 'rechts', 'slight left': 'leicht links', 'slight right': 'leicht rechts', 'sharp left': 'scharf links', 'sharp right': 'scharf rechts', straight: 'geradeaus', uturn: 'wenden' };
function buildSteps(rt) {
  const out = [];
  (rt.legs[0]?.steps || []).forEach((s, i) => {
    const m = s.maneuver; const mod = m.modifier || 'straight';
    if (m.type === 'depart') return;
    const road = s.name ? (s.ref ? s.name + ' (' + s.ref + ')' : s.name) : '';
    let text, icon = /left/.test(mod) ? ic.left : /right/.test(mod) ? ic.right : mod === 'uturn' ? ic.uturn : ic.straight;
    if (m.type === 'arrive') { text = 'Ziel erreicht – Briefkasten'; icon = ic.flag; }
    else if (m.type === 'roundabout' || m.type === 'rotary' || m.type === 'exit roundabout') { text = `Im Kreisverkehr ${m.exit ? m.exit + '. Ausfahrt' : 'ausfahren'}${road ? ' – ' + road : ''}`; icon = ic.round; }
    else if (mod === 'straight' && (m.type === 'new name' || m.type === 'continue')) { text = 'Geradeaus' + (road ? ' auf ' + road : ''); }
    else if (mod === 'uturn') text = 'Wenden';
    else text = `${DIRS[mod] ? DIRS[mod][0].toUpperCase() + DIRS[mod].slice(1) : 'Weiter'} abbiegen${road ? ' in ' + road : ''}`;
    out.push({ i, lat: m.location[1], lon: m.location[0], text, icon });
  });
  return out;
}
function currentStep() {
  if (!leg || !leg.steps || !pos) return null;
  const at = projectAlong(leg, pos).along;
  for (const s of leg.steps) { const d = s.along - at; if (d > -6 && !spokenSteps.has(s.i + 'done')) return Object.assign({}, s, { dist: Math.max(0, d) }); }
  return null;
}
function voiceStep() {
  if (!S.settings.voiceNav) return;
  const s = currentStep(); if (!s) return;
  if (s.dist < 18 && !spokenSteps.has(s.i + 'now')) { spokenSteps.add(s.i + 'now'); spokenSteps.add(s.i + 'done'); if (!/Ziel/.test(s.text)) speak(s.text); }
  else if (s.dist < 90 && s.dist > 28 && !spokenSteps.has(s.i + 'pre')) { spokenSteps.add(s.i + 'pre'); speak('In ' + Math.round(s.dist / 10) * 10 + ' Metern ' + s.text.replace(/^./, c => c.toLowerCase())); }
}
function speakAddr(s) { const { str, hn } = splitAddr(s.street); return str.replace(/str\./i, 'straße') + ' ' + hn.replace('/', ' Strich '); }
let voice;
function speak(t, force) {
  if (!('speechSynthesis' in window)) return;
  if (!force && !S.settings.voiceNav && !S.settings.voiceName) return;
  try {
    if (!voice) voice = speechSynthesis.getVoices().find(v => /^de/i.test(v.lang));
    const u = new SpeechSynthesisUtterance(t); u.lang = 'de-DE'; if (voice) u.voice = voice; u.rate = 1.02;
    if (speechSynthesis.pending) speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch (e) { }
}
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => { voice = null; };
let arriveEl = null;
function showArrive(s, manual) {
  closeArrive(); arriveShownFor = s.id;
  const n = nextStop(); const other = n && n.id !== s.id;
  const { str, hn } = splitAddr(s.street);
  const r = runRoute() || R(); const no = stopsOrdered(r).indexOf(s) + 1;
  arriveEl = document.createElement('div'); arriveEl.className = 'arrive' + (other ? ' other' : '');
  arriveEl.innerHTML = `<div class="ar-top"><span>Stopp ${no}${s.status === 'done' ? ' · ✓ schon erledigt' : ''}</span><button id="aX">${ic.x}</button></div>
    <div class="ar-mid"><div class="ar-hn">${esc(hn || '–')}</div><div class="ar-st">${esc(str)}</div>
      <div class="ar-name ${s.name ? '' : 'none'}">${s.name ? esc(s.name) : 'Kein Name eingetragen'}</div>
      ${s.count > 1 ? `<div class="ar-cnt">${s.count} Blätter einwerfen!</div>` : ''}
      ${s.note ? `<div class="ar-note">📝 ${esc(s.note)}</div>` : ''}
      ${other ? `<div class="ar-warn">Achtung: Das ist nicht der geplante nächste Stopp (${esc(n.street)}).</div>` : ''}</div>
    ${S.run ? `<button class="btn btn-g" id="aDone">${ic.check} Eingeworfen</button><button class="btn btn-ghost" id="aSkip">Überspringen</button>` : ''}`;
  document.body.appendChild(arriveEl);
  $('#aX', arriveEl).onclick = closeArrive;
  if (S.run) { $('#aDone', arriveEl).onclick = () => markDone(s); $('#aSkip', arriveEl).onclick = () => skipStop(s); }
  if (!manual) arrivalSignal(s);
}
function arrivalSignal(s) {
  const { hn } = splitAddr(s.street);
  {
    if (S.settings.vibrate && navigator.vibrate) navigator.vibrate([120, 60, 120]);
    if (S.settings.voiceName) speak(`${hn ? 'Nummer ' + hn.replace('/', ' Strich ') + '. ' : ''}${s.count > 1 ? s.count + ' Stück. ' : ''}${s.name || ''}${s.note ? '. ' + s.note : ''}`, true);
  }
}
function closeArrive() { if (arriveEl) { arriveEl.remove(); arriveEl = null; } }

/* ---------- Fahrmodus: große Anzeige statt Karte ---------- */
let driveEl = null, driveArrived = null;
function openDrive() {
  if (!S.run) return;
  S.settings.driveMode = true; save();
  if (!driveEl) { driveEl = document.createElement('div'); driveEl.className = 'drive'; document.body.appendChild(driveEl); }
  renderDrive();
}
function closeDrive(keepSetting) {
  if (driveEl) { driveEl.remove(); driveEl = null; }
  if (!keepSetting) { S.settings.driveMode = false; save(); }
}
function renderDrive() {
  if (!driveEl || !S.run) return;
  const r = runRoute(); const n = nextStop();
  if (!r) return;
  const total = r.stops.length, done = r.stops.filter(x => x.status !== 'open').length;
  const est = remainingEstimate(); const end = est ? Date.now() + est.sec * 1000 : null;
  const voice = S.settings.voiceNav;
  if (!n) { driveEl.className = 'drive here'; driveEl.innerHTML = `<div class="dv-top"><span></span><button id="dvX" class="dv-x">${ic.map}<small>Karte</small></button></div><div class="dv-mid"><div class="dv-hn">✓</div><div class="dv-st">Alle Briefkästen erledigt!</div></div>`; $('#dvX', driveEl).onclick = () => closeDrive(); return; }
  const here = driveArrived === n.id;
  const { str, hn } = splitAddr(n.street);
  const d = pos ? hav(pos, n) : null;
  const stp = !here && leg && leg.target === n.id ? currentStep() : null;
  let dir;
  const side = here ? houseSide(n) : null;
  if (here && side) dir = `<div class="dv-dir dv-side">${side === 'links' ? ic.left2 : ic.right2}<div><b>Haus ${side}</b><small>Du bist da</small></div></div>`;
  else if (here) dir = `<div class="dv-dir">${ic.flag}<div><b>Du bist da</b><small>Briefkasten einwerfen</small></div></div>`;
  else if (stp && !/Ziel/.test(stp.text)) dir = `<div class="dv-dir">${stp.icon}<div><b>In ${fmtKm(stp.dist)}</b><small>${esc(stp.text)}</small></div></div>`;
  else dir = `<div class="dv-dir">${ic.straight}<div><b>${wayLeft(n) != null ? 'Noch ' + fmtKm(wayLeft(n)) : 'Weiter'}</b><small>bis zum Haus</small></div></div>`;
  driveEl.className = 'drive' + (here ? ' here' : '');
  driveEl.innerHTML = `
    <div class="dv-top"><button id="dvV" class="dv-x ${voice ? 'on' : ''}">${voice ? ic.vol : ic.mute}<small>${voice ? 'Ansage an' : 'Ansage aus'}</small></button>
      <span class="dv-prog">${done} / ${total}${end ? ` · fertig ${fmtTime(end)}` : ''}</span>
      <button id="dvX" class="dv-x">${ic.map}<small>Karte</small></button></div>
    ${dir}
    <div class="dv-mid"><div class="dv-hn">${esc(hn || '–')}</div><div class="dv-st">${esc(str)}</div>
      <div class="ar-name ${n.name ? '' : 'none'}">${n.name ? esc(n.name) : 'Kein Name eingetragen'}</div>
      ${n.count > 1 ? `<div class="ar-cnt">${n.count} Blätter einwerfen!</div>` : ''}
      ${n.note ? `<div class="ar-note">📝 ${esc(n.note)}</div>` : ''}</div>
    <button class="btn btn-g" id="dvDone">${ic.check} Eingeworfen</button>
    <button class="btn btn-ghost" id="dvSkip">Überspringen</button>`;
  $('#dvX', driveEl).onclick = () => closeDrive();
  $('#dvV', driveEl).onclick = () => { S.settings.voiceNav = !S.settings.voiceNav; save(); if (S.settings.voiceNav) { speak('Sprachansagen an', true); maybeLeg(true); } renderNav(); };
  $('#dvDone', driveEl).onclick = () => { driveArrived = null; markDone(n); };
  $('#dvSkip', driveEl).onclick = () => { driveArrived = null; skipStop(n); };
}

/* ---------- Einstellungen ---------- */
function openSettings() {
  const st = S.settings;
  const tog = (k, l) => `<div class="row"><div class="l">${l}</div><button class="tog ${st[k] ? 'on' : ''}" data-t="${k}"></button></div>`;
  const card = (icon, title, inner) => `<div class="set-card"><div class="set-ct">${icon}<span>${title}</span></div>${inner}</div>`;
  const pg = openPage(`<div class="page-h"><button class="icon-btn" data-close>${ic.back}</button><h1>Einstellungen</h1><span style="width:46px"></span></div>
  <div class="page-b set-page">
    ${card(ic.home, 'Start', `
      <div class="link-row" id="eHome"><span>Startadresse<br><small class="sub">${st.home.label ? esc(st.home.label + ', ' + st.home.zip + ' ' + st.home.city) + (st.home.lat == null ? ' · nicht gefunden' : '') : '–'}</small></span>${ic.chev.replace('<svg', '<svg class="chev"')}</div>`)}
    ${card(ic.map, 'Unterwegs', `
      <div class="row"><div class="l">Tempo</div><div class="step"><button data-s="speed" data-d="-1">−</button><span>${st.speed} km/h</span><button data-s="speed" data-d="1">+</button></div></div>
      <div class="row"><div class="l">Berg vermeiden</div><div class="seg" id="eHill">${['Aus', 'Etwas', 'Stark'].map((l, i) => `<button data-v="${i}" class="${st.hill === i ? 'sel' : ''}">${l}</button>`).join('')}</div></div>
      <div class="row"><div class="l">Ankunft ab</div><div class="seg" id="eRad">${[15, 25, 40].map(v => `<button data-v="${v}" class="${st.radius === v ? 'sel' : ''}">${v} m</button>`).join('')}</div></div>`)}
    ${card(ic.check, 'Automatisch abhaken', `
      ${tog('autoDone', 'An')}
      <div id="eAutoBox" style="${st.autoDone ? '' : 'display:none'}">
        <div class="row"><div class="l">Stehen bleiben</div><div class="step"><button data-s="autoSec" data-d="-1">−</button><span>${st.autoSec} s</span><button data-s="autoSec" data-d="1">+</button></div></div>
        <div class="row"><div class="l">Abstand</div><div class="seg" id="eARad">${[10, 15, 25].map(v => `<button data-v="${v}" class="${st.autoRad === v ? 'sel' : ''}">${v} m</button>`).join('')}</div></div>
      </div>`)}
    ${card(ic.vol, 'Ton & Ansagen', `
      ${tog('voiceName', 'Name vorlesen')}
      ${tog('clickSound', 'Ton beim Abhaken')}
      ${tog('vibrate', 'Vibrieren')}`)}
    ${card(ic.layers, 'Anzeige', `
      <div class="row"><div class="l">Design</div><div class="seg" id="eTheme">${[['light', 'Hell'], ['dark', 'Dunkel'], ['system', 'System']].map(([v, l]) => `<button data-v="${v}" class="${st.theme === v ? 'sel' : ''}">${l}</button>`).join('')}</div></div>
      ${tog('keepAwake', 'Bildschirm bleibt an')}`)}
    ${card(ic.clock, 'Erinnerung Austragetag', `
      ${tog('dayOn', 'An')}
      <div id="eDayBox" style="${st.dayOn ? '' : 'display:none'}">
        <div class="row"><div class="l">Nächster Termin</div><input type="date" id="eDay" class="date-in" value="${st.dayNext || ''}"></div>
        <div class="row"><div class="l">Alle</div><div class="seg" id="eEvery">${[[7, '1 Wo.'], [14, '2 Wo.'], [28, '4 Wo.']].map(([v, l]) => `<button data-v="${v}" class="${st.dayEvery === v ? 'sel' : ''}">${l}</button>`).join('')}</div></div>
        <div class="row"><div class="l">Wann</div><div class="seg" id="eWhen">${[['before', 'Tag davor'], ['same', 'Am Tag']].map(([v, l]) => `<button data-v="${v}" class="${st.remindWhen === v ? 'sel' : ''}">${l}</button>`).join('')}</div></div>
        <div class="row"><div class="l">Uhrzeit</div><input type="time" id="eTime" class="date-in" value="${st.remindTime}"></div>
        <div class="field"><label>Text</label><input id="eText" value="${esc(st.remindText)}"></div>
        <div class="link-row" id="eCalG"><span>In Google Kalender</span>${ic.chev.replace('<svg', '<svg class="chev"')}</div>
        <div class="link-row" id="eCalI"><span>Kalender-Datei (.ics)</span>${ic.chev.replace('<svg', '<svg class="chev"')}</div>
      </div>`)}
    ${card(ic.download, 'Erinnerung Backup', `
      ${tog('backupOn', 'An')}
      <div id="eBakBox" style="${st.backupOn ? '' : 'display:none'}">
        <div class="row"><div class="l">Alle</div><div class="seg" id="eBEvery">${[[7, '1 Wo.'], [14, '2 Wo.'], [28, '4 Wo.']].map(([v, l]) => `<button data-v="${v}" class="${st.backupEvery === v ? 'sel' : ''}">${l}</button>`).join('')}</div></div>
        <div class="row"><div class="l">Tag</div><select id="eBDay" class="date-in">${['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'].map((l, i) => `<option value="${i}" ${st.backupDay === i ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="row"><div class="l">Uhrzeit</div><input type="time" id="eBTime" class="date-in" value="${st.backupTime}"></div>
        <div class="link-row" id="eBCalG"><span>In Google Kalender</span>${ic.chev.replace('<svg', '<svg class="chev"')}</div>
        <div class="link-row" id="eBCalI"><span>Kalender-Datei (.ics)</span>${ic.chev.replace('<svg', '<svg class="chev"')}</div>
      </div>`)}
    ${card(ic.csv, 'Daten', `
      <div class="link-row" id="eBak"><span>Backup speichern<br><small class="sub">${S.lastBackup ? 'zuletzt ' + fmtDate(S.lastBackup) : 'noch keins'}</small></span>${ic.chev.replace('<svg', '<svg class="chev"')}</div>
      <div class="link-row" id="eRes"><span>Backup laden</span>${ic.chev.replace('<svg', '<svg class="chev"')}</div>
      <div class="link-row red" id="eWipe"><span>Alles löschen</span></div>`)}
    <div class="help" style="font-size:13px;padding-top:18px">Oli Zeitung ${VERSION} · © OpenStreetMap, Esri, OSRM, Open-Meteo</div>
  </div>`, { onClose: () => { drawMarkers(); renderSheet(); } });
  const el = pg.el; const re = () => { pg.close(); openSettings(); };
  el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { st[b.dataset.t] = !st[b.dataset.t]; b.classList.toggle('on', st[b.dataset.t]); save(); const boxes = { autoDone: '#eAutoBox', dayOn: '#eDayBox', backupOn: '#eBakBox' }; if (boxes[b.dataset.t]) $(boxes[b.dataset.t], el).style.display = st[b.dataset.t] ? '' : 'none'; if (b.dataset.t === 'returnHome') S.routes.forEach(r => r.optimized && (r.optimized = false)); });
  el.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { const k = b.dataset.s; st[k] = k === 'speed' ? clamp(st[k] + +b.dataset.d, 6, 25) : k === 'autoSec' ? clamp(st[k] + +b.dataset.d, 2, 60) : clamp(st[k] + +b.dataset.d, 1, 120); b.parentNode.querySelector('span').textContent = st[k] + (k === 'speed' ? ' km/h' : ' s'); S.routes.forEach(recomputePlan); save(); });
  el.querySelectorAll('#eHill button').forEach(b => b.onclick = () => { st.hill = +b.dataset.v; el.querySelectorAll('#eHill button').forEach(x => x.classList.toggle('sel', x === b)); S.routes.forEach(r => r.optimized = false); save(); toast('Bitte Route neu optimieren'); });
  el.querySelectorAll('#eRad button').forEach(b => b.onclick = () => { st.radius = +b.dataset.v; el.querySelectorAll('#eRad button').forEach(x => x.classList.toggle('sel', x === b)); save(); });
  $('#eHome', el).onclick = async () => {
    const v = await dialog({ title: 'Startadresse', input: { value: st.home.label ? st.home.label + ', ' + st.home.zip + ' ' + st.home.city : '', placeholder: 'Straße Nr, PLZ Ort' }, buttons: [{ label: 'Abbrechen', value: false }, { label: 'Suchen', cls: 'btn-p', value: true }] });
    if (!v) return; st.home = Object.assign(parseAddr(v), { lat: null, lon: null, ele: null });
    const b = busy('Startadresse wird gesucht'); await geocodeHome(); b.close();
    S.routes.forEach(r => { r.optimized = false; r.matrix = null; }); save();
    toast(st.home.lat != null ? 'Gefunden ✓ – bitte Routen neu optimieren' : 'Nicht gefunden – kein Internet?'); re();
  };
  const segSet = (sel, key, num) => el.querySelectorAll(sel + ' button').forEach(b => b.onclick = () => { st[key] = num ? +b.dataset.v : b.dataset.v; el.querySelectorAll(sel + ' button').forEach(x => x.classList.toggle('sel', x === b)); save(); });
  segSet('#eARad', 'autoRad', true);
  el.querySelectorAll('#eTheme button').forEach(b => b.onclick = () => { st.theme = b.dataset.v; el.querySelectorAll('#eTheme button').forEach(x => x.classList.toggle('sel', x === b)); save(); applyTheme(); });
  segSet('#eEvery', 'dayEvery', true); segSet('#eWhen', 'remindWhen'); segSet('#eBEvery', 'backupEvery', true);
  $('#eDay', el).onchange = e => { st.dayNext = e.target.value || null; save(); };
  $('#eTime', el).onchange = e => { st.remindTime = e.target.value || '18:00'; save(); };
  $('#eText', el).oninput = e => { st.remindText = e.target.value; save(); };
  $('#eBDay', el).onchange = e => { st.backupDay = +e.target.value; save(); };
  $('#eBTime', el).onchange = e => { st.backupTime = e.target.value || '19:00'; save(); };
  $('#eCalG', el).onclick = () => calendarDelivery('google');
  $('#eCalI', el).onclick = () => calendarDelivery('ics');
  $('#eBCalG', el).onclick = () => calendarBackup('google');
  $('#eBCalI', el).onclick = () => calendarBackup('ics');
  $('#eBak', el).onclick = () => backupNow();
  $('#eRes', el).onclick = () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => { try { const d = JSON.parse(await inp.files[0].text()); if (!Array.isArray(d.routes)) throw 0; if (!(await confirmDlg('Backup laden?', `${d.routes.length} Routen. Deine jetzigen Daten werden ersetzt.`, 'Laden'))) return; S = Object.assign(structuredClone(DEFAULTS), d); S.settings = Object.assign(structuredClone(DEFAULTS.settings), d.settings); save(true); location.reload(); } catch (e) { toast('Das ist keine gültige Backup-Datei'); } };
    inp.click();
  };
  $('#eWipe', el).onclick = async () => { if (await confirmDlg('Wirklich alles löschen?', 'Alle Routen, Namen und Einstellungen werden von diesem Handy gelöscht.', 'Alles löschen', 'btn-r')) { localStorage.removeItem(KEY); localStorage.removeItem('olli.unlocked'); location.reload(); } };
}
/* ---------- Austragetag & Backup-Erinnerung ---------- */
const isoDay = d => { const x = new Date(d); return x.getFullYear() + '-' + pad2(x.getMonth() + 1) + '-' + pad2(x.getDate()); };
function nextDeliveryDay(from = new Date()) {
  const st = S.settings; if (!st.dayNext) return null;
  const d = new Date(st.dayNext + 'T00:00:00'); const today = new Date(isoDay(from) + 'T00:00:00');
  while (d < today) d.setDate(d.getDate() + st.dayEvery);
  return d;
}
function dayIn(d) {
  const t = new Date(isoDay(new Date()) + 'T00:00:00'), days = Math.round((new Date(isoDay(d) + 'T00:00:00') - t) / 864e5);
  const dm = pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.';
  return days === 0 ? '<b>heute</b>' : days === 1 ? `<b>morgen</b> (${dm})` : `in <b>${days} Tagen</b> (${dm})`;
}
const fmtDay = d => d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
function calendarEvent(kind, { title, text, start, weeks, file }) {
  const end = new Date(start.getTime() + 15 * 60000);
  const f = x => x.getFullYear() + pad2(x.getMonth() + 1) + pad2(x.getDate()) + 'T' + pad2(x.getHours()) + pad2(x.getMinutes()) + '00';
  const rule = `RRULE:FREQ=WEEKLY;INTERVAL=${weeks}`;
  if (kind === 'google') {
    window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&details=${encodeURIComponent(text)}&dates=${f(start)}/${f(end)}&recur=${encodeURIComponent(rule)}`, '_blank');
    return;
  }
  const icsEsc = t => String(t).replace(/([,;\\])/g, '\\$1');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Oli Zeitung//DE', 'BEGIN:VEVENT', 'UID:' + uid() + '@oli-zeitung', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z',
    'DTSTART:' + f(start), 'DTEND:' + f(end), rule, 'SUMMARY:' + icsEsc(title), 'DESCRIPTION:' + icsEsc(text),
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(title), 'TRIGGER:PT0M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  download(file, ics, 'text/calendar');
  toast('Datei antippen → mit Kalender öffnen');
}
const atTime = (d, t) => { const [h, m] = (t || '18:00').split(':').map(Number); const x = new Date(d); x.setHours(h, m, 0, 0); return x; };
function calendarDelivery(kind) {
  const st = S.settings; const d = nextDeliveryDay();
  if (!d) return toast('Erst den nächsten Austragetag auswählen');
  const day = new Date(d); if (st.remindWhen === 'before') day.setDate(day.getDate() - 1);
  let start = atTime(day, st.remindTime);
  if (start < new Date()) start.setDate(start.getDate() + st.dayEvery);
  calendarEvent(kind, { title: st.remindText || 'Zeitung austragen', text: (st.remindWhen === 'before' ? 'Morgen' : 'Heute') + ' ist Austragetag. Oli Zeitung öffnen und Route starten.', start, weeks: st.dayEvery / 7, file: 'erinnerung-austragetag.ics' });
}
function calendarBackup(kind) {
  const st = S.settings; const d = new Date();
  d.setDate(d.getDate() + ((st.backupDay - d.getDay() + 7) % 7));
  let start = atTime(d, st.backupTime); if (start < new Date()) start.setDate(start.getDate() + 7);
  calendarEvent(kind, { title: 'Oli Zeitung: Backup machen 💾', text: 'App öffnen → Einstellungen → Backup herunterladen.', start, weeks: st.backupEvery / 7, file: 'erinnerung-backup.ics' });
}
function backupNow() {
  download('oli-zeitung-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(Object.assign({}, S, { pw: null, run: null })), 'application/json');
  S.lastBackup = Date.now(); save(true); toast('Backup gespeichert (Ordner „Downloads“)');
}
async function startupReminders() {
  const st = S.settings, today = isoDay(new Date());
  const d = st.dayOn ? nextDeliveryDay() : null;
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const isToday = d && isoDay(d) === today, isTomorrow = d && st.remindWhen === 'before' && isoDay(d) === isoDay(tomorrow);
  if ((isToday || isTomorrow) && S.dayGreeted !== today && !S.run) {
    S.dayGreeted = today; save();
    const v = await dialog({ title: esc(st.remindText || 'Zeitung austragen'), text: isToday ? 'Heute ist Austragetag. Viel Erfolg bei der Runde!' : 'Morgen ist Austragetag.', buttons: isToday ? [{ label: 'Später', value: 0 }, { label: `${ic.play} Route starten`, cls: 'btn-p', value: 1 }] : [{ label: 'OK', cls: 'btn-p', value: 0 }] });
    if (v) pickRoute();
    return;
  }
  const hasData = S.routes.some(r => r.stops.length);
  const DAY = 864e5;
  if (st.backupOn && hasData && !S.run && (!S.lastBackup || Date.now() - S.lastBackup > st.backupEvery * DAY) && (!S.backupAsked || Date.now() - S.backupAsked > 2 * DAY)) {
    S.backupAsked = Date.now(); save();
    const v = await dialog({ title: 'Backup machen? 💾', text: S.lastBackup ? `Dein letztes Backup ist vom ${fmtDate(S.lastBackup)}. Sichere deine Routen und Namen, falls Chrome-Daten mal gelöscht werden.` : 'Du hast noch kein Backup. Wenn Chrome-Daten gelöscht werden, wären deine Routen und Namen weg. Die Datei landet in „Downloads“.', buttons: [{ label: 'Später', value: 0 }, { label: 'Jetzt sichern', cls: 'btn-p', value: 1 }] });
    if (v) backupNow();
  }
}

function openHelp() {
  openPage(`<div class="page-h"><button class="icon-btn" data-close>${ic.back}</button><h1>So geht's</h1><span style="width:46px"></span></div>
  <div class="page-b help">
    <h3>1. Route anlegen</h3>Menü (☰) → „Route erstellen“. Dann CSV-Datei laden (Spalten: Adresse;PLZ;Ort;Name;Notiz) oder Adressen oben in der Liste suchen.
    <h3>2. Namen eintragen</h3>Liste hochziehen → Stopp antippen → „Name auf dem Briefkasten“. Der Name wird dir vor dem Haus groß angezeigt.
    <h3>3. Optimieren</h3>„Optimieren“ sucht die schnellste Reihenfolge – mit Start an deiner Startadresse. Der Berg wird dabei gemieden (einstellbar). Du siehst, ob Zurückfahren oder woanders aufhören schneller ist.
    <h3>4. Losfahren</h3>„Route starten“ → Route auswählen. Die grüne Linie zeigt den Weg zum nächsten Haus. Vor dem Haus erscheint automatisch Hausnummer + Name. Dann „Eingeworfen“ tippen.
    <h3>Tipps</h3>• Pins, die falsch stehen: Stopp → „Position auf Karte korrigieren“.<br>• „Pause“ hält die Zeit an.<br>• Bildschirm bleibt während der Route an – Akku im Blick behalten.<br>• Die App funktioniert auch ohne Internet weiter (Liste, Abhaken, Namen). Nur die Wege-Linie braucht Netz.
    <h3>Auf den Startbildschirm</h3>In Chrome: ⋮ → „Zum Startbildschirm hinzufügen“ / „App installieren“.
  </div>`);
}

/* ---------- Start ---------- */
async function main() {
  load(); applyTheme();
  initMap();
  $('#btnMenu').innerHTML = ic.menu; $('#btnLayer').innerHTML = ic.layers; $('#btnLocate').innerHTML = ic.locate; $('#btnFit').innerHTML = ic.map;
  $('#btnMenu').onclick = openDrawer; $('#scrim').onclick = closeDrawer;
  $('#btnLayer').onclick = () => setSat(!sat);
  $('#btnDrive').innerHTML = ic.drive; $('#btnDrive').onclick = openDrive;
  if (S.settings.sat) setSat(true, true);
  $('#btnLocate').onclick = () => { startGPS(); follow = true; if (pos) map.setView([pos.lat, pos.lon], Math.max(map.getZoom(), 17)); else toast('Standort wird gesucht…'); };
  $('#btnFit').onclick = () => fitAll();
  initSheetDrag();
  if (!S.activeId && S.routes[0]) S.activeId = S.routes[0].id;
  drawMarkers(); drawRouteLine(); renderSheet(); fitAll();
  startGPS();
  if (S.run && runRoute()) enterNav(); else S.run = null;
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
  if (S.routes.length) setTimeout(startupReminders, 800);
  if (!S.routes.length) setTimeout(() => dialog({ title: 'Hallo 👋', buttons: [{ label: 'Später', value: 0 }, { label: 'Route erstellen', cls: 'btn-p', value: 1 }] }).then(v => v && createRoute()), 400);
}
window.addEventListener('error', e => { console.error(e.error || e.message); });
main();
