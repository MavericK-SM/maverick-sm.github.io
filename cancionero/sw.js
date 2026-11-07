// Guarda la app completa en el celular la primera vez: después funciona sin internet.
// Al cambiar cualquier archivo, sube VERSION para que los celulares descarguen la nueva.
const VERSION = 'cancionero-web-1';
const FILES = [
  './',
  'index.html',
  'misa.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/almacen.js',
  'js/buscador.js',
  'js/ficha.js',
  'js/iconos.js',
  'js/letra.js',
  'js/misa.js',
  'datos/cancionero_411.json',
  'fuentes/inter_regular.ttf',
  'fuentes/inter_italic.ttf',
  'fuentes/inter_semibold.ttf',
  'fuentes/source_serif_semibold.ttf',
  'fuentes/inter-ofl.txt',
  'fuentes/source-serif-ofl.txt',
  'fuentes/apache-2.0.txt',
  'iconos/icono-180.png',
  'iconos/icono-192.png',
  'iconos/icono-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      // En la computadora de prueba, primero lo recién editado; sin servidor, lo guardado.
      if (location.hostname === 'localhost') {
        try {
          return await fetch(request, { cache: 'no-store' });
        } catch {
          // sigue abajo con lo guardado
        }
      }
      if (request.mode === 'navigate') {
        // El link de Misa (…/misa?…) y cualquier otra página de la app, sin internet.
        const path = new URL(request.url).pathname;
        const page = /\/misa(\.html)?\/?$/.test(path) ? 'misa.html' : 'index.html';
        const cached = await cache.match(page);
        if (cached) return cached;
      }
      const cached = await cache.match(request, { ignoreSearch: true });
      return cached || fetch(request);
    })(),
  );
});
