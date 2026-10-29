import config, { getServiceEnvs } from '../../scripts/config.js';

export const AEM_ORIGIN = config.aem.adminOrigin;

export const SUPPORTED_IMAGE_TYPES = [
  'image/svg+xml', 'image/png', 'image/jpeg', 'image/gif', 'image/avif', 'image/webp',
];

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

function getDaEnv(location, key, service) {
  const { href } = location;
  const envs = getServiceEnvs(service, location.origin || new URL(href).origin);
  const query = new URL(href).searchParams.get(key);
  if (query && query === 'reset') {
    localStorage.removeItem(key);
  } else if (query) {
    localStorage.setItem(key, query);
  }
  const selected = localStorage.getItem(key) || 'prod';
  return Object.hasOwn(envs, selected) ? envs[selected] : envs.prod;
}

export const getDaAdmin = (() => {
  let daAdmin;
  return (location) => {
    if (!location && daAdmin) return daAdmin;
    daAdmin = getDaEnv(location || window.location, 'da-admin', 'admin');
    return daAdmin;
  };
})();

export const DA_ORIGIN = getDaEnv(window.location, 'da-admin', 'admin');
export const COLLAB_ORIGIN = getDaEnv(window.location, 'da-collab', 'collab');
export const CON_ORIGIN = getDaEnv(window.location, 'da-content', 'content');
export const LIVE_PREVIEW_DOMAIN = getDaEnv(window.location, 'da-live-preview', 'preview');
export const DA_ETC_ORIGIN = getDaEnv(window.location, 'da-etc', 'etc');

export function getLivePreviewUrl(owner, repo, branch = 'main') {
  const protocol = LIVE_PREVIEW_DOMAIN.startsWith('localhost') ? 'http' : 'https';
  return `${protocol}://${branch}--${repo}--${owner}.${LIVE_PREVIEW_DOMAIN}`;
}
