export const CON_ORIGIN = 'https://content.da.live';
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
};

const DA_ADMIN_ENVS = {
  local: 'http://localhost:8787',
  hlx6: 'http://localhost:3000',
  stage: 'https://stage-admin.da.live',
  prod: 'https://admin.da.live',
};

const DA_COLLAB_ENVS = {
  local: 'ws://localhost:4711',
  stage: 'wss://stage-collab.da.live',
  prod: 'wss://collab.da.live',
};

function getDaEnv(location, key, envs) {
  const { href } = location;
  const query = new URL(href).searchParams.get(key);
  if (query && query === 'reset') {
    localStorage.removeItem(key);
  } else if (query) {
    localStorage.setItem(key, query);
  }
  const env = envs[localStorage.getItem(key) || 'prod'];
  // TODO: INFRA
  return location.origin === 'https://da.page' ? env.replace('.live', '.page') : env;
}

export const getDaAdmin = (() => {
  let daAdmin;
  return (location) => {
    if (!location && daAdmin) return daAdmin;
    daAdmin = getDaEnv(location || window.location, 'da-admin', DA_ADMIN_ENVS);
    return daAdmin;
  };
})();

export const DA_ORIGIN = (() => getDaEnv(window.location, 'da-admin', DA_ADMIN_ENVS))();
export const DA_HLX = DA_ADMIN_ENVS.hlx6 === DA_ORIGIN;
export const COLLAB_ORIGIN = (() => getDaEnv(window.location, 'da-collab', DA_COLLAB_ENVS))();
