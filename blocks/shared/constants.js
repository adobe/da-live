export const AEM_ORIGIN = 'https://admin.hlx.page';

export const SUPPORTED_FILES = {
  html: 'text/html',
  jpeg: 'image/jpeg',
  json: 'application/json',
  jpg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  mp4: 'video/mp4',
  pdf: 'application/pdf',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
};

const DA_ADMIN_ENVS = {
  local: 'http://localhost:8787',
  stage: 'https://stage-admin.da.live',
  prod: 'https://admin.da.live',
};

const DA_COLLAB_ENVS = {
  local: 'ws://localhost:4711',
  stage: 'wss://stage-collab.da.live',
  prod: 'wss://collab.da.live',
};

const DA_CONTENT_ENVS = {
  local: 'http://localhost:8788',
  stage: 'https://stage-content.da.live',
  prod: 'https://content.da.live',
};

const DA_LIVE_PREVIEW_ENVS = {
  local: 'localhost:8000',
  stage: 'stage-preview.da.live',
  prod: 'preview.da.live',
};

const DA_ETC_ENVS = {
  prod: 'https://da-etc.adobeaem.workers.dev',
  local: 'http://localhost:8787',
};

function getDaEnv(location, key, envs, localDefault = 'prod') {
  const { href } = location;
  const url = new URL(href);
  const query = url.searchParams.get(key);
  if (query && query === 'reset') {
    localStorage.removeItem(key);
  } else if (query) {
    localStorage.setItem(key, query);
  }
  // On localhost the IMS token is always minted against IMS stage, so the DA
  // admin default must be stage there too — otherwise a stage token hits prod
  // admin, 401s, and da-nx redirects to /not-found.
  const isLocal = url.hostname.includes('local');
  const env = envs[localStorage.getItem(key)] || envs[isLocal ? localDefault : 'prod'] || envs.prod;
  // TODO: INFRA
  return location.origin === 'https://da.page' ? env.replace('.live', '.page') : env;
}

export const getDaAdmin = (() => {
  let daAdmin;
  return (location) => {
    if (!location && daAdmin) return daAdmin;
    daAdmin = getDaEnv(location || window.location, 'da-admin', DA_ADMIN_ENVS, 'stage');
    return daAdmin;
  };
})();

export const DA_ORIGIN = (() => getDaEnv(window.location, 'da-admin', DA_ADMIN_ENVS, 'stage'))();
export const COLLAB_ORIGIN = (() => getDaEnv(window.location, 'da-collab', DA_COLLAB_ENVS))();
export const CON_ORIGIN = (() => getDaEnv(window.location, 'da-content', DA_CONTENT_ENVS))();
export const LIVE_PREVIEW_DOMAIN = (() => getDaEnv(window.location, 'da-live-preview', DA_LIVE_PREVIEW_ENVS))();
export const DA_ETC_ORIGIN = (() => getDaEnv(window.location, 'da-etc', DA_ETC_ENVS))();

export function getLivePreviewUrl(owner, repo) {
  const protocol = LIVE_PREVIEW_DOMAIN.startsWith('localhost') ? 'http' : 'https';
  return `${protocol}://main--${repo}--${owner}.${LIVE_PREVIEW_DOMAIN}`;
}
