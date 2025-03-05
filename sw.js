self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  console.log(`Handling fetch event for`, event.request.url, event);
  event.respondWith(fetch(event.request));
});