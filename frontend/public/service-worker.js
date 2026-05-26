// FinFlow — minimal service worker for PWA installability + basic offline shell.
// Strategy:
//   - Cache the app shell (HTML, CSS, JS, icons) on first load.
//   - Network-first for everything (so users always get fresh data when online).
//   - Fall back to cache when offline so the shell still loads.

const CACHE = "finflow-shell-v1";
const SHELL = [
  "/",
  "/manifest.json",
  "/finflow-icon.png",
  "/apple-touch-icon.png",
  "/pwa-icon-192.png",
  "/pwa-icon-512.png",
  "/pwa-icon-maskable-512.png",
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => null)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Never cache API calls — always go to the network.
  if (req.method !== "GET" || req.url.includes("/api/")) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        // Cache successful same-origin GETs for future offline fallback.
        if (res.ok && new URL(req.url).origin === self.location.origin) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("/"))),
  );
});
