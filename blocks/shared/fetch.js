import { DA_ORIGINS, AEM_ORIGINS } from './constants.js';

const { getNx } = await import('../../scripts/utils.js');
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
    const canToken = ALLOWED_TOKEN.some((origin) => new URL(url).origin === origin);
    if (accessToken && canToken) {
      opts.headers.Authorization = `Bearer ${accessToken.token}`;
      if (AEM_ORIGINS.some((origin) => new URL(url).origin === origin)) {
        opts.headers['x-content-source-authorization'] = `Bearer ${accessToken.token}`;
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
