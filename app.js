/* Oli Zeitung – Austrage-App
   Alle Daten bleiben nur auf diesem Handy (localStorage). */
'use strict';

const VERSION = 'Beta 2.0';
const KEY = 'olli.beta', MAIN_KEY = 'olli.v1', BETA = true;
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
/* ---------- Karte: kleine Brücke zu MapLibre (Beta) ----------
   Die App spricht weiter „Leaflet-Sprache“ (L.marker, L.polyline …),
   gezeichnet wird aber mit MapLibre (live, drehbar, Schrift bleibt aufrecht).
   Leaflet-Zoom = MapLibre-Zoom + 1 (MapLibre rechnet mit 512er Kacheln). */
const ML_STYLES = { light: 'https://tiles.openfreemap.org/styles/liberty', dark: 'https://tiles.openfreemap.org/styles/fiord' };
const ML_FALLBACK = { version: 8, sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap-Mitwirkende' } }, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#eef0f4' } }, { id: 'osm', type: 'raster', source: 'osm' }] };
const L = (() => {
  let uidN = 0; const nid = p => 'olli-' + p + '-' + (++uidN);
  const ll = x => Array.isArray(x) ? { lat: x[0], lng: x[1] } : { lat: x.lat, lng: x.lng != null ? x.lng : x.lon };
  const lnglat = x => { const p = ll(x); return [p.lng, p.lat]; };
  class LMap {
    constructor(id, style) {
      this.ready = false; this.q = []; this.overlays = []; this.handlers = new Map(); this.live = new Set(); this.styleUrl = style; this.gen = 0;
      this.ml = new maplibregl.Map({ container: id, style, center: [10.45, 51.16], zoom: 5, maxZoom: 19.5, maxPitch: 60, attributionControl: { compact: true }, fadeDuration: 0 });
      this.attributionControl = { setPrefix() { } };
      this.ml.on('style.load', () => {
        this.ready = true; this.overlays = [];
        [...this.live].forEach(o => o._add());          // nach einem Stil-Wechsel alles wieder auflegen
        const q = this.q; this.q = []; q.forEach(f => f());
        if (this.onstyle) this.onstyle(!!this.fell);
      });
      this.ml.on('error', () => { const g = this.gen; if (!this.ready) setTimeout(() => this.fallback(g), 1500); });
      this.watch();
    }
    /* Lädt der Kartenstil nicht, kommt die einfache OSM-Karte */
    watch() { const g = this.gen; setTimeout(() => this.fallback(g), TEST ? 4000 : 9000); }
    fallback(g) { if (g !== this.gen || this.ready || this.fell) return; this.fell = true; this.ml.setStyle(ML_FALLBACK); }
    restyle(url) { if (url === this.styleUrl && !this.fell) return; this.styleUrl = url; this.gen++; this.ready = false; this.fell = false; this.ml.setStyle(url); this.watch(); }
    when(f) { this.ready ? f() : this.q.push(f); }
    setView(c, z) { this.ml.jumpTo({ center: lnglat(c), zoom: z != null ? z - 1 : this.ml.getZoom() }); return this; }
    panTo(c) { this.ml.easeTo({ center: lnglat(c), duration: 500 }); return this; }
    getZoom() { return this.ml.getZoom() + 1; }
    getCenter() { const c = this.ml.getCenter(); return { lat: c.lat, lng: c.lng }; }
    fitBounds(b, o = {}) {
      const pts = b.pts.map(lnglat); if (!pts.length) return this;
      const lo = pts.map(p => p[0]), la = pts.map(p => p[1]);
      const [l, t] = o.paddingTopLeft || [20, 20], [r, bo] = o.paddingBottomRight || [20, 20];
      const W = this.ml.getContainer().clientWidth, H = this.ml.getContainer().clientHeight;
      const pad = { left: Math.min(l, W / 3), right: Math.min(r, W / 3), top: Math.min(t, H / 2.5), bottom: Math.min(bo, H / 2.5) };
      try { this.ml.fitBounds([[Math.min(...lo), Math.min(...la)], [Math.max(...lo), Math.max(...la)]], { padding: pad, maxZoom: (o.maxZoom || 18) - 1, bearing: 0, pitch: 0, duration: 500 }); } catch (e) { }
      return this;
    }
    on(ev, fn) { const w = ev === 'click' ? e => fn({ latlng: { lat: e.lngLat.lat, lng: e.lngLat.lng } }) : fn; this.handlers.set(fn, w); this.ml.on(ev, w); return this; }
    off(ev, fn) { const w = this.handlers.get(fn); if (w) this.ml.off(ev, w); this.handlers.delete(fn); return this; }
    removeLayer(x) { if (x) x.remove(); return this; }
    /* Linien und Kreis liegen immer über Karte + Satellit */
    firstOverlay() { return this.overlays.find(id => this.ml.getLayer(id)); }
  }
  class Tile {
    constructor(url, o = {}) { this.url = url; this.o = o; this.id = nid('tile'); }
    addTo(m) { this.map = m; m.live.add(this); m.when(() => this._add()); return this; }
    _add() {
      const m = this.map; if (!m || !m.ready) return; const ml = m.ml; if (ml.getLayer(this.id)) return;
      if (!ml.getSource(this.id)) ml.addSource(this.id, { type: 'raster', tiles: [this.url], tileSize: 256, maxzoom: this.o.maxNativeZoom || 19, attribution: this.o.attribution || '' });
      ml.addLayer({ id: this.id, type: 'raster', source: this.id, paint: { 'raster-opacity': this.o.opacity != null ? this.o.opacity : 1, 'raster-fade-duration': 0 } }, m.firstOverlay());
    }
    remove() { const m = this.map; this.map = null; if (m) { m.live.delete(this); if (m.ready && m.ml.getLayer(this.id)) m.ml.removeLayer(this.id); } return this; }
  }
  class Group {
    constructor(list = []) { this.list = list.slice(); this.map = null; }
    addTo(m) { this.map = m; this.list.forEach(x => x.addTo(m)); return this; }
    clearLayers() { this.list.forEach(x => x.remove()); this.list = []; return this; }
    remove() { this.list.forEach(x => x.remove()); this.map = null; return this; }
  }
  class Marker {
    constructor(c, o = {}) {
      this.o = o;
      this.el = document.createElement('div'); this.el.className = 'olli-mk';
      if (o.interactive === false) this.el.style.pointerEvents = 'none';
      const al = o.rotationAlignment || 'viewport';
      this.mk = new maplibregl.Marker({ element: this.el, draggable: !!o.draggable, rotationAlignment: al, pitchAlignment: al }).setLngLat(lnglat(c));
      this.setIcon(o.icon);
    }
    setIcon(icon) {
      if (!icon) return this; const [w, h] = icon.size, [ax, ay] = icon.anchor;
      this.el.style.width = w + 'px'; this.el.style.height = h + 'px'; this.el.innerHTML = icon.html;
      this.mk.setOffset([w / 2 - ax, h / 2 - ay]);
      this.el.style.zIndex = String(10 + (this.o.zIndexOffset || 0)); return this;
    }
    addTo(t) {
      if (t instanceof Group) { t.list.push(this); if (t.map) this.addTo(t.map); return this; }
      this.map = t; this.mk.addTo(t.ml); this.el.style.zIndex = String(10 + (this.o.zIndexOffset || 0)); return this;
    }
    setLatLng(c) { this.mk.setLngLat(lnglat(c)); return this; }
    getLatLng() { const p = this.mk.getLngLat(); return { lat: p.lat, lng: p.lng }; }
    getElement() { return this.el; }
    on(ev, fn) { if (ev === 'click') this.el.addEventListener('click', e => { e.stopPropagation(); fn(e); }); return this; }
    bindTooltip(t) { const d = document.createElement('div'); d.innerHTML = t; this.el.title = d.textContent; return this; }
    remove() { this.mk.remove(); this.map = null; return this; }
  }
  /* Linien und Kreise als GeoJSON-Ebenen */
  class Shape {
    constructor(o) { this.o = o; this.id = nid('shape'); }
    addTo(m) { this.map = m; m.live.add(this); m.when(() => this._add()); return this; }
    _add() {
      const m = this.map; if (!m || !m.ready) return; const ml = m.ml;
      if (!ml.getSource(this.id)) ml.addSource(this.id, { type: 'geojson', data: this.geo() });
      if (!ml.getLayer(this.id)) { ml.addLayer(this.layer()); m.overlays.push(this.id); }
      if (this.back) this.bringToBack();
    }
    update() { if (this.map && this.map.ready) { const s = this.map.ml.getSource(this.id); if (s) s.setData(this.geo()); } }
    bringToBack() {
      this.back = true; const m = this.map; if (!m || !m.ready || !m.ml.getLayer(this.id)) return this;
      m.overlays = [this.id].concat(m.overlays.filter(x => x !== this.id));
      const next = m.overlays.slice(1).find(id => m.ml.getLayer(id)); if (next) m.ml.moveLayer(this.id, next);
      return this;
    }
    remove() {
      const m = this.map; this.map = null; if (!m) return this;
      m.live.delete(this); m.overlays = m.overlays.filter(x => x !== this.id);
      if (m.ready) { if (m.ml.getLayer(this.id)) m.ml.removeLayer(this.id); if (m.ml.getSource(this.id)) m.ml.removeSource(this.id); }
      return this;
    }
  }
  class Polyline extends Shape {
    constructor(pts, o = {}) { super(o); this.pts = pts.map(lnglat); }
    geo() { return { type: 'Feature', geometry: { type: 'LineString', coordinates: this.pts } }; }
    layer() {
      const w = this.o.weight || 4, p = { 'line-color': this.o.color || '#2970ff', 'line-width': w, 'line-opacity': this.o.opacity != null ? this.o.opacity : 1 };
      if (this.o.dashArray) p['line-dasharray'] = this.o.dashArray.split(/[ ,]+/).map(v => +v / w);
      return { id: this.id, type: 'line', source: this.id, layout: { 'line-join': 'round', 'line-cap': this.o.dashArray ? 'butt' : 'round' }, paint: p };
    }
  }
  class Circle extends Shape {
    constructor(c, o = {}) { super(o); this.c = ll(c); this.r = o.radius || 10; }
    setLatLng(c) { this.c = ll(c); this.update(); return this; }
    setRadius(r) { this.r = r; this.update(); return this; }
    geo() {
      const pts = [], k = Math.cos(this.c.lat * Math.PI / 180);
      for (let i = 0; i <= 40; i++) { const a = i / 40 * 2 * Math.PI; pts.push([this.c.lng + Math.sin(a) * this.r / (111320 * k), this.c.lat + Math.cos(a) * this.r / 110540]); }
      return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [pts] } };
    }
    layer() { return { id: this.id, type: 'fill', source: this.id, paint: { 'fill-color': this.o.fillColor || '#2970ff', 'fill-opacity': this.o.fillOpacity != null ? this.o.fillOpacity : .2 } }; }
  }
  return {
    map: (id, style) => new LMap(id, style),
    tileLayer: (u, o) => new Tile(u, o),
    layerGroup: l => new Group(l),
    marker: (c, o) => new Marker(c, o),
    divIcon: o => ({ html: o.html, size: o.iconSize, anchor: o.iconAnchor || [o.iconSize[0] / 2, o.iconSize[1] / 2] }),
    polyline: (p, o) => new Polyline(p, o),
    circle: (c, o) => new Circle(c, o),
    latLngBounds: pts => ({ pts })
  };
})();

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
  round: I('<circle cx="12" cy="10" r="4"/><path d="M12 14v7M15 7l4-4M19 7V3h-4"/>', 2.4),
  list: I('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor"/>', 2.2),
  set: I('<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2.2"/><circle cx="8" cy="17" r="2.2"/>', 2.2)
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
    design: null, tilt3d: true, clickSound: true,
    dayOn: true, dayNext: null, dayEvery: 14, remindWhen: 'before',
    backupOn: true, backupEvery: 14
  },
  routes: [], activeId: null, run: null, pw: null, lastBackup: null, backupAsked: null, dayGreeted: null
};
let S;
let copiedFromMain = false;
function copyFromMain() {
  try { const m = localStorage.getItem(MAIN_KEY); if (!m) return false; const d = JSON.parse(m); d.run = null; localStorage.setItem(KEY, JSON.stringify(d)); return true; } catch (e) { return false; }
}
function load() {
  try { if (!localStorage.getItem(KEY)) copiedFromMain = copyFromMain(); } catch (e) { }
  try { S = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { S = {}; }
  S = Object.assign(structuredClone(DEFAULTS), S);
  S.settings = Object.assign(structuredClone(DEFAULTS.settings), S.settings || {});
  if (!DESIGNS[S.settings.design]) S.settings.design = S.settings.theme === 'dark' ? 'B' : 'C';
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
async function osrmRoute(pts, steps = false, extra = '') {
  const res = await getJSON(`${API.osrm}/route/v1/driving/${coordStr(pts)}?overview=full&geometries=geojson&steps=${steps}${extra}`, 20000);
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

/* Drei Designs: nur Farben und Formen, der Aufbau bleibt gleich */
const DESIGNS = { A: { name: 'Wegweiser', dark: false, bar: '#ffffff' }, B: { name: 'Nachtfahrt', dark: true, bar: '#131A40' }, C: { name: 'Sattblau', dark: false, bar: '#ffffff' } };
const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* ---------- Karte ---------- */
let map, baseLayer, satLayer, satLabels, sat = false, routeLine, doneLine, legLine, walkLine, markersLayer, homeMarker, meMarker, meAcc;
const markerById = new Map();
function initMap() {
  map = L.map('map', styleFor()).setView([51.16, 10.45], 6);
  map.onstyle = tuneMap;
  map.attributionControl.setPrefix('');
  satLayer = L.tileLayer(API.sat, { maxZoom: 20, maxNativeZoom: 19, attribution: 'Esri, Maxar' });
  satLabels = L.layerGroup([L.tileLayer(API.satRoads, { maxZoom: 20, maxNativeZoom: 19, opacity: .8 }), L.tileLayer(API.satLabels, { maxZoom: 20, maxNativeZoom: 19 })]);
  markersLayer = L.layerGroup().addTo(map);
  map.on('dragstart', () => { follow = false; });
  const userMove = e => { if (e && e.originalEvent) follow = false; };
  map.ml.on('rotatestart', userMove); map.ml.on('pitchstart', userMove);
  map.ml.on('rotate', updCompass); map.ml.on('pitch', updCompass);
}
/* Kompass: erscheint, wenn die Karte gedreht/gekippt ist. Antippen = Norden oben */
function updCompass() {
  const b = map.ml.getBearing(), p = map.ml.getPitch(), btn = $('#btnCompass'); if (!btn) return;
  btn.classList.toggle('show', Math.abs(b) > 0.5 || p > 1);
  const n = btn.querySelector('svg'); if (n) n.style.transform = `rotate(${-b}deg)`;
}
/* Kamera folgt dir. Während der Route: Fahrtrichtung oben (+ 3D), Pfeil etwas unterhalb der Mitte */
let headUp = true;
function camFollow(ms = 900, zoom) {
  if (!follow || !pos || !map) return;
  const ml = map.ml, nav = document.body.classList.contains('nav');
  if (!nav) { ml.easeTo({ center: [pos.lon, pos.lat], duration: 500 }); return; }
  const v = meView || pos, hd = meHead;
  const top = ($('#navTop').offsetHeight || 90) + 10, bot = (arriveEl ? arriveEl.offsetHeight : $('#navBottom').offsetHeight) || 200, H = ml.getContainer().clientHeight;
  const up = headUp && hd != null;
  const o = { center: [v.lon, v.lat], offset: [0, (top - bot) / 2 + (up ? Math.max(0, H - top - bot) * .2 : 0)], duration: ms };
  if (up) { o.bearing = hd; o.pitch = S.settings.tilt3d ? 50 : 0; } else if (!headUp) { o.bearing = 0; o.pitch = 0; }
  if (zoom) o.zoom = zoom; else if (gpsSpeed > 1) o.easing = t => t;
  ml.easeTo(o);
}
function applyTheme() {
  const d = S.settings.design, dark = DESIGNS[d].dark;
  document.documentElement.dataset.design = d;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = DESIGNS[d].bar;
  const mp = $('#map'); if (mp) mp.classList.toggle('darkmap', dark && !sat && !!(map && map.fell));
}
/* Karte passend zum Design: helle Karte (liberty) oder dunkelblaue (fiord), ruhiger, mit Hausnummern */
const styleFor = () => ML_STYLES[DESIGNS[S.settings.design].dark ? 'dark' : 'light'];
function tuneMap(fell) {
  applyTheme(); if (fell) return;
  const ml = map.ml, dark = DESIGNS[S.settings.design].dark;
  const set = (id, k, v) => { try { if (ml.getLayer(id)) ml.setPaintProperty(id, k, v); } catch (e) { } };
  ['poi_r20', 'poi_r7', 'poi_r1'].forEach(id => { try { if (ml.getLayer(id)) ml.setLayoutProperty(id, 'visibility', 'none'); } catch (e) { } });
  if (dark) {
    set('background', 'background-color', '#141B46'); set('water', 'fill-color', '#0E1436'); set('landuse_residential', 'fill-color', '#161E4E');
    set('building', 'fill-color', '#2A3478'); set('building', 'fill-opacity', .8); set('park', 'fill-color', '#14404A'); set('landcover_wood', 'fill-color', '#123A42');
    set('highway_minor', 'line-color', '#3B479A'); set('highway_major_inner', 'line-color', '#3B479A'); set('highway_major_casing', 'line-color', '#4A57B0'); set('highway_path', 'line-color', '#5360B8');
    set('highway_name_other', 'text-color', '#C6CEFA'); set('highway_name_other', 'text-halo-color', '#141B46');
  }
  try {   // Hausnummern stehen in den Kartendaten, die Stile zeigen sie nur nicht
    if (ml.getSource('openmaptiles') && !ml.getLayer('olli-hn')) ml.addLayer({ id: 'olli-hn', type: 'symbol', source: 'openmaptiles', 'source-layer': 'housenumber', minzoom: 17,
      layout: { 'text-field': ['get', 'housenumber'], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 17, 10, 19, 13] },
      paint: { 'text-color': dark ? '#AEB8EE' : '#6B5E55', 'text-halo-color': dark ? '#141B46' : '#ffffff', 'text-halo-width': 1.2 } }, map.firstOverlay());
  } catch (e) { }
}
/* Linien und Standort-Kreis neu einfärben (nach Design-Wechsel) */
function recolor() {
  drawRouteLine();
  if (legLine && leg) { map.removeLayer(legLine); legLine = L.polyline(leg.coords.map(p => [p.lat, p.lon]), { color: cssv('--leg'), weight: 7, opacity: .95, dashArray: leg.real ? null : '8 10' }).addTo(map); if (walkLine && leg.real) { const n = nextStop(); if (n) drawWalk([leg.coords[leg.coords.length - 1], tgt(n)]); } }
  if (meAcc && pos) { const v = meView || pos; map.removeLayer(meAcc); meAcc = L.circle([v.lat, v.lon], { radius: pos.acc, weight: 0, fillColor: cssv('--acc'), fillOpacity: .1, interactive: false }).addTo(map); }
}
function setSat(on, quiet) {
  sat = on; applyTheme(); if (S.settings.sat !== on) { S.settings.sat = on; save(); }
  if (on) { satLayer.addTo(map); satLabels.addTo(map); }
  else { satLayer.remove(); satLabels.remove(); }
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
    const label = s.status === 'done' ? ic.check : r.optimized ? (i + 1) : '<span class="dot"></span>';
    const m = L.marker([s.lat, s.lon], { icon: pinIcon(label, cls), zIndexOffset: s.id === nextId ? 1000 : 0 }).addTo(markersLayer);

    m.on('click', () => { if (S.run && S.run.routeId === r.id) showArrive(s, true); else openStop(s.id); });
    markerById.set(s.id, m);
  });
  const nx = nextId && list.find(s => s.id === nextId);   // gemerkter Briefkasten-Punkt des nächsten Stopps
  if (nx && nx.box) L.marker([nx.box.lat, nx.box.lon], { icon: L.divIcon({ className: '', html: '<div class="boxdot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }), interactive: false, zIndexOffset: 900 }).addTo(markersLayer);
}
function drawRouteLine() {
  [routeLine, doneLine].forEach(l => l && map.removeLayer(l));
  routeLine = doneLine = null;
  const r = R();
  if (!r || !r.optimized || !r.geom) return;
  routeLine = L.polyline(r.geom.map(p => [p[1], p[0]]), { color: cssv('--route'), weight: 5, opacity: document.body.classList.contains('nav') ? .35 : .8 }).addTo(map);
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
let pos = null, gpsSpeed = null, heading = null, watchId = null, follow = false, fixDt = 1;
function startGPS() {
  if (watchId != null || !navigator.geolocation) return;
  watchId = navigator.geolocation.watchPosition(p => {
    const c = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() };
    if (!acceptFix(c)) return;
    const sp = p.coords.speed != null && !isNaN(p.coords.speed) ? p.coords.speed : null;
    const hd = p.coords.heading != null && !isNaN(p.coords.heading) && sp != null && sp > 1 ? p.coords.heading : null;
    fixDt = pos ? clamp((c.t - pos.t) / 1000, .4, 2) : 1;
    pos = smoothFix(c, sp);
    gpsSpeed = sp != null ? sp : estSpeed;
    updateHeading(pos, hd);
    drawMe();
    if (S.run) onRunPosition();
  }, err => {
    if (err.code === 1) toast('Standort ist blockiert – bitte in Chrome erlauben');
  }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
}
/* Standort glätten: Ungenaue Punkte zählen weniger. Im Stand wackelt der Pfeil nicht,
   beim Fahren folgt er schnell (je schneller, desto mehr zählt der neue Punkt). */
let kf = null, estSpeed = null;
function smoothFix(c, sp) {
  if (!kf || c.t - kf.t > 15000 || hav(kf, c) > 150) { kf = { lat: c.lat, lon: c.lon, v: c.acc * c.acc, t: c.t }; estSpeed = sp; return c; }
  const dt = Math.max(.05, (c.t - kf.t) / 1000);
  const v = sp != null ? sp : clamp(hav(kf, c) / dt, 0, 12);
  estSpeed = estSpeed == null ? v : estSpeed + (v - estSpeed) * .5;
  const q = Math.max(1.2, estSpeed * 1.3);
  kf.v += dt * q * q;
  const k = kf.v / (kf.v + Math.max(9, c.acc * c.acc));
  kf.lat += k * (c.lat - kf.lat); kf.lon += k * (c.lon - kf.lon); kf.v *= 1 - k; kf.t = c.t;
  return { lat: kf.lat, lon: kf.lon, acc: c.acc, t: c.t };
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
/* Fahrtrichtung nur aus dem GPS: Strecke der letzten Meter, kein Kompass.
   Neue Richtung erst nach echter Bewegung; beim Stehen bleibt die letzte. */
let headFrom = null, headingT = 0;
function bearing(a, b) {
  const t = Math.PI / 180, y = Math.sin((b.lon - a.lon) * t) * Math.cos(b.lat * t);
  const x = Math.cos(a.lat * t) * Math.sin(b.lat * t) - Math.sin(a.lat * t) * Math.cos(b.lat * t) * Math.cos((b.lon - a.lon) * t);
  return (Math.atan2(y, x) / t + 360) % 360;
}
function updateHeading(c, hd) {
  if (c.acc > 30) return;                                   // GPS zu ungenau
  if (hd != null) {                                         // das Handy kennt die Fahrtrichtung selbst
    heading = heading == null ? hd : (heading + (((hd - heading) % 360 + 540) % 360 - 180) * .7 + 360) % 360;
    headFrom = c; headingT = Date.now(); return;
  }
  if (!headFrom || c.t - headFrom.t > 120000) { headFrom = c; return; }
  if (gpsSpeed != null && gpsSpeed < 0.4) return;           // steht
  if (hav(headFrom, c) < Math.max(10, c.acc * 1.2)) return; // noch nicht weit genug bewegt
  const b = bearing(headFrom, c);
  heading = heading == null ? b : (heading + (((b - heading) % 360 + 540) % 360 - 180) * .6 + 360) % 360;
  headFrom = c; headingT = Date.now();
}
const COMPASS = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 2 16 12H8Z" fill="#e5484d"/><path d="M12 22 8 12h8Z" fill="#94a3b8"/></svg>';
const ARROW = '<svg viewBox="0 0 40 40" width="40" height="40"><path d="M20 3 32 32 20 25 8 32Z" stroke-width="3" stroke-linejoin="round"/></svg>';
/* Pfeil klebt auf der Straße (nur während einer Route): Er wird auf die grüne Linie gesetzt,
   solange das GPS höchstens 30 m daneben liegt, und schaut die Straße entlang Richtung nächstes Haus.
   Nur die Anzeige – Ankunft, Abhaken und Strecke rechnen weiter mit der echten Position. */
const SNAP_MAX = 30;
let meRot = 0, meView = null, meHead = null, meShown = null, glideRaf = null;
function pointAlong(l, along) {
  const c = l.coords, cum = l.cum; along = clamp(along, 0, l.total);
  for (let i = 0; i < c.length - 1; i++) if (along <= cum[i + 1] || i === c.length - 2) {
    const seg = cum[i + 1] - cum[i], t = seg > 0 ? clamp((along - cum[i]) / seg, 0, 1) : 0;
    return { lat: c[i].lat + (c[i + 1].lat - c[i].lat) * t, lon: c[i].lon + (c[i + 1].lon - c[i].lon) * t };
  }
  return c[c.length - 1];
}
function snapView() {
  if (!S || !S.run || !pos || !leg || !leg.real || !leg.cum || leg.total < 3) return null;
  const n = nextStop(); if (!n || leg.target !== n.id) return null;
  if (offRoute) return null;
  const pr = projectAlong(leg, pos); if (pr.d > clamp((pos.acc || 10) * 1.5, SNAP_MAX, 55)) return null;
  // beim Fahren ein Stück vorausrechnen (bis der nächste GPS-Punkt kommt) → der Pfeil gleitet statt zu ruckeln
  const at = Math.min(leg.total, pr.along + (gpsSpeed > 1 ? Math.min(gpsSpeed * fixDt, 12) : 0));
  const p = pointAlong(leg, at);
  let from = p, to = pointAlong(leg, at + 12);                    // ein Stück voraus: Kurven passen schon vorher
  if (hav(from, to) < 2) { from = pointAlong(leg, at - 12); to = p; }       // am Haus: Richtung, aus der man kommt
  let h = hav(from, to) >= 2 ? bearing(from, to) : heading;
  // Fährst du gerade entgegen der Linie (z. B. vor dem Wenden)? Dann die Straße entlang in deine Richtung.
  const moving = heading != null && Date.now() - headingT < 10000 && !(gpsSpeed != null && gpsSpeed < 0.4);
  if (h != null && moving && Math.abs(((heading - h) % 360 + 540) % 360 - 180) > 100) h = (h + 180) % 360;
  return { lat: p.lat, lon: p.lon, h };
}
function glideMe(to) {
  cancelAnimationFrame(glideRaf);
  if (!meShown || hav(meShown, to) > 80) { meShown = { lat: to.lat, lon: to.lon }; meMarker.setLatLng([to.lat, to.lon]); return; }
  const from = { lat: meShown.lat, lon: meShown.lon }, t0 = performance.now(), moving = gpsSpeed > 1, D = moving ? fixDt * 1000 : 600;
  const step = now => {
    const k = Math.min(1, (now - t0) / D), e = moving ? k : 1 - Math.pow(1 - k, 3);   // beim Fahren gleichmäßig
    meShown = { lat: from.lat + (to.lat - from.lat) * e, lon: from.lon + (to.lon - from.lon) * e };
    meMarker.setLatLng([meShown.lat, meShown.lon]); if (k < 1) glideRaf = requestAnimationFrame(step);
  };
  glideRaf = requestAnimationFrame(step);
}
function drawMe() {
  if (!pos) return;
  const sv = snapView();
  meView = sv ? { lat: sv.lat, lon: sv.lon, snapped: true } : { lat: pos.lat, lon: pos.lon, snapped: false };
  meHead = sv && sv.h != null ? sv.h : heading;
  if (!meMarker) {
    const icon = L.divIcon({ className: '', html: `<div class="me-wrap"><div class="me"></div><div class="me-arrow">${ARROW}</div></div>`, iconSize: [40, 40], iconAnchor: [20, 20] });
    meMarker = L.marker([meView.lat, meView.lon], { icon, zIndexOffset: 2000, interactive: false, rotationAlignment: 'map' }).addTo(map);
    meAcc = L.circle([meView.lat, meView.lon], { radius: pos.acc, weight: 0, fillColor: cssv('--acc'), fillOpacity: .1, interactive: false }).addTo(map);
    meShown = { lat: meView.lat, lon: meView.lon };
  } else { glideMe(meView); meAcc.setLatLng([meView.lat, meView.lon]).setRadius(pos.acc); }
  const w = meMarker.getElement() && meMarker.getElement().querySelector('.me-wrap');
  if (w) {
    w.classList.toggle('dir', meHead != null);
    if (meHead != null) { meRot += ((meHead - meRot) % 360 + 540) % 360 - 180; w.querySelector('.me-arrow').style.transform = `rotate(${meRot}deg)`; }
  }
  camFollow(gpsSpeed > 1 ? Math.round(fixDt * 1000) : 900);
}

/* ---------- Bottom Sheet ---------- */
const sheet = () => $('#sheet');
function sheetPeek() { return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--peek')) || 190; }
function setSheet(full) {
  if (full) arm();
  sheet().classList.toggle('full', full); document.body.classList.toggle('sheet-open', full);
  sheet().style.transform = '';
  if (!full) { const i = $('#q'); if (i) { i.value = ''; i.blur(); } searchMode = false; renderList(); }
}
/* Liste nach unten wegziehen */
function initSheetDrag() {
  const el = sheet(); let y0 = null, t0 = 0, moved = false;
  const start = e => { if (!el.classList.contains('full')) return; y0 = (e.touches ? e.touches[0] : e).clientY; t0 = Date.now(); moved = false; el.classList.add('dragging'); };
  const move = e => {
    if (y0 == null) return; const dy = (e.touches ? e.touches[0] : e).clientY - y0;
    if (Math.abs(dy) > 5) moved = true;
    el.style.transform = `translateY(${clamp(dy, 0, el.offsetHeight)}px)`;
  };
  const end = e => {
    if (y0 == null) return; el.classList.remove('dragging');
    const dy = (e.changedTouches ? e.changedTouches[0] : e).clientY - y0, v = dy / Math.max(1, Date.now() - t0);
    y0 = null;
    if (!moved) { el.style.transform = ''; if (e.target.closest('#sheetHandle')) setSheet(false); return; }
    setSheet(!(v > 0.35 || dy > el.offsetHeight / 3));
  };
  ['#sheetHandle', '#sheetHead'].forEach(s => {
    const h = $(s);
    h.addEventListener('touchstart', start, { passive: true });
    h.addEventListener('touchmove', move, { passive: true });
    h.addEventListener('touchend', end);
    h.addEventListener('mousedown', e => { if (e.target.closest('input,button')) return; start(e); const mm = ev => move(ev); const mu = ev => { end(ev); removeEventListener('mousemove', mm); removeEventListener('mouseup', mu); }; addEventListener('mousemove', mm); addEventListener('mouseup', mu); });
  });
}
let searchMode = false, searchT, searchSeq = 0;
const routeSub = r => {
  if (!r) return '';
  const n = r.stops.length, sheets = r.stops.reduce((a, x) => a + (x.count || 1), 0), ok = r.optimized && r.plan;
  return [plural(n, 'Stopp', 'Stopps'), sheets > n ? sheets + ' Blätter' : '', ok ? fmtDur(r.plan.total) : '', ok ? fmtKm(r.plan.dist) : ''].filter(Boolean).join(', ');
};
function renderSheet() {
  const r = R();
  $('#sheetHead').innerHTML = `
    <div class="head-row">
      <div class="head-count"><b>${r ? esc(r.name) : 'Keine Route'}</b><div class="head-sub">${routeSub(r)}</div></div>
      <button class="icon-btn" id="moreBtn" aria-label="Mehr">${ic.more}</button>
      <button class="icon-btn" id="sheetX" aria-label="Schließen">${ic.x}</button>
    </div>
    <div class="head-row"><div class="search"><span>${ic.search}</span><input id="q" placeholder="Adresse suchen oder hinzufügen" autocomplete="off" enterkeyhint="search"><button class="clear" id="qx" style="display:none">${ic.x}</button></div></div>`;
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
  $('#sheetX').onclick = () => setSheet(false);
  $('#moreBtn').onclick = e => routeMenu(e.currentTarget);
  renderList();
  renderFooter();
  renderHome();
}
/* Startseite: Routen-Karte und Reiter (Karte, Stopps, Mehr) */
function renderHome() {
  const r = R(), hc = $('#homeCard');
  hc.innerHTML = r
    ? `<div class="hc-txt" id="hOpen"><div class="hc-t">${esc(r.name)}</div><div class="hc-s">${S.run && S.run.routeId === r.id ? 'läuft gerade' : routeSub(r)}</div></div><button class="hc-play" id="hStart" aria-label="Route starten">${ic.play}</button>`
    : `<div class="hc-txt"><div class="hc-t">Noch keine Route</div></div><button class="hc-play" id="hNew" aria-label="Route erstellen">${ic.plus}</button>`;
  if (r) { $('#hOpen').onclick = () => setSheet(true); $('#hStart').onclick = () => S.run ? resumeRun() : pickRoute(); }
  else $('#hNew').onclick = createRoute;
  $('#tabs').innerHTML = `<button class="tab on" id="tMap">${ic.map}Karte</button><button class="tab" id="tStops">${ic.list}Stopps</button><button class="tab" id="tMore">${ic.set}Mehr</button>`;
  $('#tMap').onclick = () => fitAll(); $('#tStops').onclick = () => setSheet(true); $('#tMore').onclick = openDrawer;
  updatePeek();
}
function updatePeek() {
  requestAnimationFrame(() => { const t = $('#homeCard').getBoundingClientRect().top; if (t > 0) document.documentElement.style.setProperty('--peek', Math.round(innerHeight - t) + 'px'); });
}
function renderList() {
  if (searchMode) return;
  const r = R(), body = $('#sheetBody');
  if (!r) {
    body.innerHTML = `<div class="empty"><h3>Noch keine Route</h3><button class="btn btn-p" id="eNew">${ic.plus} Route erstellen</button></div>`;
    $('#eNew').onclick = createRoute; return;
  }
  if (!r.stops.length) {
    body.innerHTML = `<div class="empty"><h3>Noch keine Stopps</h3>
      <button class="btn btn-p" id="eCsv">${ic.csv} CSV-Datei laden</button><button class="btn btn-s" id="eSearch">${ic.search} Adresse suchen</button></div>`;
    $('#eCsv').onclick = importCSV; $('#eSearch').onclick = () => $('#q').focus(); return;
  }
  const list = stopsOrdered(r);
  const bad = list.filter(s => s.quality !== 'exact').length;
  let html = bad ? `<div class="note-box warn">${plural(bad, 'Adresse', 'Adressen')} ungenau. Antippen und Position korrigieren.</div>` : '';
  html += list.map((s, i) => {
    const sub = [s.count > 1 ? `<span class="cnt">${s.count}×</span>` : '', esc(s.name || (s.zip + ' ' + s.city)), s.quality === 'none' ? '<span class="warn">nicht gefunden</span>' : s.quality === 'street' ? '<span class="warn">ungenau</span>' : ''].filter(Boolean).join(' ');
    const done = s.status === 'done';
    return `<div class="stop ${done ? 'done' : ''}" data-id="${s.id}"><div class="num">${r.optimized ? i + 1 : '–'}</div><div class="txt"><div class="a">${esc(s.street)}</div><div class="b">${sub}</div></div><div class="tag">${done ? ic.check : ''}</div></div>`;
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
  else html += results.map((x, i) => `<div class="res" data-i="${i}">${ic.search}<div class="t"><b>${esc(x.street)}</b><small>${esc([x.zip, x.city, x.sub].filter(Boolean).join(' '))}</small></div><span class="add">${ic.plus}</span></div>`).join('');
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
  const s = { id: uid(), street: x.street, zip: x.zip || '', city: x.city || '', name: '', note: '', lat: x.lat, lon: x.lon, quality: x.exact ? 'exact' : 'street', ele: null, pos: 'auto', status: 'open' };
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
  const d = S.settings.dayOn ? nextDeliveryDay() : null;
  $('#drawer').innerHTML = `<div class="sheet-handle"><i></i></div>
    <div class="dr-list">${d ? `<div class="dr-day">Austragetag ${dayIn(d)}</div>` : ''}<div class="dr-h">Routen</div>
      ${routes.length ? routes.map(r => `<div class="route-it ${r.id === S.activeId ? 'act' : ''}" data-id="${r.id}"><div class="n"><b>${esc(r.name)}</b><small>${[plural(r.stops.length, 'Stopp', 'Stopps'), r.plan ? fmtDur(r.plan.total) : '', r.history && r.history.length ? r.history.length + '× gefahren' : ''].filter(Boolean).join(', ')}</small></div><button class="icon-btn" data-m="${r.id}" aria-label="Mehr">${ic.more}</button></div>`).join('') : '<div class="empty" style="padding:12px">Noch keine Routen</div>'}
    </div>
    <div class="dr-foot"><button class="btn btn-s" id="dSet">${ic.gear} Einstellungen</button><button class="btn btn-p" id="dNew">${ic.plus} Route</button></div>`;
  $('#drawer').classList.add('show'); $('#scrim').classList.add('show');
  arm();
  $('#dNew').onclick = () => { closeDrawer(); createRoute(); };
  $('#dSet').onclick = () => { closeDrawer(); openSettings(); };
  $('#drawer').querySelector('.sheet-handle').onclick = closeDrawer;
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
  const hist = r.history || [], last = hist[hist.length - 1];
  const sheets = r.stops.reduce((a, s) => a + (s.count || 1), 0);
  const row = (l, v) => `<div class="row"><div class="l">${l}</div><div class="v">${v}</div></div>`;
  const kmh = x => x.toFixed(1).replace('.', ',') + ' km/h';
  const modeCard = m => {
    const L = learned(r, m), note = L.from === 'route' ? '' : L.from === 'andere' ? ' (andere Routen)' : ' (Start)';
    const runs = hist.filter(h => (h.mode || 'roller') === m && h.done === h.total);
    return `<div class="set-card"><div class="set-ct">${m === 'fuss' ? ic.user : ic.map}<span>${MODES[m].label}</span></div>
      ${row('Ø Tempo', kmh(MODES[m].kmh / L.a) + note)}${row('Ø pro Briefkasten', Math.round(L.b) + ' s' + note)}
      ${runs.length ? row('Ø Dauer', fmtDur(runs.reduce((a, h) => a + h.sec, 0) / runs.length)) : ''}${row('Gelernt aus', plural(L.n, 'Tour', 'Touren'))}</div>`;
  };
  openPage(`<div class="page-h"><span style="width:46px"></span><h1>${esc(r.name)}</h1><button class="icon-btn" data-close>${ic.x}</button></div>
  <div class="page-b set-page"><div class="set-card">
    ${row('Stopps', r.stops.length)}${row('Blätter', sheets)}
    ${row('Strecke', r.plan ? fmtKm(r.plan.dist) : '–')}${row('Geschätzte Dauer', r.plan ? fmtDur(r.plan.total) : '–')}
    ${row('Gefahrene Touren', hist.length)}
  </div>${modeCard('roller')}${modeCard('fuss')}${last ? `<div class="set-card">
    ${row('Letzte Tour', fmtDate(last.date))}${row('Gebraucht (' + MODES[last.mode || 'roller'].label + ')', fmtDur(last.sec))}${last.planned ? row('Geschätzt', fmtDur(last.planned)) : ''}
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
      const s = { id: uid(), street: x.street, zip: x.zip, city: x.city, name: x.name, note: x.note, count: x.count || 1, lat: null, lon: null, quality: null, ele: null, pos: 'auto', status: 'open' };
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
  if (fail) dialog({ title: plural(fail, 'Adresse', 'Adressen') + ' ungenau', text: 'In der Liste antippen und Position korrigieren.', buttons: [{ label: 'OK', cls: 'btn-p', value: 1 }] });
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
  const st = S.settings, f = 1, hill = HILL[st.hill] || 0;
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
/* Roller oder zu Fuß: jede Art lernt eigene Werte */
const MODES = { roller: { kmh: 15, label: 'Roller' }, fuss: { kmh: 5, label: 'zu Fuß' } };
const modeRuns = (r, m) => {
  if (!r || !r.learn) return [];
  if (r.learn.runs && !r.learn.roller) { r.learn = { roller: { runs: r.learn.runs }, fuss: { runs: [] } }; }
  return (r.learn[m] && r.learn[m].runs) || [];
};
const avgRuns = runs => ({ a: runs.reduce((x, k) => x + k.a, 0) / runs.length, b: runs.reduce((x, k) => x + k.b, 0) / runs.length });
function learned(r, m) {
  m = m || curMode();
  const runs = modeRuns(r, m);
  if (runs.length) return Object.assign(avgRuns(runs), { n: runs.length, from: 'route' });
  const other = S.routes.filter(x => x !== r).flatMap(x => modeRuns(x, m).length ? [avgRuns(modeRuns(x, m))] : []);
  if (other.length) return Object.assign(avgRuns(other), { n: 0, from: 'andere' });
  return { a: 1, b: 15, n: 0, from: 'start' };
}
const curMode = () => (S.run && S.run.mode) || S.lastMode || 'roller';
const driveF = (r, m) => { m = m || curMode(); return 15 / MODES[m].kmh * learned(r, m).a; };
const stopTime = (r, s, m) => learned(r, m).b * (s.count > 1 ? 1 + .3 * (s.count - 1) : 1);
function planFor(r, pts, idxOrder, returnHome, m) {
  const st = S.settings, f = driveF(r, m);
  let dur = 0, dist = 0, up = 0, prev = 0; const legs = [];
  const step = (a, b) => { const d = (r.matrix.dur[a][b] ?? hav(pts[a], pts[b]) * 1.4 / 4.2) * f; const m = r.matrix.dist[a][b] ?? hav(pts[a], pts[b]) * 1.4; dur += d; dist += m; if (pts[a].ele != null && pts[b].ele != null) up += Math.max(0, pts[b].ele - pts[a].ele); return d; };
  for (const k of idxOrder) { legs.push(step(prev, k)); prev = k; }
  let back = 0; if (returnHome) back = step(prev, 0);
  const stopsT = idxOrder.reduce((a, k) => a + stopTime(r, pts[k], m), 0);
  return { drive: dur, total: dur + stopsT, dist, up: Math.round(up), legs, back, returnHome, endName: pts[prev].street || 'Start' };
}
function planTotalFor(r, m) {
  if (!r.matrix || !r.order) return r.plan ? r.plan.total : 0;
  const stops = r.stops.filter(s => s.lat != null); const pts = [S.settings.home].concat(stops);
  const idx = new Map(stops.map((s, i) => [s.id, i + 1]));
  return planFor(r, pts, r.order.map(id => idx.get(id)).filter(Boolean), r.plan ? r.plan.returnHome : S.settings.returnHome, m).total;
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
      <div class="ed-top"><div class="ed-id">${r.optimized ? 'Stopp ' + no + ' von ' + list.length : ''}${s.status === 'done' ? ' ✓ erledigt' : ''}</div>
        <div class="ed-addr">${esc(s.street)}</div><div class="ed-city">${esc(s.zip + ' ' + s.city)}</div></div>

      <div class="field"><label>Name</label><input id="sName" value="${esc(s.name)}" autocomplete="off"></div>
      <div class="row">${ic.copy}<div class="l">Blätter</div><div class="step"><button id="cM">−</button><span id="cV">${s.count || 1}</span><button id="cP">+</button></div></div>
      <div class="field"><label>Notiz</label><textarea id="sNote" rows="2" >${esc(s.note)}</textarea></div>
      <div class="row">${ic.sort}<div class="l">Reihenfolge</div><div class="seg" id="sPos">${[['first', 'Erster'], ['auto', 'Auto'], ['last', 'Letzter']].map(([v, l]) => `<button data-v="${v}" class="${(s.pos || 'auto') === v ? 'sel' : ''}">${l}</button>`).join('')}</div></div>
      <div class="row">${ic.check}<div class="l">Erledigt</div><button class="tog ${s.status === 'done' ? 'on' : ''}" id="sDone"></button></div>
      <div class="grey" style="margin-top:8px">
        <div class="link-row" id="sMove">${ic.move}<span>Position korrigieren</span>${ic.chev.replace('<svg', '<svg class="chev"')}</div>
        <div class="link-row" id="sAddr">${ic.search}<span>Adresse ändern</span>${ic.chev.replace('<svg', '<svg class="chev"')}</div>
        ${s.box ? `<div class="link-row" id="sBox">${ic.pin}<span>Briefkasten-Punkt vergessen</span></div>` : ''}
        <div class="link-row" id="sDup">${ic.copy}<span>Stopp duplizieren</span>${ic.chev.replace('<svg', '<svg class="chev"')}</div>
        <div class="link-row red" id="sDel">${ic.trash}<span>Stopp löschen</span></div>
      </div>
      ${s.quality === 'street' ? '<div class="note-box warn">Position ungenau</div>' : s.quality === 'none' ? '<div class="note-box warn">Adresse nicht gefunden</div>' : ''}
    </div>`, { onClose: () => { save(); drawMarkers(); renderList(); } });
  const el = pg.el;
  if (s.lat != null) map.setView([s.lat, s.lon], Math.max(map.getZoom(), 17));

  $('#sName', el).oninput = e => { s.name = e.target.value; save(); };
  $('#sNote', el).oninput = e => { s.note = e.target.value; save(); };
  el.querySelectorAll('#sPos button').forEach(b => b.onclick = () => { s.pos = b.dataset.v; el.querySelectorAll('#sPos button').forEach(x => x.classList.toggle('sel', x === b)); if (r.optimized) { r.optimized = false; toast('Bitte neu optimieren'); renderFooter(); } save(); });
  const setC = d => { s.count = clamp((s.count || 1) + d, 1, 20); $('#cV', el).textContent = s.count; save(); };
  $('#cM', el).onclick = () => setC(-1); $('#cP', el).onclick = () => setC(1);
  $('#sDone', el).onclick = e => { s.status = s.status === 'done' ? 'open' : 'done'; e.currentTarget.classList.toggle('on', s.status === 'done'); save(); };
  $('#sMove', el).onclick = () => { pg.close(); dragStop(s); };
  if (s.box) $('#sBox', el).onclick = e => { delete s.box; save(); e.currentTarget.remove(); toast('Vergessen'); };
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
  ban.innerHTML = `<span>Pin zum Briefkasten ziehen</span><button class="btn btn-p" id="dOk">Fertig</button>`;
  document.body.appendChild(ban);
  const onMap = e => m.setLatLng(e.latlng); map.on('click', onMap);
  $('#dOk', ban).onclick = () => {
    const p = m.getLatLng(); s.lat = p.lat; s.lon = p.lng; s.quality = 'exact'; s.ele = null; delete s.box;
    map.off('click', onMap); m.remove(); ban.remove(); document.body.classList.remove('dragmode');
    const r = R(); invalidate(r); save(); drawMarkers(); renderSheet(); toast('Position gespeichert');
  };
}

/* ---------- Routenauswahl & Fahrt ---------- */
function pickRoute() {
  const rs = S.routes.filter(r => r.stops.length);
  if (!rs.length) return toast('Erst Adressen hinzufügen');
  if (rs.length === 1) return startRun(rs[0].id);
  const pg = openPage(`<div class="page-h"><span style="width:46px"></span><h1>Welche Route?</h1><button class="icon-btn" data-close>${ic.x}</button></div>
    <div class="page-b">${rs.map(r => `<div class="pick" data-id="${r.id}"><div class="n"><b>${esc(r.name)}</b>
      <small>${[plural(r.stops.length, 'Stopp', 'Stopps'), r.plan ? fmtDur(r.plan.total) : '', r.plan ? 'fertig ' + fmtTime(Date.now() + r.plan.total * 1000) : ''].filter(Boolean).join(', ')}</small></div>${ic.play}</div>`).join('')}</div>`, { sheetlike: true });
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
  const mode0 = S.lastMode || 'roller';
  S.run = { routeId: id, mode: mode0, started: Date.now(), paused: 0, pausedAt: null, doneLog: [], plannedTotal: planTotalFor(r, mode0), segs: [], segStart: Date.now(), segPaused: 0, segIdle: 0, lastId: null, dist: 0 };
  save(true); enterNav();
  lastStreet = null;
  speak('Route ' + r.name + ' gestartet. ' + plural(openStops().length, 'Stopp', 'Stopps') + '.', true);
}
function resumeRun() { const r = S.routes.find(x => x.id === S.run.routeId); if (!r) { S.run = null; save(); return renderFooter(); } if (S.activeId !== r.id) selectRoute(r.id); enterNav(); }
const runRoute = () => S.run && S.routes.find(x => x.id === S.run.routeId);
const openStops = () => {
  const r = runRoute(); if (!r) return [];
  const l = stopsOrdered(r).filter(s => s.status === 'open' && s.lat != null);
  const pr = S.run && S.run.prio;   // nur für diese Tour: übersprungene in der Reihenfolge „nächster zuerst“
  if (pr && pr.length) { const ix = id => { const i = pr.indexOf(id); return i < 0 ? 1e9 : i; }; l.sort((a, b) => ix(a.id) - ix(b.id)); }
  return l;
};
const nextStop = () => openStops()[0] || null;
/* Briefkasten-Punkt: Beim „Eingeworfen“ merkt sich die App, wo du stehst (nur bei gutem GPS, im Stand,
   höchstens 60 m von der Adresse). Beim nächsten Mal führt sie genau dorthin. Bleibt nur auf diesem Handy. */
const tgt = s => s.box || s;
function learnBox(s) {
  if (!pos || pos.acc > 15 || hav(pos, s) > 60 || (gpsSpeed != null && gpsSpeed > 2)) return;
  const p = { lat: pos.lat, lon: pos.lon };
  s.box = s.box && hav(s.box, p) < 30 ? { lat: s.box.lat * .6 + p.lat * .4, lon: s.box.lon * .6 + p.lon * .4 } : p;
}
let wakeLock = null, etaTimer = null, legReqAt = 0, leg = null, lastTarget = null, arriveShownFor = null, spokenSteps = new Set();
async function keepAwake(on) {
  try {
    if (on && S.settings.keepAwake && 'wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); }
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S && S.run) keepAwake(true); });
let autoTimer = null;
const autoTick = () => idleTick();
function enterNav() {
  clearInterval(autoTimer); autoTimer = setInterval(autoTick, 1000);
  document.body.classList.add('nav'); setSheet(false);
  follow = true; startGPS(); keepAwake(true);
  drawMarkers(); drawRouteLine(); renderNav(); arm();
  if (S.settings.driveMode) openDrive();
  headUp = true;
  const n = nextStop(); if (pos) { map.setView([pos.lat, pos.lon], 18); camFollow(0); } else if (n) map.setView([n.lat, n.lon], 17);
  clearInterval(etaTimer); etaTimer = setInterval(() => { renderNavBottom(); maybeLeg(); }, 15000);
  maybeLeg(true);
}
function exitNav() {
  document.body.classList.remove('nav'); headUp = true; clearInterval(etaTimer); clearInterval(autoTimer); keepAwake(false); follow = false; closeDrive(true);
  if (legLine) { map.removeLayer(legLine); legLine = null; } drawWalk(null); leg = null; lastTarget = null; offRoute = false;
  $('#navTop').innerHTML = ''; $('#navBottom').innerHTML = ''; drawMe();
  drawMarkers(); renderSheet(); fitAll();
}
function remainingEstimate() {
  const r = runRoute(); if (!r || !r.plan) return null;
  const st = S.settings, f = driveF(r);
  const stops = r.stops.filter(s => s.lat != null); const pts = [st.home].concat(stops);
  const idx = new Map(stops.map((s, i) => [s.id, i + 1]));
  const open = openStops(); if (!open.length) return { sec: 0, dist: 0 };
  let sec = 0, dist = 0;
  // bis zum nächsten Stopp
  if (leg && leg.target === open[0].id && pos) { sec += leg.dur * f * (leg.remainFrac ?? 1); dist += leg.dist * (leg.remainFrac ?? 1); }
  else if (pos) { const d = hav(pos, open[0]) * 1.4; sec += d / 4.17 * driveF(r); dist += d; }
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
function renderNav() { renderNavTop(); renderNavBottom(); renderDrive(); renderVoiceFab(); }
/* Oben: nur das Abbiegen. Unten: nächster Briefkasten + „Eingeworfen“. */
const fmtM = m => m < 15 ? 'Jetzt' : fmtKm(m);
function renderNavTop() {
  const r = runRoute(); const n = nextStop();
  if (!r) return;
  if (!n) { $('#navTop').innerHTML = `<div class="turn done"><div class="turn-ic">${ic.check}</div><div class="turn-t"><div class="turn-s">Alle Briefkästen erledigt${r.plan && r.plan.returnHome ? ', zurück zum Start' : ''}</div></div></div>`; return; }
  const gps = pos && pos.acc > 40 ? '<div class="then warn">GPS ungenau</div>' : '';
  // falsch gefahren: bis der neue Weg da ist (1–2 s) nur die Meter zum Haus zeigen – nie die alte Anweisung
  const stp = !offRoute && leg && leg.steps && leg.target === n.id ? currentStep() : null, w = wayLeft(n);
  if (stp && !stp.arrive) {
    const nx = nextStepAfter(stp);
    $('#navTop').innerHTML = `<div class="turn"><div class="turn-ic">${stp.icon}</div><div class="turn-t"><div class="turn-d">${fmtM(stp.dist)}</div><div class="turn-s">${esc(stp.short)}</div></div></div>${nx ? `<div class="then">${nx.icon}Dann ${esc(nx.then)}</div>` : gps}`;
  } else $('#navTop').innerHTML = `<div class="turn"><div class="turn-ic">${offRoute ? ic.flag : ic.straight}</div><div class="turn-t"><div class="turn-d">${w != null ? fmtM(w) : ''}</div><div class="turn-s">bis ${esc(n.street)}</div></div></div>${gps}`;
}
function renderNavBottom() {
  const r = runRoute(); if (!r) return;
  const total = r.stops.length, done = r.stops.filter(s => s.status === 'done').length;
  const est = remainingEstimate(), paused = !!S.run.pausedAt, end = est ? Date.now() + est.sec * 1000 : null;
  const n = nextStop(), d = n ? wayLeft(n) : null;
  $('#navBottom').innerHTML = `${paused ? '<div class="paused-banner">Pause</div>' : ''}
    ${n ? `<div class="nrow" id="nNext"><div class="badge">${stopsOrdered(r).indexOf(n) + 1}</div><div class="next-txt"><div class="next-a">${esc(n.street)}</div>${n.name || n.count > 1 ? `<div class="next-n">${esc(n.name || '')}${n.count > 1 ? `<span class="cnt">${n.count} Blätter</span>` : ''}</div>` : ''}${n.note ? `<div class="next-o">${esc(n.note)}</div>` : ''}</div><div class="next-m">${d != null ? fmtKm(d) : ''}</div></div>` : ''}
    <div class="acts"><button class="sq" id="nSkip" aria-label="Überspringen" ${n ? '' : 'disabled'}>${ic.skip}</button><button class="go" id="nDone" ${n ? '' : 'disabled'}>${ic.check}Eingeworfen</button><button class="sq" id="nMore" aria-label="Mehr">${ic.more}</button></div>
    <div class="nprog"><span>${done} von ${total}</span><div class="bar"><i style="width:${total ? done / total * 100 : 0}%"></i></div><span>${end ? 'fertig ' + fmtTime(end) : ''}</span></div>`;
  document.documentElement.style.setProperty('--navb', $('#navBottom').offsetHeight + 'px');
  $('#nDone').onclick = () => { const n = nextStop(); if (n) markDone(n); };
  $('#nSkip').onclick = () => { const n = nextStop(); if (n) skipStop(n); };
  $('#nMore').onclick = e => navMenu(e.currentTarget);
  if (n) $('#nNext').onclick = openDrive;
}
/* nur die Meter neu schreiben (Knöpfe bleiben stehen, damit kein Tipp verloren geht) */
function updNavDist() { const m = $('#navBottom .next-m'), n = nextStop(), d = n ? wayLeft(n) : null; if (m && d != null) m.textContent = fmtKm(d); }
function navMenu(anchor) {
  const paused = !!S.run.pausedAt;
  popMenu(anchor, [
    { label: paused ? 'Weiter' : 'Pause', icon: paused ? ic.play : ic.pause, do: togglePause },
    { label: 'Rückgängig', icon: ic.undo, do: undo },
    { label: 'Liste', icon: ic.list, do: runList },
    { label: 'Große Anzeige', icon: ic.drive, do: openDrive },
    { label: 'Route beenden', icon: ic.stop, red: true, do: endRunAsk }
  ]);
}
function toggleVoice() { S.settings.voiceNav = !S.settings.voiceNav; save(); if (S.settings.voiceNav) { speak('Ansagen an', true); maybeLeg(true); } renderNav(); }
function renderVoiceFab() { const b = $('#btnVoice'); b.innerHTML = S.settings.voiceNav ? ic.vol : ic.mute; b.classList.toggle('on', !!S.settings.voiceNav); }
function markDone(s, auto) {
  if (s.status === 'done') return;
  s.status = 'done'; S.run.doneLog.push({ id: s.id, t: Date.now(), prev: 'open', box: s.box || null });
  learnBox(s);
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
  const s = r.stops.find(x => x.id === l.id); if (s) { s.status = 'open'; if ('box' in l) { if (l.box) s.box = l.box; else delete s.box; } } segReset(null); save(); toast('Rückgängig: ' + (s ? s.street : '')); afterChange();
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
  return r.matrix.dur[a][b];
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
    if (D != null && T > 1) R0.segs.push({ T, R: D, N: s.count || 1 });
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
function learnFromRun(r, m) {
  const segs = (S.run && S.run.segs || []).map(g => ({ T: g.T, N: g.N, D: (g.R != null ? g.R : g.D) * 15 / MODES[m].kmh }));
  const f = fitRun(segs); if (!f) return false;
  modeRuns(r, m);
  r.learn = r.learn || {}; r.learn.roller = r.learn.roller || { runs: [] }; r.learn.fuss = r.learn.fuss || { runs: [] };
  r.learn[m].runs = r.learn[m].runs.concat({ a: f.a, b: f.b, date: Date.now() }).slice(-5);
  return true;
}
/* Roller oder zu Fuß erkennen: Tempo nur in Bewegung (unter 7 km/h = zu Fuß) */
function detectMode() {
  const R0 = S.run; if (!R0 || (R0.moveDist || 0) < 300) return null;
  return (R0.moveDist / R0.moveTime) * 3.6 < 7 ? 'fuss' : 'roller';
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
  w.innerHTML = `<div class="dlg"><h2>${info.finished ? 'Geschafft! 🎉' : 'Tour beendet'}</h2><p>${esc(r.name)} · ${fmtDate(info.date)} · ${MODES[info.mode || 'roller'].label}</p>
    <div class="stats"><div><b>${fmtDur(info.sec)}</b><small>gebraucht</small></div><div><b>${fmtDur(info.planned)}</b><small>geschätzt</small></div>
    <div><b>${fmtKm(info.dist)}</b><small>Strecke</small></div><div><b>${info.sheets}</b><small>Blätter</small></div></div>
    ${info.skipped ? `<p>⏭ ${plural(info.skipped, 'Briefkasten', 'Briefkästen')} übersprungen</p>` : ''}
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
  const mode = detectMode() || S.run.mode || 'roller';
  info.mode = mode; info.skipped = r.stops.filter(s => s.status === 'skip').length;
  if (done.length) r.history = (r.history || []).concat({ date: S.run.started, sec, planned: S.run.plannedTotal, done: done.length, total: r.stops.length, skipped: info.skipped, mode });
  info.learned = learnFromRun(r, mode);
  if (done.length) S.lastMode = mode;
  recomputePlan(r);
  S.run = null; save(true);
  if (done.length) showSummary(r, info); else exitNav();
}
function togglePause() {
  if (S.run.pausedAt) { S.run.paused += Date.now() - S.run.pausedAt; S.run.pausedAt = null; toast('Weiter'); }
  else { S.run.pausedAt = Date.now(); toast('Pause'); }
  save(); renderNavBottom();
}
async function endRunAsk() {
  const open = openStops().length;
  const v = await dialog({ title: 'Route beenden?', text: open ? `Noch ${plural(open, 'Stopp', 'Stopps')} offen.` : '', buttons: [{ label: 'Abbrechen', value: false }, { label: 'Beenden', cls: 'btn-r', value: true }] });
  if (!v) return;
  closeRun(false);
}
/* Übersprungene nicht vergessen: erst fragen, dann beenden */
let finishAsking = false;
async function finishRun() {
  const r = runRoute(); if (!r || finishAsking) return;
  const sk = r.stops.filter(s => s.status === 'skip' && s.lat != null);
  if (sk.length) {
    finishAsking = true;
    speak('Noch ' + plural(sk.length, 'Briefkasten', 'Briefkästen') + ' übersprungen');
    const names = sk.slice(0, 3).map(s => esc(s.street)).join(', ') + (sk.length > 3 ? ' …' : '');
    const v = await dialog({ title: `Noch ${sk.length} übersprungen`, text: names + '<br>Jetzt hin?', buttons: [{ label: 'Fertig', value: 'end' }, { label: 'Jetzt hin', cls: 'btn-p', value: 'go' }] });
    finishAsking = false;
    if (!runRoute() || openStops().length) return;
    if (v === 'go') {
      // nächster zuerst (ab deiner Position)
      let cur = pos || sk[0]; const left = sk.slice(), order = [];
      while (left.length) { let bi = 0; left.forEach((s, i) => { if (hav(cur, s) < hav(cur, left[bi])) bi = i; }); cur = left[bi]; order.push(cur.id); left.splice(bi, 1); }
      sk.forEach(s => s.status = 'open'); S.run.prio = order; save(true);
      toast('Weiter zu den übersprungenen');
      afterChange(); return;
    }
    if (v !== 'end') return;   // Fenster weggetippt → Tour läuft weiter
  }
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
  if (lastRunPos) {
    const d = hav(lastRunPos, pos), dt = (pos.t - lastRunPos.t) / 1000;
    if (d > 4 && d < 300) {
      S.run.dist = (S.run.dist || 0) + d;
      const v = dt > 0 ? d / dt : 0;
      if (dt <= 20 && v > .6 && v < 15) { S.run.moveDist = (S.run.moveDist || 0) + d; S.run.moveTime = (S.run.moveTime || 0) + dt; }
      lastRunPos = pos;
      const m = detectMode();
      if (m && m !== S.run.mode) {
        S.run.mode = m; S.run.plannedTotal = planTotalFor(r, m);
        toast(m === 'fuss' ? 'Zu Fuß erkannt – Zeit angepasst' : 'Roller erkannt – Zeit angepasst');
        renderNavBottom(); renderDrive();
      }
    } else if (d >= 300) lastRunPos = pos;
  } else lastRunPos = pos;
  const n = nextStop();
  // Ankunft: nächstgelegener offener Stopp im Radius
  const rad = S.settings.radius + Math.min(20, (pos.acc || 0) / 2);
  let near = null, nd = Infinity;
  for (const s of openStops()) { const d = hav(pos, tgt(s)) * (n && s.id === n.id ? 1 : 2.2); if (d < nd) { nd = d; near = s; } }
  if (near && nd <= rad && arriveShownFor !== near.id) {
    if (driveEl && n && near.id === n.id) { arriveShownFor = n.id; driveArrived = n.id; arrivalSignal(n); renderDrive(); }
    else showArrive(near, false);
  }
  if (leg && n && leg.target === n.id) { updateLegProgress(); checkOffRoute(); }
  if (Date.now() - (renderNavTop._t || 0) > 2500) { renderNavTop._t = Date.now(); renderNavTop(); updNavDist(); renderDrive(); }
  maybeLeg();
  voiceStep();
}
/* Falsch gefahren? Dann sofort still einen neuen Weg zum selben Haus rechnen – nicht erst nach 40 m.
   Gilt, wenn man zwei GPS-Punkte lang klar neben dem Weg ist oder in die falsche Richtung fährt. */
let offRoute = false, offCnt = 0;
const isMoving = () => heading != null && Date.now() - headingT < 6000 && !(gpsSpeed != null && gpsSpeed < 0.8);
function checkOffRoute() {
  if (!leg || !leg.real || !leg.cum || !pos || offRoute) return;
  const pr = projectAlong(leg, pos), acc = Math.min(pos.acc || 10, 40);
  leg.maxAlong = Math.max(leg.maxAlong || 0, pr.along);
  let wrong = false;
  if (isMoving() && leg.total - pr.along > 15) {
    const a = pointAlong(leg, pr.along), b = pointAlong(leg, pr.along + 12);
    if (hav(a, b) > 3) wrong = Math.abs(((heading - bearing(a, b)) % 360 + 540) % 360 - 180) > 75;
  }
  const off = pr.d > Math.max(25, acc * 1.5) || (wrong && (pr.d > Math.max(10, acc) || leg.maxAlong - pr.along > 20));
  offCnt = off ? offCnt + 1 : 0;
  if (offCnt >= 2) { offRoute = true; offCnt = 0; renderNavTop(); renderDrive(); drawMe(); maybeLeg(true); }
}
/* Letzte Meter zu Fuß: gestrichelt von der Straße bis zum Briefkasten (ab 4 m) */
function drawWalk(ab) {
  if (walkLine) { map.removeLayer(walkLine); walkLine = null; }
  if (ab && hav(ab[0], ab[1]) > 4) walkLine = L.polyline(ab.map(p => [p.lat, p.lon]), { color: cssv('--walk'), weight: 5, opacity: 1, dashArray: '6 7' }).addTo(map);
}
/* Weg zum nächsten Haus. Beim Fahren mit Fahrtrichtung, damit der Weg nach vorn weitergeht. */
async function osrmLeg(a, b) {
  if (isMoving() && gpsSpeed != null && gpsSpeed > 1.5) { try { return await osrmRoute([a, b], true, `&bearings=${Math.round(heading)},60;`); } catch (e) { } }
  return osrmRoute([a, b], true);
}
async function maybeLeg(force) {
  const n = nextStop(); if (!n || !pos) { if (legLine) { map.removeLayer(legLine); legLine = null; } drawWalk(null); return; }
  const same = leg && leg.target === n.id;
  const need = force || offRoute || !same || !leg.real || distToLine(pos, leg.coords) > 40;
  if (!need || legBusy) return;
  if (same && Date.now() - legReqAt < (force || offRoute ? 2500 : 12000)) return;
  legReqAt = Date.now(); legBusy = true;
  let rt = null;
  const T = tgt(n);
  try { rt = await osrmLeg(pos, T); } catch (e) { }
  legBusy = false;
  if (nextStop() !== n) return;
  const wasOff = offRoute; offRoute = false; offCnt = 0;
  const coords = rt ? rt.geometry.coordinates.map(c => ({ lat: c[1], lon: c[0] })) : [pos, { lat: T.lat, lon: T.lon }];
  leg = { target: n.id, coords, dur: rt ? rt.duration : hav(pos, T) * 1.4 / 4.2, dist: rt ? rt.distance : hav(pos, T) * 1.4, walk: rt ? hav(coords[coords.length - 1], T) : 0, steps: rt ? buildSteps(rt) : null, remainFrac: 1, real: !!rt };
  prepLeg(leg);
  spokenSteps = new Set();
  if (legLine) map.removeLayer(legLine);
  legLine = L.polyline(coords.map(p => [p.lat, p.lon]), { color: cssv('--leg'), weight: 7, opacity: .95, dashArray: rt ? null : '8 10' }).addTo(map);
  drawWalk(rt ? [coords[coords.length - 1], T] : null);
  if (lastTarget !== n.id) {
    lastTarget = n.id; follow = true;
    announceNext(n);
    const top = ($('#navTop').offsetHeight || 90) + 30, bot = ($('#navBottom').offsetHeight || 200) + 30;
    map.fitBounds(L.latLngBounds(coords.map(p => [p.lat, p.lon]).concat([[T.lat, T.lon]])), { paddingTopLeft: [40, top], paddingBottomRight: [80, bot], maxZoom: 18 });
    follow = false; setTimeout(() => { follow = true; }, 6000);
  } else if (wasOff) announceReroute();
  drawMe();
  renderNav();
}
/* Ansage für den nächsten Stopp: in derselben Straße nur die Nummer */
let legBusy = false, lastStreet = null;
const roundM = m => m >= 100 ? Math.round(m / 50) * 50 : Math.max(10, Math.round(m / 10) * 10);
/* „In 80 Metern links abbiegen in den Ahornweg, dann rechts abbiegen“ bzw. „Jetzt links abbiegen“ */
function stepPhrase(st) {
  const nx = nextStepAfter(st), then = nx ? ', dann ' + nx.now : '';
  if (st.dist > 30) { spokenSteps.add(st.i + 'pre'); return 'In ' + roundM(st.dist) + ' Metern ' + st.say + then; }
  spokenSteps.add(st.i + 'now'); spokenSteps.add(st.i + 'pre'); return 'Jetzt ' + st.now + then;
}
function announceNext(n) {
  if (!S.settings.voiceNav) return;
  const { str, hn } = splitAddr(n.street);
  let t = (str === lastStreet && hn) ? 'Weiter zu Nummer ' + hn.replace('/', ' Strich ') : 'Weiter zu ' + speakAddr(n);
  lastStreet = str;
  if (n.count > 1) t += '. ' + n.count + ' Blätter';
  if (n.name) t += '. ' + n.name;
  if (n.note) t += '. ' + n.note;
  const st = currentStep();
  if (st && !st.arrive) t += '. ' + stepPhrase(st);
  else { const w = wayLeft(n); if (w != null && w > 30) t += '. Noch ' + roundM(w) + ' Meter'; }
  speak(t);
}
function announceReroute() {
  if (!S.settings.voiceNav) return;
  const st = currentStep();
  if (st && !st.arrive) speak(stepPhrase(st), false, true);   // einfach der neue Weg, wie bei Google Maps
}
/* Liegt das Haus links oder rechts von der Fahrtrichtung? */
function houseSide(n) {
  let a = null, b = null;
  if (leg && leg.target === n.id && leg.real && leg.coords.length >= 2) {
    const c = leg.coords; b = c[c.length - 1];
    for (let i = c.length - 2; i >= 0; i--) if (hav(c[i], b) > 8) { a = c[i]; break; }
  }
  if (!a && pos && heading != null) { b = pos; a = { lat: pos.lat - Math.cos(heading * Math.PI / 180) * 1e-4, lon: pos.lon - Math.sin(heading * Math.PI / 180) * 1e-4 / Math.cos(pos.lat * Math.PI / 180) }; }
  const T = tgt(n);
  if (!a || !b || hav(b, T) < 3) return null;
  const kx = Math.cos(b.lat * Math.PI / 180);
  const dx = (b.lon - a.lon) * kx, dy = b.lat - a.lat, hx = (T.lon - b.lon) * kx, hy = T.lat - b.lat;
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
  if (!offRoute && leg && leg.target === n.id && leg.cum && leg.real) return Math.max(0, leg.total - projectAlong(leg, pos).along) + (leg.walk || 0);
  return hav(pos, tgt(n)) * 1.3;
}
function updateLegProgress() {
  if (!leg || !pos || !leg.cum) return;
  leg.remainFrac = clamp((leg.total - projectAlong(leg, pos).along) / Math.max(1, leg.total), 0, 1);
}
const DIRS = { left: 'links', right: 'rechts', 'slight left': 'leicht links', 'slight right': 'leicht rechts', 'sharp left': 'scharf links', 'sharp right': 'scharf rechts', straight: 'geradeaus', uturn: 'wenden' };
/* „in den Ahornweg“, „in die Birkenallee“ – Artikel nach der Endung des Straßennamens */
function inRoad(road) {
  if (!road) return '';
  if (/(stra(ß|ss)e|str\.|allee|gasse|promenade|chaussee|zeile)$/i.test(road)) return ' in die ' + road;
  if (/(weg|ring|platz|damm|pfad|steig|berg|hof|markt|graben|wall|winkel|bogen|garten)$/i.test(road)) return ' in den ' + road;
  if (/^(am|an|im|in|auf|zum|zur|unter|ober|hinter|vor)\s/i.test(road)) return ', ' + road;
  return ' in ' + road;
}
const ORD = ['', 'erste', 'zweite', 'dritte', 'vierte', 'fünfte', 'sechste'];
function buildSteps(rt) {
  const out = [];
  (rt.legs[0]?.steps || []).forEach((s, i) => {
    const m = s.maneuver; const mod = m.modifier || 'straight';
    if (m.type === 'depart') return;
    const road = s.name ? (s.ref ? s.name + ' (' + s.ref + ')' : s.name) : '';
    let text, short, then, say, now, arrive = false, icon = /left/.test(mod) ? ic.left : /right/.test(mod) ? ic.right : mod === 'uturn' ? ic.uturn : ic.straight;
    if (m.type === 'arrive') { text = 'Ziel erreicht – Briefkasten'; short = 'Ziel'; then = say = now = ''; arrive = true; icon = ic.flag; }
    else if (m.type === 'roundabout' || m.type === 'rotary' || m.type === 'exit roundabout') {
      text = `Im Kreisverkehr ${m.exit ? m.exit + '. Ausfahrt' : 'ausfahren'}${road ? ' – ' + road : ''}`; short = 'Kreisverkehr' + (m.exit ? ', ' + m.exit + '. Ausfahrt' : ''); then = 'Kreisverkehr'; icon = ic.round;
      say = now = m.exit ? `im Kreisverkehr die ${ORD[m.exit] || m.exit + '.'} Ausfahrt nehmen` : 'den Kreisverkehr verlassen';
    }
    else if (mod === 'straight' && (m.type === 'new name' || m.type === 'continue')) { text = 'Geradeaus' + (road ? ' auf ' + road : ''); short = text; then = 'geradeaus'; now = 'geradeaus weiter'; say = now + (s.name ? ', ' + s.name : ''); }
    else if (mod === 'uturn') { text = short = 'Wenden'; then = 'wenden'; say = now = 'bitte wenden'; }
    else {
      const D = DIRS[mod] || 'weiter', C = D[0].toUpperCase() + D.slice(1);
      text = `${DIRS[mod] ? C : 'Weiter'} abbiegen${road ? ' in ' + road : ''}`; short = C + (inRoad(s.name) || ' abbiegen'); then = D;
      now = D + ' abbiegen'; say = now + inRoad(s.name);
    }
    out.push({ i, lat: m.location[1], lon: m.location[0], text, short, then, say, now, arrive, icon });
  });
  return out;
}
/* Kommt kurz nach dem Abbiegen gleich das nächste? Dann „Dann rechts“ zeigen. */
function nextStepAfter(stp) {
  if (!leg || !leg.steps) return null;
  const k = leg.steps.findIndex(x => x.i === stp.i), nx = leg.steps[k + 1];
  return nx && !nx.arrive && nx.along - leg.steps[k].along <= 120 ? nx : null;
}
/* Der Abbiege-Punkt gilt, bis man 8 m daran vorbei ist – egal ob Ansagen an oder aus sind */
function currentStep() {
  if (!leg || !leg.steps || !pos) return null;
  const at = projectAlong(leg, pos).along;
  for (const s of leg.steps) { const d = s.along - at; if (d > -8) return Object.assign({}, s, { dist: Math.max(0, d) }); }
  return null;
}
/* Zwei Ansagen pro Abbiegen: früh („In 80 Metern …“) und direkt davor („Jetzt …“). Wie früh, hängt vom Tempo ab. */
function voiceStep() {
  if (!S.settings.voiceNav || offRoute) return;
  const s = currentStep(); if (!s || s.arrive) return;
  const v = clamp(gpsSpeed || 3, 1, 8), near = Math.max(15, v * 4), pre = Math.max(50, v * 18);
  const nx = nextStepAfter(s), then = nx ? ', dann ' + nx.now : '';
  if (s.dist < near && !spokenSteps.has(s.i + 'now')) { spokenSteps.add(s.i + 'now'); spokenSteps.add(s.i + 'pre'); speak('Jetzt ' + s.now + then, false, true); }
  else if (s.dist < pre && s.dist > near * 1.8 && !spokenSteps.has(s.i + 'pre')) { spokenSteps.add(s.i + 'pre'); speak('In ' + roundM(s.dist) + ' Metern ' + s.say + then); }
}
function speakAddr(s) { const { str, hn } = splitAddr(s.street); return str.replace(/str\./i, 'straße') + ' ' + hn.replace('/', ' Strich '); }
let voice;
function speak(t, force, urgent) {
  if (!('speechSynthesis' in window)) return;
  if (!force && !S.settings.voiceNav && !S.settings.voiceName) return;
  try {
    if (!voice) voice = speechSynthesis.getVoices().find(v => /^de/i.test(v.lang));
    const u = new SpeechSynthesisUtterance(t); u.lang = 'de-DE'; if (voice) u.voice = voice; u.rate = 1.02;
    if (urgent || speechSynthesis.pending) speechSynthesis.cancel();   // Abbiegen geht vor
    speechSynthesis.speak(u);
  } catch (e) { }
}
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => { voice = null; };
let arriveEl = null, sideEl = null;
function showArrive(s, manual) {
  closeArrive(); arriveShownFor = s.id;
  const n = nextStop(); const other = n && n.id !== s.id;
  const { str, hn } = splitAddr(s.street);
  const r = runRoute() || R(); const list = stopsOrdered(r), no = list.indexOf(s) + 1;
  const side = S.run && !other ? houseSide(s) : null;
  arriveEl = document.createElement('div'); arriveEl.className = 'arrive' + (other ? ' other' : '');
  arriveEl.innerHTML = `<div class="ar-top"><span>Stopp ${no} von ${list.length}${s.status === 'done' ? ', erledigt' : ''}</span><button id="aX" aria-label="Schließen">${ic.x}</button></div>
    <div class="ar-row"><div class="ar-hn">${esc(hn || '–')}</div><div class="ar-st">${esc(str)}</div></div>
    ${s.name ? `<div class="ar-name">${esc(s.name)}</div>` : ''}
    ${s.count > 1 || s.note ? `<div class="hints">${s.count > 1 ? `<div class="hint c">${s.count} Blätter</div>` : ''}${s.note ? `<div class="hint">${esc(s.note)}</div>` : ''}</div>` : ''}
    ${other ? `<div class="ar-warn">Geplant wäre ${esc(n.street)}</div>` : ''}
    ${S.run ? `<button class="go" id="aDone">${ic.check}Eingeworfen</button><button class="btn btn-ghost" id="aSkip">Überspringen</button>` : ''}`;
  document.body.appendChild(arriveEl); document.body.classList.add('arrived');
  if (side) { sideEl = document.createElement('div'); sideEl.className = 'side'; sideEl.innerHTML = (side === 'links' ? ic.left2 : ic.right2) + 'Haus ' + side; document.body.appendChild(sideEl); }
  $('#aX', arriveEl).onclick = closeArrive;
  if (S.run) { $('#aDone', arriveEl).onclick = () => markDone(s); $('#aSkip', arriveEl).onclick = () => skipStop(s); }
  if (!manual) arrivalSignal(s);
  if (!manual) camFollow(500, Math.max(map.ml.getZoom(), 18));   // näher ran, Pfeil bleibt über der Karte sichtbar
}
function arrivalSignal(s) {
  const { hn } = splitAddr(s.street);
  if (S.settings.vibrate && navigator.vibrate) navigator.vibrate([120, 60, 120]);
  const side = houseSide(s);
  if (S.settings.voiceName) speak(`${hn ? 'Nummer ' + hn.replace('/', ' Strich ') + (side ? ' ist ' + side : '') + '. ' : side ? 'Das Haus ist ' + side + '. ' : ''}${s.count > 1 ? s.count + ' Blätter. ' : ''}${s.name || ''}${s.note ? '. ' + s.note : ''}`, true);
}
function closeArrive() {
  if (arriveEl) { arriveEl.remove(); arriveEl = null; } if (sideEl) { sideEl.remove(); sideEl = null; }
  document.body.classList.remove('arrived');
}

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
  const total = r.stops.length, done = r.stops.filter(x => x.status === 'done').length;
  const est = remainingEstimate(); const end = est ? Date.now() + est.sec * 1000 : null;
  const voice = S.settings.voiceNav;
  if (!n) { driveEl.className = 'drive here'; driveEl.innerHTML = `<div class="dv-top"><span></span><button id="dvX" class="dv-x">${ic.map}<small>Karte</small></button></div><div class="dv-mid"><div class="dv-hn">✓</div><div class="dv-st">Alle Briefkästen erledigt</div></div>`; $('#dvX', driveEl).onclick = () => closeDrive(); return; }
  const here = driveArrived === n.id;
  const { str, hn } = splitAddr(n.street);
  const stp = !here && !offRoute && leg && leg.target === n.id ? currentStep() : null;
  let dir;
  const side = here ? houseSide(n) : null;
  if (here && side) dir = `<div class="dv-dir dv-side">${side === 'links' ? ic.left2 : ic.right2}<div><b>Haus ${side}</b></div></div>`;
  else if (here) dir = `<div class="dv-dir">${ic.flag}<div><b>Du bist da</b></div></div>`;
  else if (stp && !stp.arrive) dir = `<div class="dv-dir">${stp.icon}<div><b>${fmtM(stp.dist)}</b><small>${esc(stp.short)}</small></div></div>`;
  else dir = `<div class="dv-dir">${ic.straight}<div><b>${wayLeft(n) != null ? fmtKm(wayLeft(n)) : 'Weiter'}</b><small>bis zum Haus</small></div></div>`;
  driveEl.className = 'drive' + (here ? ' here' : '');
  driveEl.innerHTML = `
    <div class="dv-top"><button id="dvV" class="dv-x ${voice ? 'on' : ''}">${voice ? ic.vol : ic.mute}<small>Ansagen</small></button>
      <span class="dv-prog">${done} von ${total}${end ? `, fertig ${fmtTime(end)}` : ''}</span>
      <button id="dvX" class="dv-x">${ic.map}<small>Karte</small></button></div>
    ${dir}
    <div class="dv-mid"><div class="dv-hn">${esc(hn || '–')}</div><div class="dv-st">${esc(str)}</div>
      ${n.name ? `<div class="ar-name">${esc(n.name)}</div>` : ''}
      ${n.count > 1 ? `<div class="ar-cnt">${n.count} Blätter</div>` : ''}
      ${n.note ? `<div class="ar-note">${esc(n.note)}</div>` : ''}</div>
    <button class="go" id="dvDone">${ic.check}Eingeworfen</button>
    <button class="btn btn-ghost" id="dvSkip">Überspringen</button>`;
  $('#dvX', driveEl).onclick = () => closeDrive();
  $('#dvV', driveEl).onclick = toggleVoice;
  $('#dvDone', driveEl).onclick = () => { driveArrived = null; markDone(n); };
  $('#dvSkip', driveEl).onclick = () => { driveArrived = null; skipStop(n); };
}

/* ---------- Einstellungen ---------- */
function openSettings() {
  const st = S.settings;
  const tog = (k, l) => `<div class="row"><div class="l">${l}</div><button class="tog ${st[k] ? 'on' : ''}" data-t="${k}"></button></div>`;
  const card = (icon, title, inner) => `<div class="set-card"><div class="set-ct">${icon}<span>${title}</span></div>${inner}</div>`;
  const chev = ic.chev.replace('<svg', '<svg class="chev"');
  const seg = (id, key, opts) => `<div class="seg" id="${id}">${opts.map(([v, l]) => `<button data-v="${v}" class="${st[key] === v ? 'sel' : ''}">${l}</button>`).join('')}</div>`;
  const pg = openPage(`<div class="page-h"><button class="icon-btn" data-close>${ic.back}</button><h1>Einstellungen</h1><span style="width:46px"></span></div>
  <div class="page-b set-page">
    ${card(ic.layers, 'Anzeige', `
      <div class="link-row" id="eLook"><span>Aussehen</span><b>${DESIGNS[st.design].name}</b>${chev}</div>
      ${tog('tilt3d', '3D beim Fahren')}
      ${tog('keepAwake', 'Bildschirm bleibt an')}`)}
    ${card(ic.home, 'Start', `
      <div class="link-row" id="eHome"><span>Startadresse<br><small class="sub">${st.home.label ? esc(st.home.label + ', ' + st.home.zip + ' ' + st.home.city) + (st.home.lat == null ? ' (nicht gefunden)' : '') : '–'}</small></span>${chev}</div>`)}
    ${card(ic.map, 'Unterwegs', `
      <div class="row"><div class="l">Berg vermeiden</div>${seg('eHill', 'hill', [[0, 'Aus'], [1, 'Etwas'], [2, 'Stark']])}</div>
      <div class="row"><div class="l">Ankunft ab</div>${seg('eRad', 'radius', [[15, '15 m'], [25, '25 m'], [40, '40 m']])}</div>`)}
    ${card(ic.vol, 'Ton', `
      ${tog('voiceName', 'Name vorlesen')}
      ${tog('clickSound', 'Ton beim Abhaken')}
      ${tog('vibrate', 'Vibrieren')}`)}
    ${card(ic.clock, 'Austragetag', `
      ${tog('dayOn', 'Anzeigen')}
      <div id="eDayBox" style="${st.dayOn ? '' : 'display:none'}">
        <div class="row"><div class="l">Nächster Termin</div><input type="date" id="eDay" class="date-in" value="${st.dayNext || ''}"></div>
        <div class="row"><div class="l">Alle</div>${seg('eEvery', 'dayEvery', [[7, '1 Wo.'], [14, '2 Wo.'], [28, '4 Wo.']])}</div>
      </div>`)}
    ${card(ic.csv, 'Daten', `
      <div class="link-row" id="eBak"><span>Backup speichern<br><small class="sub">${S.lastBackup ? 'zuletzt ' + fmtDate(S.lastBackup) : 'noch keins'}</small></span>${chev}</div>
      <div class="link-row" id="eRes"><span>Backup laden</span>${chev}</div>
      ${tog('backupOn', 'An Backup erinnern')}
      <div class="link-row" id="eMain"><span>Routen aus normaler App neu holen</span>${chev}</div>
      <div class="link-row red" id="eWipe"><span>Alles löschen</span></div>`)}
    <div class="set-foot">Oli ${VERSION}<br>© OpenStreetMap, OpenFreeMap, Esri, OSRM, Open-Meteo</div>
  </div>`, { onClose: () => { drawMarkers(); renderSheet(); } });
  const el = pg.el; const re = () => { pg.close(); openSettings(); };
  el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { const k = b.dataset.t; st[k] = !st[k]; b.classList.toggle('on', st[k]); save(); if (k === 'dayOn') $('#eDayBox', el).style.display = st[k] ? '' : 'none'; if (k === 'tilt3d') camFollow(400); });
  const segSet = (sel, key, after) => el.querySelectorAll(sel + ' button').forEach(b => b.onclick = () => { st[key] = +b.dataset.v; el.querySelectorAll(sel + ' button').forEach(x => x.classList.toggle('sel', x === b)); save(); after && after(); });
  segSet('#eHill', 'hill', () => { S.routes.forEach(r => r.optimized = false); save(); toast('Bitte Route neu optimieren'); });
  segSet('#eRad', 'radius'); segSet('#eEvery', 'dayEvery');
  $('#eLook', el).onclick = () => openLook(re);
  $('#eHome', el).onclick = async () => {
    const v = await dialog({ title: 'Startadresse', input: { value: st.home.label ? st.home.label + ', ' + st.home.zip + ' ' + st.home.city : '', placeholder: 'Straße Nr, PLZ Ort' }, buttons: [{ label: 'Abbrechen', value: false }, { label: 'Suchen', cls: 'btn-p', value: true }] });
    if (!v) return; st.home = Object.assign(parseAddr(v), { lat: null, lon: null, ele: null });
    const b = busy('Startadresse wird gesucht'); await geocodeHome(); b.close();
    S.routes.forEach(r => { r.optimized = false; r.matrix = null; }); save();
    toast(st.home.lat != null ? 'Gefunden ✓ Bitte Routen neu optimieren' : 'Nicht gefunden'); re();
  };
  $('#eDay', el).onchange = e => { st.dayNext = e.target.value || null; save(); };
  $('#eBak', el).onclick = () => backupNow();
  $('#eMain', el).onclick = async () => { if (!(await confirmDlg('Neu holen?', 'Was du nur in der Beta geändert hast, wird ersetzt.', 'Neu holen'))) return; if (copyFromMain()) location.reload(); else toast('In der normalen App ist noch nichts gespeichert'); };
  $('#eRes', el).onclick = () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => { try { const d = JSON.parse(await inp.files[0].text()); if (!Array.isArray(d.routes)) throw 0; if (!(await confirmDlg('Backup laden?', `${d.routes.length} Routen. Deine jetzigen Daten werden ersetzt.`, 'Laden'))) return; S = Object.assign(structuredClone(DEFAULTS), d); S.settings = Object.assign(structuredClone(DEFAULTS.settings), d.settings); save(true); location.reload(); } catch (e) { toast('Das ist keine gültige Backup-Datei'); } };
    inp.click();
  };
  $('#eWipe', el).onclick = async () => { if (await confirmDlg('Wirklich alles löschen?', 'Alle Routen, Namen und Einstellungen werden von diesem Handy gelöscht.', 'Alles löschen', 'btn-r')) { localStorage.removeItem(KEY); localStorage.removeItem('olli.unlocked'); location.reload(); } };
}
/* Aussehen: drei Designs zum Durchwischen. Die Vorschau ist ein kleines Bild mit erfundener Adresse. */
function miniPreview() {
  return `<div class="mini"><svg class="mm" viewBox="0 0 392 804"><rect width="392" height="804" style="fill:var(--mm-land)"/>
    <g style="fill:var(--mm-bld)"><rect x="74" y="232" width="44" height="30" rx="3"/><rect x="128" y="232" width="44" height="30" rx="3"/><rect x="74" y="280" width="40" height="34" rx="3"/><rect x="218" y="236" width="42" height="30" rx="3"/><rect x="272" y="282" width="44" height="32" rx="3"/><rect x="218" y="370" width="44" height="30" rx="3"/><rect x="272" y="418" width="42" height="34" rx="3"/><rect x="218" y="470" width="44" height="30" rx="3"/><rect x="-6" y="250" width="36" height="34" rx="3"/><rect x="-6" y="400" width="36" height="34" rx="3"/><rect x="356" y="380" width="40" height="34" rx="3"/></g>
    <rect x="72" y="366" width="104" height="204" rx="12" style="fill:var(--mm-park)"/>
    <path d="M196 0V804M-10 346H402M-10 592H402M52 0V804M338 0V804M-10 200H402" style="stroke:var(--mm-road);stroke-width:25;fill:none"/>
    <path d="M118 346H52V200" style="stroke:var(--route);stroke-width:6;fill:none;opacity:.35"/>
    <path d="M196 506V358a12 12 0 0 0-12-12H118" style="stroke:var(--route);stroke-width:9;fill:none;stroke-linecap:round"/>
    <path d="M196 487 210 521 196 514 182 521Z" style="fill:var(--puck);stroke:var(--puck-edge);stroke-width:3.5;stroke-linejoin:round"/></svg>
    <div class="pin next" style="position:absolute;left:101px;top:284px;margin:0">7</div>
    <div class="mini-top"><div class="turn"><div class="turn-ic">${ic.left}</div><div class="turn-t"><div class="turn-d">90 m</div><div class="turn-s">Links in den Ahornweg</div></div></div><div class="then">${ic.right}Dann rechts</div></div>
    <div class="mini-bot panel"><div class="nrow"><div class="badge">7</div><div class="next-txt"><div class="next-a">Ahornweg 12</div><div class="next-n">Beispiel<span class="cnt">2 Blätter</span></div></div><div class="next-m">140 m</div></div>
      <div class="acts"><div class="sq">${ic.skip}</div><div class="go">${ic.check}Eingeworfen</div><div class="sq">${ic.more}</div></div>
      <div class="nprog"><span>6 von 24</span><div class="bar"><i style="width:25%"></i></div><span>fertig 17:40</span></div></div></div>`;
}
function openLook(onClose) {
  const keys = Object.keys(DESIGNS), mini = miniPreview();
  const pg = openPage(`<div class="page-h"><button class="icon-btn" data-close>${ic.back}</button><h1>Aussehen</h1><span style="width:46px"></span></div>
    <div class="page-b"><div class="pk-car" id="pkCar">${keys.map(k => `<div class="pk-it" data-k="${k}" data-design="${k}">${mini}</div>`).join('')}</div>
    <div class="pk-name" id="pkName"></div><div class="pk-dots" id="pkDots">${keys.map(() => '<i></i>').join('')}</div></div>`, { onClose });
  const car = $('#pkCar', pg.el), its = [...car.children];
  const mark = k => { its.forEach(x => x.classList.toggle('on', x.dataset.k === k)); $('#pkName', pg.el).textContent = DESIGNS[k].name; [...$('#pkDots', pg.el).children].forEach((d, i) => d.classList.toggle('on', keys[i] === k)); };
  const pick = k => { mark(k); if (S.settings.design === k) return; S.settings.design = k; save(true); applyTheme(); map.restyle(styleFor()); recolor(); };
  const mid = x => x.offsetLeft + x.offsetWidth / 2;
  mark(S.settings.design); car.scrollLeft = mid(its[keys.indexOf(S.settings.design)]) - car.clientWidth / 2;
  let t; car.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(() => { const c = car.scrollLeft + car.clientWidth / 2; pick(its.reduce((a, x) => Math.abs(mid(x) - c) < Math.abs(mid(a) - c) ? x : a).dataset.k); }, 80); }, { passive: true });
  its.forEach(x => x.onclick = () => car.scrollTo({ left: mid(x) - car.clientWidth / 2, behavior: 'smooth' }));
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
function backupNow() {
  download('oli-beta-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(Object.assign({}, S, { pw: null, run: null })), 'application/json');
  S.lastBackup = Date.now(); save(true); toast('Backup gespeichert (Ordner „Downloads“)');
}
async function startupReminders() {
  const st = S.settings, today = isoDay(new Date());
  const d = st.dayOn ? nextDeliveryDay() : null;
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const isToday = d && isoDay(d) === today, isTomorrow = d && st.remindWhen === 'before' && isoDay(d) === isoDay(tomorrow);
  if ((isToday || isTomorrow) && S.dayGreeted !== today && !S.run) {
    S.dayGreeted = today; save();
    const v = await dialog({ title: isToday ? 'Heute ist Austragetag' : 'Morgen ist Austragetag', buttons: isToday ? [{ label: 'Später', value: 0 }, { label: `${ic.play} Route starten`, cls: 'btn-p', value: 1 }] : [{ label: 'OK', cls: 'btn-p', value: 0 }] });
    if (v) pickRoute();
    return;
  }
  const hasData = S.routes.some(r => r.stops.length);
  const DAY = 864e5;
  if (st.backupOn && hasData && !S.run && (!S.lastBackup || Date.now() - S.lastBackup > st.backupEvery * DAY) && (!S.backupAsked || Date.now() - S.backupAsked > 2 * DAY)) {
    S.backupAsked = Date.now(); save();
    const v = await dialog({ title: 'Backup machen?', text: S.lastBackup ? 'Letztes Backup: ' + fmtDate(S.lastBackup) : 'Du hast noch kein Backup.', buttons: [{ label: 'Später', value: 0 }, { label: 'Jetzt sichern', cls: 'btn-p', value: 1 }] });
    if (v) backupNow();
  }
}

/* ---------- Start ---------- */
async function main() {
  load(); applyTheme();
  initMap();
  $('#btnLayer').innerHTML = ic.layers; $('#btnLocate').innerHTML = ic.locate;
  $('#scrim').onclick = closeDrawer; $('#btnVoice').onclick = toggleVoice; renderVoiceFab();
  $('#btnLayer').onclick = () => setSat(!sat);

  if (S.settings.sat) setSat(true, true);
  $('#btnLocate').onclick = () => { startGPS(); follow = true; headUp = true; if (pos) { map.setView([pos.lat, pos.lon], Math.max(map.getZoom(), 17)); camFollow(400); } else toast('Standort wird gesucht…'); };
  $('#btnCompass').innerHTML = COMPASS; $('#btnCompass').onclick = () => { headUp = false; map.ml.easeTo({ bearing: 0, pitch: 0, duration: 500 }); };
  initSheetDrag();
  if (!S.activeId && S.routes[0]) S.activeId = S.routes[0].id;
  drawMarkers(); drawRouteLine(); renderSheet(); fitAll();
  startGPS();
  if (S.run && runRoute()) enterNav(); else S.run = null;
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
  if (S.routes.length && !BETA) setTimeout(startupReminders, 800);
  if (copiedFromMain) setTimeout(() => toast('Routen aus der normalen App übernommen ✓', 3500), 600);
  if (!S.routes.length) setTimeout(() => dialog({ title: 'Hallo 👋', buttons: [{ label: 'Später', value: 0 }, { label: 'Route erstellen', cls: 'btn-p', value: 1 }] }).then(v => v && createRoute()), 400);
}
window.addEventListener('error', e => { console.error(e.error || e.message); });
main();
