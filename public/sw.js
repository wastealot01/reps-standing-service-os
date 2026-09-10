// Minimal service worker — enables "Add to Home Screen" installability.
// Deliberately does not cache API responses, since hour logs must always be fresh.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Network-only passthrough for now. Add offline caching for static assets
  // here later if needed — do not cache /api/ responses.
});
