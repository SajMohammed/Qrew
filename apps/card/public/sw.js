// Minimal offline shell for the app's own assets. Network-first, falling back to cache.
//
// The API is deliberately NEVER cached. A card's QR token lives about two minutes, so serving a
// cached /api/card/:serial offline would show the customer a code that looks fine and then fails at
// the till — worse than plainly not loading. Card data is always network or nothing.
const CACHE = "qrew-card-v2";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) =>
  e.waitUntil(
    (async () => {
      // Drop caches from previous versions, or stale assets outlive every deploy.
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  ),
);

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Same-origin app shell only: never the API, never third-party (fonts, Google Identity).
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches
          .open(CACHE)
          .then((c) => c.put(req, copy))
          .catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("/"))),
  );
});
