import { DA_ORIGIN, CON_ORIGIN, DA_ETC_ORIGIN, getLivePreviewUrl, AEM_ORIGIN } from './constants.js';
import { getNx } from '../../scripts/utils.js';

const DA_ORIGINS = ['https://da.live', 'https://da.page', 'https://admin.da.live', 'https://admin.da.page', 'https://stage-admin.da.live', 'https://content.da.live', 'http://localhost:8787'];
const AEM_ORIGINS = ['https://admin.hlx.page', 'https://admin.aem.live'];
const ETC_ORIGINS = ['https://stage-content.da.live', 'https://helix-snapshot-scheduler-ci.adobeaem.workers.dev', 'https://helix-snapshot-scheduler-prod.adobeaem.workers.dev'];
const ALLOWED_TOKEN = [...DA_ORIGINS, ...AEM_ORIGINS, ...ETC_ORIGINS];

let imsDetails;

export async function initIms() {
  if (imsDetails) return imsDetails;
  const { loadIms } = await import(`${getNx()}/utils/ims.js`);

  try {
    imsDetails = await loadIms();
    return imsDetails;
  } catch {
    return null;
  }
}

export async function getAuthToken() {
  if (!localStorage.getItem('nx-ims')) {
    return null;
  }
  const ims = await initIms();
  return ims?.accessToken?.token || null;
}

export const daFetch = async (url, opts = {}) => {
  opts.headers = opts.headers || {};
  const accessToken = await getAuthToken();
  if (accessToken) {
    const canToken = ALLOWED_TOKEN.some((origin) => new URL(url).origin === origin);
    if (canToken) {
      opts.headers.Authorization = `Bearer ${accessToken}`;
      if (AEM_ORIGINS.some((origin) => new URL(url).origin === origin)) {
        opts.headers['x-content-source-authorization'] = `Bearer ${accessToken}`;
      }
    }
  }
  const resp = await fetch(url, opts);
  if (resp.status === 401 && opts.noRedirect !== true) {
    // Only attempt sign-in if the request is for DA.
    if (DA_ORIGINS.some((origin) => url.startsWith(origin))) {
      // If the user has an access token, but are not permitted, redirect them to not found.
      if (accessToken) {
        // eslint-disable-next-line no-console
        console.warn('You see the 404 page because you have no access to this page', url);
        window.location = `${window.location.origin}/not-found`;
        return { ok: false };
      }
      // eslint-disable-next-line no-console
      console.warn('You need to sign in because you are not authorized to access this page', url);
      const { loadIms, handleSignIn } = await import(`${getNx()}/utils/ims.js`);
      await loadIms();
      handleSignIn();
    }
  }

  // TODO: Properly support 403 - DA Admin sometimes gives 401s and sometimes 403s.
  if (resp.status === 403) {
    return resp;
  }

  // If child actions header is present, use it.
  // This is a hint as to what can be done with the children.
  if (resp.headers?.get('x-da-child-actions')) {
    resp.permissions = resp.headers.get('x-da-child-actions').split('=').pop().split(',');
    return resp;
  }

  // Use the self actions hint if child actions are not present.
  if (resp.headers?.get('x-da-actions')) {
    resp.permissions = resp.headers?.get('x-da-actions')?.split('=').pop().split(',');
    return resp;
  }

  // Support legacy admin.role.all
  resp.permissions = ['read', 'write'];
  return resp;
};

export function etcFetch(href, api, options) {
  const url = `${DA_ETC_ORIGIN}/${api}?url=${encodeURIComponent(href)}`;
  const opts = options || {};
  return fetch(url, opts);
}

export async function aemAdmin(path, api, method = 'POST') {
  const [owner, repo, ...parts] = path.slice(1).split('/');
  const name = parts.pop() || repo || owner;
  parts.push(name.replace('.html', ''));
  const aemUrl = `https://admin.hlx.page/${api}/${owner}/${repo}/main/${parts.join('/')}`;
  const resp = await daFetch(aemUrl, { method });
  if (method === 'DELETE' && resp.status === 204) return {};
  if (!resp.ok) return undefined;
  try {
    return resp.json();
  } catch {
    return undefined;
  }
}

export async function saveToDa({ path, formData, blob, props, preview = false }) {
  if (!path || !path.startsWith('/') || path.includes('://')) return undefined;

  const opts = { method: 'PUT' };

  const form = formData || new FormData();
  if (blob || props) {
    if (blob) form.append('data', blob);
    if (props) form.append('props', JSON.stringify(props));
  }
  if ([...form.keys()].length) opts.body = form;

  const daResp = await daFetch(`${DA_ORIGIN}/source${path}`, opts);
  if (!daResp.ok) return undefined;
  if (!preview) return undefined;
  return aemAdmin(path, 'preview');
}

export const getSheetByIndex = (json, index = 0) => {
  if (json[':type'] !== 'multi-sheet') {
    return json.data;
  }
  return json[Object.keys(json)[index]]?.data;
};

export const getFirstSheet = (json) => getSheetByIndex(json, 0);

export async function contentLogin(owner, repo) {
  try {
    const { accessToken } = await initIms();
    await fetch(`${CON_ORIGIN}/${owner}/${repo}/.gimme_cookie`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken.token}` },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Content Login failed', e);
  }
}

export async function livePreviewLogin(owner, repo) {
  try {
    const { accessToken } = await initIms();
    await fetch(`${getLivePreviewUrl(owner, repo)}/gimme_cookie`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken.token}` },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Live Preview Login failed', e);
  }
}

/**
 * Checks if the lockdownImages flag is enabled for the given owner.
 * When enabled, images are served through the live preview URL with authentication
 * instead of the public preview URL, preventing unauthorized access to images.
 * @param {string} owner - The owner identifier
 * @returns {Promise<boolean>} True if lockdownImages flag is enabled, false otherwise
 * @deprecated
 */
export async function checkLockdownImages(owner) {
  try {
    const resp = await daFetch(`${DA_ORIGIN}/config/${owner}`);
    if (!resp.ok) return false;

    const config = await resp.json();

    // Check if flags sheet exists and has lockdownImages=true
    if (config.flags?.data) {
      const lockdownFlag = config.flags.data.find(
        (item) => item.key === 'lockdownImages' && item.value === 'true',
      );
      return !!lockdownFlag;
    }
    return false;
  } catch {
    return false;
  }
}

export const fetchDaConfigs = (() => {
  const configCache = {};

  const fetchConfig = async (pathname) => {
    const resp = await daFetch(`${DA_ORIGIN}/config${pathname}/`);
    if (!resp.ok) return { error: `Error loading ${pathname}`, status: resp.status };
    return resp.json();
  };

  return ({ org, site }) => {
    if (!org) return [Promise.resolve(null)];

    // Set the org config promise if it does not exist
    configCache[`/${org}`] ??= fetchConfig(`/${org}`);

    if (site) {
      // Set the site config promise if it does not exist
      configCache[`/${org}/${site}`] ??= fetchConfig(`/${org}/${site}`);
    }

    // return array of cached configs (org = 0, site = 1)
    const configs = [configCache[`/${org}`]];
    if (site) configs.push(configCache[`/${org}/${site}`]);

    return configs;
  };
})();

export const getSidekickConfig = (() => {
  const configCache = {};

  const fetchConfig = async (org, site) => {
    const aemPath = `/${org}/${site}/config.json`;

    return aemAdmin(aemPath, 'sidekick', 'GET');
  };

  return ({ org, site }) => {
    if (!site) return {};

    const path = `/${org}/${site}`;
    // Fetch new SK config if it doesn't exit
    configCache[path] ??= fetchConfig(org, site);

    return configCache[path];
  };
})();

export const getAemSiteToken = (() => {
  const tokenCache = {};

  const fetchToken = async (org, site) => {
    const { accessToken } = await initIms();
    const { token } = accessToken;

    const body = JSON.stringify({ org, site, accessToken: token });
    const opts = { method: 'POST', body, headers: { 'Content-Type': 'application/json' } };
    const resp = await fetch(`${AEM_ORIGIN}/auth/adobe/exchange`, opts);
    if (!resp.ok) return { error: `Error fetch AEM Site Token ${resp.status}` };
    return resp.json();
  };

  return ({ org, site }) => {
    const path = `/${org}/${site}`;
    // Fetch new token if it doesn't exit
    tokenCache[path] ??= fetchToken(org, site);

    return tokenCache[path];
  };
})();

export function delay(ms) {
  return new Promise((res) => { setTimeout(res, ms); });
}

// Replaces every character not in `allowed` with '-', then collapses any run
// of hyphens into a single '-'. Ensures a typed (or substituted) invalid
// character next to an existing hyphen does not produce a double hyphen.
// When `trimTrailing` is true, also strips any trailing non-alphanumeric
// characters so the name ends with an alphanumeric char. Use at finalization
// time (save/upload/rename submit), not on every keystroke, or the user will
// be unable to type a hyphen mid-name.
export function sanitizeName(value, { allowDot = false, trimTrailing = false } = {}) {
  const pattern = allowDot ? /[^a-zA-Z0-9.]/g : /[^a-zA-Z0-9]/g;
  let result = value
    .replaceAll(pattern, '-')
    .replaceAll(/-+/g, '-')
    .toLowerCase();
  if (trimTrailing) result = result.replace(/[^a-zA-Z0-9]+$/, '');
  return result;
}
