/* HISOB PRO — service worker
 * - Маълумоти молиявӣ (/api/*) ҲЕҶ ГОҲ кэш намешавад — ҳамеша аз сервер (рақамҳо ҳамеша дуруст).
 * - Саҳифа (navigation): аввал шабака; бе интернет — нусхаи охирини барнома.
 * - /assets/* (номи файл бо hash, тағйирнопазир): аввал кэш.
 * - Нишонаҳо, manifest ва ғ.: кэш + навсозӣ дар замина.
 */
const SHELL = 'hisob-shell-v1';
const ASSETS = 'hisob-assets-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (![SHELL, ASSETS].includes(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Google Fonts ва ғ. — браузер худаш
  if (url.pathname.startsWith('/api/')) return; // ҳеҷ гоҳ кэш намекунем

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) {
            const cache = await caches.open(SHELL);
            await cache.put('/', res.clone());
          }
          return res;
        } catch {
          const cached = await caches.match('/', { cacheName: SHELL });
          return (
            cached ||
            new Response(
              '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;background:#07070c;color:#e2e8f0;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center"><div><h2>HISOB PRO</h2><p>Интернет нест. Пайвастро санҷед ва саҳифаро аз нав кушоед.</p></div>',
              { headers: { 'content-type': 'text/html; charset=utf-8' } },
            )
          );
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSETS);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) {
          await cache.put(req, res.clone());
          trim(cache, 60);
        }
        return res;
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL);
      const hit = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit || network;
    })(),
  );
});
