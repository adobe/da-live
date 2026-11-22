import { getNx2, sanitizePathParts } from '../../../scripts/utils.js';
import { DA_ORIGIN } from '../constants.js';
import { parseSiteSegment } from '../content-branch-context.js';
import { createBranchingDiscovery, DA_RS_PROVIDER } from '../branching.js';
import { createBranchingClient } from '../branching-client.js';
import { lockBranchEditing } from '../branch-conflicts/editing-lock.js';
import { daRsDiscoveryGeneration, discoverDaRs, isDaRsBinding } from '../da-rs-provider.js';

const discovery = createBranchingDiscovery();
const CAPABILITY_REUSE_MS = 250;
let discoveryGeneration = 0;
let lastProviderGeneration;

function syncProviderDiscovery() {
  const generation = daRsDiscoveryGeneration();
  if (generation !== lastProviderGeneration) {
    discovery.invalidate();
    lastProviderGeneration = generation;
  }
}

export function invalidateBranchingDiscovery() {
  discoveryGeneration += 1;
  discovery.invalidate();
}

// Read the actual browser URL, never nx's independently normalized hash state.
export function branchContext(hash = window.location.hash) {
  if (!hash.startsWith('#/')) return null;
  const raw = hash.slice(2).split('/');
  if (!raw[1] || !/[~%]/.test(raw[1])) return null;
  const parts = sanitizePathParts(hash.slice(1));
  if (!raw[1].includes('~')) return null;
  const { site, branch } = parseSiteSegment(raw[1]);
  return Object.freeze({ org: parts[0], site, branch, siteSegment: raw[1] });
}

export function pathMatchesActiveBranch(path) {
  try {
    const requested = branchContext(`#${path}`);
    if (!requested) return true;
    const active = branchContext();
    return active?.org === requested.org && active?.siteSegment === requested.siteSegment;
  } catch {
    return false;
  }
}

export async function validateBranch(context, dependencies = {}) {
  if (!context?.branch) return null;
  const { href } = window.location;
  const generation = discoveryGeneration;
  const bound = isDaRsBinding();
  const providerGeneration = daRsDiscoveryGeneration();
  syncProviderDiscovery();
  const checkCurrent = () => {
    if (window.location.href !== href || discoveryGeneration !== generation
      || (bound && daRsDiscoveryGeneration() !== providerGeneration)) throw new Error('Branch context changed');
  };
  const probe = dependencies.discovery || discovery;
  const makeClient = dependencies.createClient || createBranchingClient;
  const { org, site } = context;
  const binding = bound ? await discoverDaRs(org, site) : null;
  checkCurrent();
  const scope = { providerId: DA_RS_PROVIDER, org, site };
  const maxAgeMs = dependencies.forceFresh ? 0 : CAPABILITY_REUSE_MS;
  const options = { refresh: Boolean(binding), maxAgeMs };
  if (binding?.mode === 'helix6') options.requireHelix6 = true;
  const support = await probe.discover(scope, options);
  checkCurrent();
  if (support.status !== 'available') throw new Error(`Branching ${support.status}`);
  if (binding?.mode === 'helix6' && support.capabilities?.helix6BranchSource !== true) {
    throw new Error('Helix 6 branch Source unavailable');
  }
  const client = makeClient({ org: context.org, site: context.site });
  const branch = await client.get(context.branch);
  checkCurrent();
  if (branch?.id !== context.branch) throw new Error('Branch metadata does not match the URL');
  // Only lock the current URL, never a destination being validated for a switch.
  if (branch.activeSyncId) {
    const active = branchContext();
    if (active?.org === context.org && active.siteSegment === context.siteSegment) {
      lockBranchEditing();
    }
  }
  const { capabilities } = support;
  return { client, branch, capabilities, binding, assertCurrent: checkCurrent };
}

export async function discoverBranching(org, site, options) {
  return discovery.discover({ providerId: DA_RS_PROVIDER, org, site }, options);
}

// Only offer switching when Default and branch Source share the selected provider.
export async function defaultSourceMatchesBinding(org, site) {
  if (isDaRsBinding()) {
    const { href } = window.location;
    syncProviderDiscovery();
    const binding = await discoverDaRs(org, site);
    if (window.location.href !== href) throw new Error('Branch context changed');
    if (binding.mode === 'legacy') return true;
    const options = { refresh: true, requireHelix6: true };
    const support = await discoverBranching(org, site, options);
    if (window.location.href !== href) throw new Error('Branch context changed');
    return support.status === 'available' && support.capabilities.helix6BranchSource === true;
  }
  const { isHlx6 } = await import(`${getNx2()}/utils/api.js`);
  if (await isHlx6(org, site)) return false;
  const { DA_ADMIN } = await import(`${getNx2()}/utils/utils.js`);
  return new URL(DA_ADMIN).origin === new URL(DA_ORIGIN).origin;
}
