import { fetchDaConfigs } from './utils.js';

export async function getEWFlag({ org, site, flagName }) {
  try {
    const [, siteConfig] = await Promise.all(fetchDaConfigs({ org, site }));
    const flag = siteConfig?.flags?.data?.find((f) => f.key === flagName);
    return flag?.value;
  } catch (e) {
    if (!(e instanceof TypeError) && !(e instanceof SyntaxError)) throw e;
  }
  return undefined;
}

export async function isEWEnabled({ org, site }) {
  const flag = await getEWFlag({ org, site, flagName: 'ew.enabled' });
  return flag === 'true';
}
