import { daRsDemoEnvDefault, getDaRsDemoState, isDaRsSelected, isDaRsDemoEligible, isHostedDaRsDemo } from './da-rs-bootstrap.js';

export const AEM_ORIGIN = 'https://admin.hlx.page';

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

const DA_ADMIN_ENVS = {
  local: 'http://localhost:8787',
  stage: 'https://stage-admin.da.live',
  prod: 'https://admin.da.live',
  rspoc: 'https://da-rs-ns-team-aem-cm-prd-n147252.corp.ethos14-prod-gbr9.ethos.adobe.net',
};

export function isAllowedDaAdminOrigin(origin) {
  if (origin === DA_ADMIN_ENVS.rspoc) {
    return isDaRsSelected() && (isDaRsDemoEligible() || isHostedDaRsDemo());
  }
  return Object.values(DA_ADMIN_ENVS).some((value) => (
    value !== DA_ADMIN_ENVS.rspoc && (origin === value || origin === value.replace('.live', '.page'))
  ));
}

export function getDaAdminEnvironment(origin) {
  return Object.entries(DA_ADMIN_ENVS).find(([, value]) => (
    origin === value || origin === value.replace('.live', '.page')
  ))?.[0];
}

const DA_COLLAB_ENVS = {
  local: 'ws://localhost:4711',
  stage: 'wss://stage-collab.da.live',
  prod: 'wss://collab.da.live',
};

export function getDaCollabEnvironment(origin) {
  return Object.entries(DA_COLLAB_ENVS).find(([, value]) => (
    origin === value || origin === value.replace('.live', '.page')
  ))?.[0];
}

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

function getDaEnv(location, key, envs) {
  const { href } = location;
  const query = new URL(href).searchParams.get(key);
  // The hosted demo stays on its approved service, regardless of env settings.
  if (key === 'da-admin' && isHostedDaRsDemo(location) && isDaRsSelected(href)) {
    return DA_ADMIN_ENVS.rspoc;
  }
  const allowedRspoc = isDaRsSelected(href)
    && (isDaRsDemoEligible(location) || isHostedDaRsDemo(location));
  if (key === 'da-admin' && query === 'rspoc' && !allowedRspoc) return undefined;
  if (query && query === 'reset') {
    localStorage.removeItem(key);
  } else if (query) {
    localStorage.setItem(key, query);
  }
  // Precedence: explicit URL > deployment demo default > existing hosted selection.
  const explicit = query && query !== 'reset' ? query : null;
  let selected = explicit;
  if (!selected) {
    const demo = isDaRsSelected(href) && (key === 'da-admin' || key === 'da-collab');
    if (demo && getDaRsDemoState().status === 'failed') return undefined;
    selected = (demo && daRsDemoEnvDefault(key)) || localStorage.getItem(key) || 'prod';
  }
  if (key === 'da-admin' && selected === 'rspoc' && !allowedRspoc) return undefined;
  const env = envs[selected];
  if (!env) return undefined;
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
export const COLLAB_ORIGIN = (() => getDaEnv(window.location, 'da-collab', DA_COLLAB_ENVS))();
export const CON_ORIGIN = (() => getDaEnv(window.location, 'da-content', DA_CONTENT_ENVS))();
export const LIVE_PREVIEW_DOMAIN = (() => getDaEnv(window.location, 'da-live-preview', DA_LIVE_PREVIEW_ENVS))();
export const DA_ETC_ORIGIN = (() => getDaEnv(window.location, 'da-etc', DA_ETC_ENVS))();

export function getLivePreviewUrl(owner, repo, branch = 'main') {
  const protocol = LIVE_PREVIEW_DOMAIN.startsWith('localhost') ? 'http' : 'https';
  return `${protocol}://${branch}--${repo}--${owner}.${LIVE_PREVIEW_DOMAIN}`;
}
