// RN-149 — Service worker do modo offline dos checklists.
// - Páginas de execução de checklist (/app/uan/checklists/…): rede primeiro; sem rede, a última cópia guardada.
// - Arquivos estáticos do Next (/_next/static/…, com hash no nome): cache primeiro.
// Nada mais é interceptado (API, imagens privadas, outras páginas seguem direto para a rede).
const CACHE = 'rafanutri-uan-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('rafanutri-uan-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === 'navigate' && url.pathname.startsWith('/app/uan/checklists/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.type === 'basic' && !res.redirected) caches.open(CACHE).then((c) => c.put(url.pathname, res.clone()));
          return res;
        })
        .catch(async () => (await caches.match(url.pathname)) || Response.error()),
    );
  }
});
