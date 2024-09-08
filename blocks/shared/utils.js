import { DA_ORIGIN } from './constants.js';

const { getNx } = await import('../../scripts/utils.js');

const DA_ORIGINS = ['https://admin.da.live', 'https://stage-admin.da.live'];
const AEM_ORIGINS = ['https://admin.hlx.page', 'https://admin.aem.live'];
const ALLOWED_TOKEN = [...DA_ORIGINS, ...AEM_ORIGINS];

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

export const daFetch = async (url, opts = {}) => {
  opts.headers = opts.headers || {};
  let accessToken;
  if (localStorage.getItem('nx-ims')) {
    ({ accessToken } = await initIms());
    const canToken = ALLOWED_TOKEN.some((origin) => url.startsWith(origin));
    if (accessToken && canToken) opts.headers.Authorization = `Bearer ${accessToken.token}`;
  }
  const resp = await fetch(url, opts);
  if (resp.status === 401) {
    // Only attempt sign-in if the request is for DA.
    if (DA_ORIGINS.some((origin) => url.startsWith(origin))) {
      if (accessToken) {
        window.location = `${window.location.origin}/not-found`;
        return { ok: false };
      }
      const { loadIms, handleSignIn } = await import(`${getNx()}/utils/ims.js`);
      await loadIms();
      handleSignIn();
    }
  }
  return resp;
};

export async function aemPreview(path, api, method = 'POST') {
  const [owner, repo, ...parts] = path.slice(1).split('/');
  const name = parts.pop() || repo || owner;
  parts.push(name.replace('.html', ''));
  const aemUrl = `https://admin.hlx.page/${api}/${owner}/${repo}/main/${parts.join('/')}`;
  const resp = await daFetch(aemUrl, { method });
  if (!resp.ok) return undefined;
  return resp.json();
}

export async function saveToDa({ path, formData, blob, props, preview = false }) {
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
  return aemPreview(path, 'preview');
}
