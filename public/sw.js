// Foodini service worker: lets /list open with no signal.
// - /_next/static/* (hashed, immutable): cache first.
// - Navigations to /list: network first, falling back to the last cached copy.
// Bump VERSION to drop old caches. Cache names start with "foodini-" so sign-out can clear them.
const VERSION = "foodini-v1";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("foodini-") && !key.startsWith(VERSION)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === "navigate" && url.pathname === "/list") {
    event.respondWith(networkFirstPage(request));
  }
});

// The list page asks for this when it opens: a visit through the List tab is a soft navigation, so /list
// was never loaded as a document (and its scripts may predate this worker). Fetch and cache both.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "cache-list") event.waitUntil(cacheListPage());
});

async function cacheListPage() {
  try {
    const response = await fetch("/list", { credentials: "same-origin" });
    if (!response.ok || response.redirected) return;
    await (await caches.open(PAGE_CACHE)).put("/list", response.clone());
    const html = await response.text();
    const assets = new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || []);
    const statics = await caches.open(STATIC_CACHE);
    await Promise.all(
      [...assets].map(async (path) => {
        if (await statics.match(path, { ignoreVary: true })) return;
        try {
          const asset = await fetch(path);
          if (asset.ok) await statics.put(path, asset);
        } catch {
          // Skip an asset that fails; the rest still help.
        }
      }),
    );
  } catch {
    // Offline or signed out: keep whatever is cached.
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    // Don't cache the login page a signed-out visit redirects to.
    if (response.ok && !response.redirected) {
      await cache.put(request, response.clone());
      await cache.put("/list", response.clone());
    }
    return response;
  } catch {
    const cached = (await cache.match(request)) ?? (await cache.match("/list"));
    return (
      cached ??
      new Response("You’re offline, and the grocery list hasn’t been saved on this device yet.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" },
      })
    );
  }
}
