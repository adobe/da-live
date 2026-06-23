import { fetchDaConfigs } from './utils.js';

export default async function isEWEnabled({ org, site }) {
  try {
    const [, siteConfig] = await Promise.all(fetchDaConfigs({ org, site }));
    const flag = siteConfig?.flags?.data?.find((f) => f.key === 'ew.enabled');
    return flag?.value === 'true';
  } catch (e) {
    if (!(e instanceof TypeError) && !(e instanceof SyntaxError)) throw e;
  }
  return false;
}
