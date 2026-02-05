import { daFetch, initIms } from './fetch.js';
import { daApi } from './da-api.js';
import { CON_ORIGIN, getLivePreviewUrl } from './constants.js';

export { daFetch, initIms };

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

export async function saveToDa({
  path, formData, blob, props, preview = false, method = 'PUT',
}) {
  const daResp = await daApi.saveSource(path, { formData, blob, props, method });
  if (!daResp || !daResp.ok) return undefined;
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
  const { accessToken } = await initIms();
  return fetch(`${CON_ORIGIN}/${owner}/${repo}/.gimme_cookie`, {
    credentials: 'include',
    headers: { Authorization: `Bearer ${accessToken.token}` },
  });
}

export async function livePreviewLogin(owner, repo) {
  const { accessToken } = await initIms();
  return fetch(`${getLivePreviewUrl(owner, repo)}/gimme_cookie`, {
    credentials: 'include',
    headers: { Authorization: `Bearer ${accessToken.token}` },
  });
}

/**
 * Checks if the lockdownImages flag is enabled for the given owner.
 * When enabled, images are served through the live preview URL with authentication
 * instead of the public preview URL, preventing unauthorized access to images.
 * @param {string} owner - The owner identifier
 * @returns {Promise<boolean>} True if lockdownImages flag is enabled, false otherwise
 */
export async function checkLockdownImages(owner) {
  try {
    const resp = await daApi.getConfig(`/${owner}`);
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
