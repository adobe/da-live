import { getDaAdmin } from '../shared/constants.js';
import { daFetch } from '../shared/utils.js';

export async function addSite({ org, site }) {
  if (!window.adobeIMS?.isSignedInUser()) return { error: 'You need to sign in first.' };

  const { loadConfig, saveConfig } = await import('../start/start.js');
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
