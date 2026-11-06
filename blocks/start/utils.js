import { getDaAdmin } from '../shared/constants.js';
import { daFetch } from '../shared/utils.js';
import { getNx2Api, sanitizePathParts } from '../../scripts/utils.js';

const ORG_CONFIG = `{
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

export async function loadConfig(org) {
  const { config } = await getNx2Api();
  const resp = await config.get({ org });

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
  const defConfigStr = ORG_CONFIG.replaceAll('{{EMAIL}}', email);
  const defConfig = JSON.parse(defConfigStr);

  // Preserve the existing config
  if (existingConfig?.data) defConfig.data = existingConfig;

  const { config } = await getNx2Api();
  const resp = await config.save({ org, body: JSON.stringify(defConfig) });

  return { status: resp.status };
}

export function getGitHubSite(value) {
  try {
    const { origin, pathname } = new URL(value);
    if (origin !== 'https://github.com') return undefined;
    const [org, site] = sanitizePathParts(pathname);
    return org && site ? { org, site } : undefined;
  } catch {
    return undefined;
  }
}

export async function addSite({ org, site }) {
  if (!window.adobeIMS?.isSignedInUser()) return { error: 'You need to sign in first.' };

  const { status: orgLoadStatus } = await loadConfig(org);
  if (orgLoadStatus === 404) {
    const { email } = await window.adobeIMS.getProfile();
    if (!email) return { error: 'Make sure your profile contains an email address.' };

    const { status } = await saveConfig(org, email);
    if (status !== 201) {
      const error = status === 401 || status === 403
        ? 'You are not authorized to create this DA organization. Check your permissions.'
        : 'The org could not be created. Check the console logs or contact an administrator.';
      return { error, status };
    }
  }

  const resp = await daFetch(`${getDaAdmin()}/source/${org}/${site}`, { method: 'PUT' });
  if (!resp.ok) {
    const error = resp.status === 401 || resp.status === 403
      ? 'You are not authorized to create this site in the corresponding DA organization. Check with the organization administrator.'
      : 'The site could not be created. Check the console logs or contact an administrator.';
    return { error, status: resp.status };
  }

  return { status: resp.status };
}
