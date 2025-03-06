const DA_CONTENT_ORIGINS = [
  'https://content.da.live',
  'https://stage-content.da.live',
  'https://admin.da.live', // TODO: remove this
];

const ASSETS_EXTENSIONS = [ '.jpg', '.jpeg', '.png', '.svg', '.pdf', '.gif', '.mp4', '.svg' ];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

let accessToken = null;

function extractAccessToken(text) {
  const params = new URLSearchParams(text);
  return params.get('token');
}

async function handleIms(event) {
  const requestClone = event.request.clone();
  const bodyClone = await requestClone.text();

  const resp = await fetch(event.request);
  const respClone = resp.clone();

  if (respClone.status === 200) {
    const json = await respClone.json();
    if (json.valid === true && json.token?.type === 'access_token') {
      accessToken = extractAccessToken(bodyClone);
    }
  }

  return resp;
}

self.addEventListener("fetch", (event) => {
  console.log(`Handling fetch event for`, event.request.url, event);

  if (event.request.url.includes('https://ims-na1.adobelogin.com/ims/validate_token/')) {
    event.respondWith(handleIms(event));
    return;
  }

  if (DA_CONTENT_ORIGINS.includes(new URL(event.request.url).origin) 
    && ASSETS_EXTENSIONS.some((ext) => pathname.endsWith(ext))
    && accessToken
  ) {
    event.request.headers.set('Authorization', `Bearer ${accessToken}`);
  }

  event.respondWith(fetch(event.request));
});