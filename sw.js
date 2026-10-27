// Service worker minimo: serve per l'installazione sulla home.
// Prima prova la rete, se non c'e' usa la copia salvata dei file dell'app.
// I dati del foglio non passano da qui: li gestisce app.js.
const CACHE = 'mxlv-shell-v10';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Audio e video vanno diretti in rete: Safari li chiede a pezzi e via service worker non partono.
  if (url.pathname.endsWith('.mp3') || e.request.headers.has('range') || ['audio', 'video'].includes(e.request.destination)) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
