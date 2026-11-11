/* Kakitori service worker: makes the app work offline.
   Bump VER together with VER in index.html on every release. */
const VER = '1.3.4';
const CACHE = 'kakitori-v' + VER;
const abs = (p) => new URL(p, self.registration.scope).href;
const INDEX = abs('index.html');
const CORE = [INDEX, abs('manifest.webmanifest')];   // must exist, or install fails
const OPTIONAL = ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'].map(abs);   // skipped if missing
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(async (c) => {
        await c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })));
        await Promise.all(OPTIONAL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith('kakitori') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Page loads: network first (so updates arrive), cached copy when offline or slow (> 4 s).
async function page(e) {
  const c = await caches.open(CACHE);
  const net = fetch(e.request).then((r) => { if (r.ok) c.put(INDEX, r.clone()); return r; });
  const slow = new Promise((res) => setTimeout(() => res(null), 4000));
  try { const r = await Promise.race([net, slow]); if (r) return r; } catch (_) {}
  const hit = await c.match(INDEX);
  if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
  return net;
}

// Everything else: cached copy first, filled from the network on a miss.
async function cacheFirst(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok) c.put(req, r.clone());
  return r;
}

// Google Fonts: show the cached copy, refresh it in the background.
async function fonts(e) {
  const c = await caches.open(CACHE);
  const hit = await c.match(e.request);
  const net = fetch(e.request).then((r) => { if (r.ok || r.type === 'opaque') c.put(e.request, r.clone()); return r; });
  if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
  return net;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (req.mode === 'navigate') { e.respondWith(page(e)); return; }
  if (u.origin === self.location.origin) { e.respondWith(cacheFirst(req)); return; }
  if (FONT_HOSTS.includes(u.hostname)) e.respondWith(fonts(e));
});
