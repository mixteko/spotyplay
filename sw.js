const CACHE_PREFIX = "spotify-ai-pwa-";
const CACHE_NAME = "spotify-ai-pwa-v2";

// Ruta base real de la aplicación, derivada del scope del Service Worker.
// - Local:       scope "http://localhost:8001/"       -> APP_BASE_PATH ""
// - GitHub Pages: scope "https://mixteko.github.io/spotyplay/" -> APP_BASE_PATH "/spotyplay"
let APP_BASE_PATH = "";
try {
  APP_BASE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, "");
} catch (error) {
  // Si el scope no estuviera disponible, se usa la raíz del origin.
  APP_BASE_PATH = "";
}

const APP_SHELL = [
  `${APP_BASE_PATH}/`,
  `${APP_BASE_PATH}/index.html`,
  `${APP_BASE_PATH}/style.css`,
  `${APP_BASE_PATH}/app.js`,
  `${APP_BASE_PATH}/manifest.webmanifest`,
  `${APP_BASE_PATH}/pwa-icon.svg`,
  `${APP_BASE_PATH}/pwa-install.css`,
  `${APP_BASE_PATH}/pwa-install.js`
];

// Archivos críticos: deben intentar siempre obtener la versión de red
// y actualizar el caché. El sw.js no se sirve por fetch (lo controla
// el navegador), por lo que no necesita estar en esta lista.
const CRITICAL_ASSETS = [
  `${APP_BASE_PATH}/`,
  `${APP_BASE_PATH}/index.html`,
  `${APP_BASE_PATH}/app.js`,
  `${APP_BASE_PATH}/pwa-install.js`,
  `${APP_BASE_PATH}/manifest.webmanifest`
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            // Solo se eliminan cachés de esta aplicación.
            .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (isCriticalRequest(event.request)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(staleWhileRevalidate(event.request));
});

function isCriticalRequest(request) {
  const requestUrl = new URL(request.url);

  return (
    request.mode === "navigate" ||
    CRITICAL_ASSETS.includes(requestUrl.pathname)
  );
}

// Estrategia network-first para archivos críticos y navegaciones:
// intenta la red, actualiza el caché y solo usa el caché si la red falla.
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const freshResponse = await fetch(request);

    if (freshResponse.ok) {
      await cache.put(request, freshResponse.clone());
      return freshResponse;
    }

    const cachedResponse = await cache.match(request);
    return cachedResponse || freshResponse;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    return cachedResponse || Response.error();
  }
}

// Estrategia stale-while-revalidate para el resto de estáticos:
// sirve el caché si existe y lo actualiza en segundo plano con la red.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  const networkPromise = fetch(request)
    .then(response => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cachedResponse || Response.error());

  return cachedResponse || networkPromise;
}
