// Service worker: funciona sin internet. TODO: sube el número de CACHE cada vez que publiques cambios.
const CACHE = "bingo-rifa-v4";
const ASSETS = ["./", "index.html", "styles.css", "app.js", "manifest.webmanifest",
  "lib/qrcode.js", "lib/JsBarcode.all.min.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Cache primero + actualización en segundo plano
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const same = new URL(e.request.url).origin === location.origin;
  e.respondWith(caches.match(e.request).then(hit => {
    const net = fetch(e.request).then(res => {
      if (res.ok && same) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); }
      return res;
    }).catch(() => hit || caches.match("index.html"));
    return hit || net;
  }));
});
