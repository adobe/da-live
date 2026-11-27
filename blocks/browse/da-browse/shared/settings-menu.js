// Item ids are the target URLs. Users who can edit the org config get the config editor and
// permissions first; the raw config sheet stays available to everyone after them.
export function getSettingsMenuItems({ org, site, canEditOrgConfig: canEdit = false }) {
  const path = site ? `/${org}/${site}` : `/${org}`;
  const sheet = { id: `/config#${path}/`, label: 'Config Sheet' };
  if (!canEdit) return [sheet];
  return [
    { id: `/config/edit#${path}`, label: 'Configuration', trailing: { type: 'badge', label: 'New' } },
    { id: `/config/permissions#${path}`, label: 'Permissions' },
    { divider: true },
    sheet,
  ];
}
