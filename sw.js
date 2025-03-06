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
  console.log('Handling fetch event for IMS');
  const requestClone = event.request.clone();
  const bodyClone = await requestClone.text();

  const resp = await fetch(event.request);
  const respClone = resp.clone();

  if (respClone.status === 200) {
    const json = await respClone.json();
    if (json.valid === true && json.token?.type === 'access_token') {
      console.log('Extracting access token from IMS response');
      accessToken = extractAccessToken(bodyClone);
      console.log('Access token extracted', accessToken);
    }
  }

  return resp;
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.url.includes('https://ims-na1.adobelogin.com/ims/validate_token/')) {
    event.respondWith(handleIms(event));
    return;
  }

  if (DA_CONTENT_ORIGINS.includes(url.origin) && ASSETS_EXTENSIONS.some((ext) => url.pathname.endsWith(ext)) && accessToken) {
    event.request.headers.set('Authorization', `Bearer ${accessToken}`);
  }

  event.respondWith(fetch(event.request));
});