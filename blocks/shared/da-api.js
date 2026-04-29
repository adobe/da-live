// Bridge to the canonical API abstraction in da-nx. Importing this module
// awaits the dynamic load of da-nx once so da-live call sites can use the
// re-exports synchronously.
import { getNx } from '../../scripts/utils.js';

const nxBase = getNx();

export const {
  daApi,
  resolveDaApi,
  getDaApi,
  knownApiVersion,
  registerApiVersion,
} = await import(`${nxBase}/utils/api/index.js`);

export const {
  daFetch,
  initIms,
  getAuthToken,
} = await import(`${nxBase}/utils/api/fetch.js`);

// Convenience: parse an /{org}/{site}/... path into { org, site }.
export function pathOrgSite(path) {
  const parts = (path || '').split('/').filter((p) => p !== '');
  return { org: parts[0], site: parts[1] };
}

// Pre-resolve detection on navigation. Safe to call on every hash change —
// caches per-(org, site).
export async function prepareApiForPath(path) {
  const { org, site } = pathOrgSite(path);
  if (!org) return undefined;
  return resolveDaApi(org, site);
}
