import { fetchDaConfigs, getConfigPermissions } from '../../shared/utils.js';

/**
 * Items for the browse settings menu; the id is the target URL.
 * Site permissions need write on the org CONFIG, since that page edits the org config.
 */
export function getSettingsMenuItems({ org, site, canEditOrgConfig: canEdit = false }) {
  const path = site ? `/${org}/${site}` : `/${org}`;
  const items = [{ id: `/config#${path}/`, label: 'Configuration' }];
  if (!site || canEdit) items.push({ id: `/config/permissions#${path}`, label: 'Permissions' });
  return items;
}

export async function canEditOrgConfig(org) {
  const config = await fetchDaConfigs({ org })[0].catch(() => null);
  // 404 = org has no config yet; da-admin still reports the CONFIG actions for it.
  if (config?.error && config.status !== 404) return false;
  return !!getConfigPermissions(config)?.includes('write');
}
