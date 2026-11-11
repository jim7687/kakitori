/* Kakitori service worker: makes the app work offline.
   Bump VER together with VER in index.html on every release. */
const VER = '1.3.5';
const CACHE = 'kakitori-v' + VER;
const abs = (p) => new URL(p, self.registration.scope).href;
const INDEX = abs('index.html');
const CORE = [INDEX, abs('manifest.webmanifest')];   // must exist, or install fails
const OPTIONAL = ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'].map(abs);   // skipped if missing
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
// Must match the stylesheet link in index.html exactly.
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@600&family=Zen+Kaku+Gothic+New:wght@400;700&display=swap';
const FONT_SUBSETS = ['latin', 'latin-ext'];   // saved at install; Japanese glyph files are saved as they are used

// Saves the Google Fonts stylesheet and its Latin font files so the first offline launch looks right.
async function saveFonts(c) {
  const res = await fetch(FONT_CSS);
  if (!res.ok) return;
  const css = await res.clone().text();
  await c.put(FONT_CSS, res);
  const re = /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{[^}]*?src:\s*url\(([^)]+)\)/g;
  const files = [];
  for (let m; (m = re.exec(css));) if (FONT_SUBSETS.includes(m[1])) files.push(m[2].replace(/['"]/g, ''));
  await Promise.all(files.map((u) => fetch(u).then((r) => { if (r.ok) return c.put(u, r); }).catch(() => {})));
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(async (c) => {
        await c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })));
        await Promise.all(OPTIONAL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
        await saveFonts(c).catch(() => {});   // fonts are a bonus: never fail the install
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
