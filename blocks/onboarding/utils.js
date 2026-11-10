import { getNx2 } from '../../scripts/utils.js';
import { getGitHubSite } from '../start/utils.js';

const { parseSubdomain } = await import(`${getNx2()}/blocks/siteselector/site-utils.js`);

export function getSiteFromUrl(value) {
  const gitHubSite = getGitHubSite(value);
  if (gitHubSite) return gitHubSite;
  const [org, site] = parseSubdomain(value)?.slice(2).split('/') ?? [];
  return org && site ? { org, site } : undefined;
}
