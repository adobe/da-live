import { fetchDaConfigs, getConfigPermissions } from '../../shared/utils.js';

/**
 * Items for the browse settings (gear) menu at an org or site root.
 * Site permissions are only offered to users who can write the org config,
 * since the permissions page edits the org-level config.
 */
export function getSettingsMenuItems({ org, site, canEditOrgConfig: canEdit = false }) {
  const path = site ? `/${org}/${site}` : `/${org}`;
  const items = [{ id: 'config', label: 'Configuration', href: `/config#${path}/` }];
  if (!site || canEdit) {
    items.push({ id: 'permissions', label: 'Permissions', href: `/config/permissions#${path}` });
  }
  return items;
}

export function getSettingsHref(items, id) {
  return items.find((item) => item.id === id)?.href;
}

/** Whether the user has write on the org CONFIG (X-da-actions of the cached org config). */
export async function canEditOrgConfig(org) {
  if (!org) return false;
  try {
    const [orgConfig] = fetchDaConfigs({ org });
    const result = await orgConfig;
    // 404 = org has no config yet; da-admin still reports the CONFIG actions for it.
    if (result?.error && result.status !== 404) return false;
    return !!getConfigPermissions(result)?.includes('write');
  } catch {
    return false;
  }
}
