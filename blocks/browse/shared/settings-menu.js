export const SITE_HISTORY = 'site-history';

// Existing item ids are target URLs; Site history is an explicitly handled action.
export function getSettingsMenuItems(options) {
  const { org, site, canEditOrgConfig: canEdit = false, siteHistory = false } = options;
  const path = site ? `/${org}/${site}` : `/${org}`;
  const items = [{ id: `/config#${path}/`, label: 'Configuration' }];
  if (canEdit && !site?.includes('~')) items.push({ id: `/config/permissions#${path}`, label: 'Permissions' });
  if (siteHistory && site && !site.includes('~')) items.push({ id: SITE_HISTORY, label: 'Site history' });
  return items;
}
