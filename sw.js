// RouteIQ — Service Worker de actualización forzada.
// No guarda la app en caché: su único objetivo es que los teléfonos de los
// mensajeros siempre carguen la versión más reciente de index.html.
// La versión llega en la URL de registro (sw.js?v=APP_VERSION, ver index.html);
// al cambiarla, el navegador instala este SW de nuevo y se activa de inmediato.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Borra cualquier caché que haya dejado una versión anterior
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Navegación (index.html): siempre de la red, sin caché HTTP.
// Todo lo demás (Firestore, fuentes, CDN) pasa directo sin intervención.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode !== 'navigate' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req, { cache: 'no-store' }).catch(() => fetch(req))
  );
});
