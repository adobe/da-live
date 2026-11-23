// Item ids are the target URLs. The config editor comes first; the raw config sheet stays
// available after a divider for anything the editor doesn't cover.
export function getSettingsMenuItems({ org, site, canEditOrgConfig: canEdit = false }) {
  const path = site ? `/${org}/${site}` : `/${org}`;
  const items = [{ id: `/config/edit#${path}`, label: 'Configuration' }];
  if (canEdit) items.push({ id: `/config/permissions#${path}`, label: 'Permissions' });
  items.push({ divider: true }, { id: `/config#${path}/`, label: 'Config Sheet' });
  return items;
}
