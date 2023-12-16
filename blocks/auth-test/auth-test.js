import { origin } from '../shared/constants.js';

// Milo Imports
const { getLibs } = await import('../../scripts/utils.js');
const { loadIms } = await import(`${getLibs()}/utils/utils.js`);

async function imsReady() {
  const accessToken = window.adobeIMS.getAccessToken();

  const headers = {};

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken.token}`;
  }

  const resp = await fetch(`${origin}/list/hlxsites`, { headers });
  if (!resp.ok) return;
  const json = await resp.json();
  console.log(json);
}

export default function init(el) {
  loadIms().then(() => { imsReady(); });
}
