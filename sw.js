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
  if (event.data && event.data.type === 'SET_ACCESS_TOKEN') {
    console.log('Data received', event.data);
    accessToken = event.data.accessToken?.token;
    console.log('Access token set via message:', accessToken);
  }
});

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
    const headers = new Headers(event.request.headers);
    if (!headers.has('authorization')) {
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
    }
    return;
  }

  event.respondWith(fetch(event.request));
});