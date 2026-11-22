import { DA_ORIGIN, isAllowedDaAdminOrigin } from './constants.js';
import { daFetch } from './utils.js';

const discoveries = new Map();
let lastSelection;
let discoveryGeneration = 0;

// This is an explicit provider selection, not a URL supplied by the caller.
export function isDaRsBinding() {
  const params = new URL(window.location.href).searchParams;
  const selection = `${params.get('da-source')}:${params.get('da-admin')}:${DA_ORIGIN}`;
  if (lastSelection !== selection) {
    discoveries.clear();
    discoveryGeneration += 1;
    lastSelection = selection;
  }
  return params.get('da-source') === 'da-rs';
}

export function invalidateDaRsDiscovery() {
  discoveries.clear();
  discoveryGeneration += 1;
}

export const daRsDiscoveryGeneration = () => discoveryGeneration;

export const isValidDaRsSegment = (part) => typeof part === 'string' && /^[a-z0-9_-]+$/.test(part);
export const isStrongSourceETag = (value) => typeof value === 'string'
  && /^"[\x21\x23-\x7e\x80-\xff]*"$/.test(value);

function validSite(org, site) {
  return isValidDaRsSegment(org) && isValidDaRsSegment(site);
}

export async function provisionDaRsSite(org, site) {
  if (!isDaRsBinding() || !isAllowedDaAdminOrigin(DA_ORIGIN) || !validSite(org, site)) {
    throw new Error('Invalid da-rs site binding');
  }
  const { hash, search } = window.location;
  const active = hash.startsWith('#/') ? hash.slice(2).split('/') : [];
  if ((active[0] && active[0] !== org) || (active[1] && active[1] !== site)) {
    throw new Error('da-rs context changed');
  }
  const response = await daFetch(`${DA_ORIGIN}/${org}/sites/${site}/source/`, { method: 'POST', noRedirect: true, redirect: 'error' });
  if (window.location.hash !== hash || window.location.search !== search) {
    throw new Error('da-rs context changed');
  }
  if (response.ok) invalidateDaRsDiscovery();
  return response;
}

export function discoverDaRs(org, site) {
  if (!isDaRsBinding() || !isAllowedDaAdminOrigin(DA_ORIGIN)
    || !validSite(org, site)) {
    return Promise.reject(new Error('Invalid da-rs site binding'));
  }
  const key = `${DA_ORIGIN}/${org}/${site}`;
  if (!discoveries.has(key)) {
    const { href } = window.location;
    const generation = discoveryGeneration;
    const pending = daFetch(`${DA_ORIGIN}/ping/${org}/${site}`, { noRedirect: true, redirect: 'error', cache: 'no-store' }).then((response) => {
      if (!isDaRsBinding() || discoveryGeneration !== generation
        || window.location.href !== href) {
        throw new Error('da-rs context changed');
      }
      if (!response.ok || response.redirected) throw new Error('da-rs discovery unavailable');
      const upgrade = response.headers.get('x-api-upgrade-available');
      if (upgrade !== null && upgrade !== 'true') throw new Error('Invalid da-rs discovery response');
      return Object.freeze({
        origin: DA_ORIGIN,
        org,
        site,
        mode: upgrade === 'true' ? 'helix6' : 'legacy',
      });
    }).catch((error) => {
      if (discoveries.get(key) === pending) discoveries.delete(key);
      throw error;
    });
    discoveries.set(key, pending);
  }
  return discoveries.get(key);
}

export function daRsSourceUrl(binding, path = '') {
  const { origin, org, site, mode, branch } = binding;
  const siteSegment = branch ? `${site}~${branch}` : site;
  return mode === 'helix6'
    ? `${origin}/${org}/sites/${siteSegment}/source${path}`
    : `${origin}/source/${org}/${siteSegment}${path}`;
}
