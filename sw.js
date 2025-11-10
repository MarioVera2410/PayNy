const CACHE_NAME = 'PayNy';
const CORE = [
  '/', '/inicio', '/dashboard',
  '/inicio.html', '/dashboard.html',
  '/assets/app.js', '/manifest.webmanifest'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // 1) NAVIGATIONS: network-first con fallback
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const netRes = await fetch(req, { redirect: 'follow' });

        if (!netRes || netRes.redirected || netRes.type === 'opaqueredirect' || netRes.type === 'opaque') {
          return netRes;
        }

        if (netRes.ok && netRes.status === 200) {
          const resForCache = netRes.clone();
          event.waitUntil((async () => {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(req, resForCache);
          })());
        }
        return netRes;
      } catch (e) {
        const cached = await caches.match(req)
                   || await caches.match('/inicio')
                   || await caches.match('/inicio.html');
        return cached || Response.error();
      }
    })());
    return;
  }

  // 2) API: no cachear
  if (sameOrigin && url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(req).catch(() => new Response('Offline', { status: 503 })));
    return;
  }

  // 3) Imágenes/iconos: Cache-First
  if (/\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;

      const netRes = await fetch(req).catch(() => null);
      if (!netRes || !netRes.ok || netRes.redirected || netRes.type === 'opaque') return netRes || Response.error();

      const resForCache = netRes.clone();
      event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(req, resForCache);
      })());
      return netRes;
    })());
    return;
  }

  // 4) CSS/JS/HTML estático: Stale-While-Revalidate
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const netPromise = fetch(req).then(netRes => {
      if (netRes && netRes.ok && !netRes.redirected && netRes.type !== 'opaque') {
        const resForCache = netRes.clone();
        event.waitUntil((async () => {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(req, resForCache);
        })());
      }
      return netRes;
    }).catch(() => cached);
    return cached || netPromise;
  })());
});

// ✅ Estos DOS listeners deben ir FUERA del fetch:

self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch {}
  const title = data.title || 'Notificación';
  const options = {
    body: data.body || '',
    icon: '/assets/icons/icon-192-.png',
    badge: '/assets/icons/badge-72.png',
    data: { url: data.url || '/' }
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const urlToOpen = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;

  e.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Busca una pestaña de tu app
    const client = allClients.find(c => c.url.startsWith(self.location.origin));
    if (client) {
      try { await client.navigate(urlToOpen); } catch {}
      return client.focus();
    }
    return clients.openWindow(urlToOpen);
  })());
});
