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
