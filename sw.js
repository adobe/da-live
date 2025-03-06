self.addEventListener('install', (event) => {
  self.skipWaiting();
});

async function handleIms(event) {
  const requestClone = event.request.clone();
  const bodyClone = await requestClone.text();
  console.log(`IMS request`, bodyClone);

  const resp = await fetch(event.request);
  const text = await resp.text();
  console.log(`IMS response`, text);
}

self.addEventListener("fetch", (event) => {
  console.log(`Handling fetch event for`, event.request.url, event);

  if (event.request.url.includes('https://ims-na1.adobelogin.com/ims/validate_token/')) {
    event.respondWith(handleIms(event));
    return;
  }
  event.respondWith(fetch(event.request));
});