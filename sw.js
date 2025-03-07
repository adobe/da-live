const DA_CONTENT_ORIGINS = [
  'https://content.da.live',
  'https://stage-content.da.live',
  'https://admin.da.live', // TODO: remove this
];

const ASSETS_EXTENSIONS = [ '.jpg', '.jpeg', '.png', '.svg', '.pdf', '.gif', '.mp4', '.svg' ];
let accessToken = null;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('message', (event) => {
  if (!event.data) {
    return
  };

  if (event.data.type === 'SET_ACCESS_TOKEN') {
    accessToken = event.data.accessToken?.token;
  }
});

self.addEventListener('activate', (event) => {
  console.log('Service worker activated');
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (
    DA_CONTENT_ORIGINS.includes(url.origin)
    && ASSETS_EXTENSIONS.some((ext) => url.pathname.endsWith(ext))
    && ['image', 'video'].includes(event.request.destination)
  ) {
    if (!accessToken) {
      console.log('No access token found for asset', event.request.url);
    } else {
      const headers = new Headers(event.request.headers);
      headers.set('Authorization', `Bearer ${accessToken}`);
      const request = new Request(
        event.request,
        { 
          mode: 'cors',
          credentials: 'omit',
          headers,
        },
      );
      event.respondWith(fetch(request));
      return;
    }
  }

  event.respondWith(fetch(event.request));
});