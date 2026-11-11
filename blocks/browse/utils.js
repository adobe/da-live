export function getBrowseComponent({ search, pathDetails }) {
  if (pathDetails) return 'da-browse';
  const params = new URLSearchParams(search);
  if (params.get('landing') === 'true') return 'da-landing';
  if (params.get('onboarding') === 'true') return 'da-onboarding';
  return 'da-sites';
}

export async function resolveBrowsePath({ search, org, site, fetchConfigs }) {
  const override = new URLSearchParams(search).get('browse');
  if (override === '1') return './legacy';
  if (override === '2' || !org) return './v2';

  try {
    const configs = await Promise.all(fetchConfigs({ org, site }));
    let legacy = false;
    configs.forEach((config) => {
      const row = config?.flags?.data?.find(({ key }) => key === 'browseV1');
      if (row) legacy = row.value === 'true';
    });
    return legacy ? './legacy' : './v2';
  } catch {
    return './v2';
  }
}
