import { daFetch } from '../../../../shared/utils.js';
import { AEM_ORIGIN } from '../../../../shared/constants.js';

const SNAPSHOT_SCHEDULER_URL = 'https://helix-snapshot-scheduler-prod.adobeaem.workers.dev';

export async function isRegistered(org, site) {
  try {
    const resp = await daFetch(`${SNAPSHOT_SCHEDULER_URL}/register/${org}/${site}`);
    return resp.status === 200;
  } catch {
    return false;
  }
}

export async function getUserPublishPermission(org, site, path) {
  try {
    const resp = await daFetch(`${AEM_ORIGIN}/status/${org}/${site}/main${path}`);
    if (!resp.ok) return false;
    const json = await resp.json();
    return json.live?.permissions?.includes('write') || false;
  } catch {
    return false;
  }
}

export async function getExistingSchedule(org, site, path) {
  try {
    const resp = await daFetch(`${SNAPSHOT_SCHEDULER_URL}/schedule/${org}/${site}?path=${encodeURIComponent(path)}`);
    if (!resp.ok) return null;
    return resp.json();
  } catch {
    return null;
  }
}

export async function schedulePagePublish(org, site, path, userId, scheduledPublish) {
  const resp = await daFetch(`${SNAPSHOT_SCHEDULER_URL}/schedule/page`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ org, site, path, userId, scheduledPublish }),
  });
  return resp;
}
