import { DA_ORIGIN } from '../../../../shared/constants.js';
import { daFetch, aemAdmin, getFirstSheet } from '../../../../shared/utils.js';

const TARGET_CONFIG_PATH = '/.da/adobe-target.json';

function corsFetch(href, options) {
  const url = `https://da-etc.adobeaem.workers.dev/cors?url=${encodeURIComponent(`${href}`)}`;
  const opts = options || {};
  return daFetch(url, opts);
}

async function getAccessToken(clientId, clientSecret) {
  const href = 'https://ims-na1.adobelogin.com/ims/token/v3';
  const opts = {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'openid,AdobeID,target_sdk,additional_info.projectedProductContext,read_organizations,additional_info.roles',
    }),
  };
  const resp = await corsFetch(href, opts);
  if (!resp.ok) {
    const error = await resp.text();
    return { error: `Failed to get access token: ${resp.status} - ${error}` };
  }

  const data = await resp.json();
  return { token: data.access_token };
}

export const fetchTargetConfig = (() => {
  const configCache = {};

  const fetchConfig = async (location) => {
    const path = `${DA_ORIGIN}/source${location}${TARGET_CONFIG_PATH}`;
    const resp = await daFetch(path);
    if (!resp.ok) return { error: 'Couldn\'t fetch Adobe Target config.' };
    const json = await resp.json();
    const data = getFirstSheet(json);

    return data.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
  };

  return (org, site) => {
    const location = site ? `/${org}/${site}` : `/${org}`;
    configCache[location] = fetchConfig(`/${org}/${site}`);
    return configCache[location];
  };
})();

export async function authenticate(org, site) {
  const { tenant, clientId, clientSecret } = await fetchTargetConfig(org, site);
  if (!(tenant && clientId && clientSecret)) {
    return { error: 'Missing Target credentials' };
  }
  const token = await getAccessToken(clientId, clientSecret);
  return token;
}

export async function savePreview(org, site, path) {
  const fullpath = `/${org}/${site}${path}`;
  const json = await aemAdmin(fullpath, 'preview', 'POST');
  if (!json) return { error: 'Couldn\'t preview.' };
  return json;
}

export async function sendToTarget(org, site, aemPath, token) {
  console.log(org, site, aemPath, token);
}
