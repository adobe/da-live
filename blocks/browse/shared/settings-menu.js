// Item ids are the target URLs.
export function getSettingsMenuItems({ org, site, canEditOrgConfig: canEdit = false }) {
  const path = site ? `/${org}/${site}` : `/${org}`;
  const items = [{ id: `/config#${path}/`, label: 'Configuration' }];
  if (!site || canEdit) items.push({ id: `/config/permissions#${path}`, label: 'Permissions' });
  return items;
}
