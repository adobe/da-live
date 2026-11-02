const FLAG = 'browseV2';

/** Explicit `?browse=2` / `?browse=1` override; undefined when not set. */
function getBrowseOverride(search) {
  const value = new URLSearchParams(search).get('browse');
  if (value === '2') return './v2';
  if (value === '1') return './legacy';
  return undefined;
}

/**
 * Query param wins; otherwise the `browseV2` flag in the `flags` sheet of the
 * org or site config (site overrides org) opts in.
 */
export async function resolveBrowsePath({ search, org, site, fetchConfigs }) {
  const override = getBrowseOverride(search);
  if (override) return override;
  if (!org) return './legacy';
  try {
    const configs = await Promise.all(fetchConfigs({ org, site }));
    let enabled = false;
    configs.forEach((config) => {
      const row = config?.flags?.data?.find(({ key }) => key === FLAG);
      if (row) enabled = row.value === 'true';
    });
    return enabled ? './v2' : './legacy';
  } catch {
    return './legacy';
  }
}
