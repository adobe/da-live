import { DA_ORIGIN } from '../../public/utils/constants.js';
import { daFetch } from '../shared/utils.js';

const DEF_CONFIG = `{
    "data": {
        "total": 1,
        "limit": 1,
        "offset": 0,
        "data": [{}]
    },
    "permissions": {
        "total": 2,
        "limit": 2,
        "offset": 0,
        "data": [
          {
              "path": "CONFIG",
              "groups": "{{EMAIL}}",
              "actions": "write",
              "comments": "The ability to set configurations for an org."
          },
          {
              "path": "/ + **",
              "groups": "{{EMAIL}}",
              "actions": "write",
              "comments": "The ability to create content."
          }
        ]
    },
    ":names": [
        "data",
        "permissions"
    ],
    ":version": 3,
    ":type": "multi-sheet"
}`;

async function fetchConfig(org, body) {
  let opts;
  if (body) opts = { method: 'POST', body };

  return daFetch(`${DA_ORIGIN}/config/${org}/`, opts);
}

export async function loadConfig(org) {
  const resp = await fetchConfig(org);

  const result = { status: resp.status };

  if (!resp.ok) {
    if (resp.status === 403 && resp.status === 401) {
      result.message = 'You are not authorized to change this organization.';
    }
  } else {
    const json = await resp.json();
    if (json) result.json = json;
  }

  return result;
}

export async function saveConfig(org, email, existingConfig) {
  const defConfigStr = DEF_CONFIG.replaceAll('{{EMAIL}}', email);
  const defConfig = JSON.parse(defConfigStr);

  // Preserve the existing config
  if (existingConfig?.data) defConfig.data = existingConfig;

  const body = new FormData();
  body.append('config', JSON.stringify(defConfig));

  await fetchConfig(org, body);

  window.location.reload(true);
}
