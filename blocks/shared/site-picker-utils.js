export function getSiteOptions({ recentSites = [], current }) {
  const sites = [...new Set([current, ...recentSites].filter(
    (site) => typeof site === 'string' && /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/.test(site),
  ))];
  return sites.map((value) => {
    const [org, site] = value.split('/');
    return { value, label: `${site} (${org})` };
  });
}
