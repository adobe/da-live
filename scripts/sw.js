self.addEventListener("fetch", (event) => {
  console.log(`Handling fetch event for ${event}`);
  event.respondWith(fetch(event.request));
});