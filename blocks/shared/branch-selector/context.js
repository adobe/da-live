import { getNx2, sanitizePathParts } from '../../../scripts/utils.js';
import { DA_ORIGIN } from '../constants.js';
import { parseSiteSegment } from '../content-branch-context.js';
import { createBranchingDiscovery, DA_RS_PROVIDER } from '../branching.js';
import { createBranchingClient } from '../branching-client.js';
import { lockBranchEditing } from '../branch-conflicts/editing-lock.js';

const discovery = createBranchingDiscovery();

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
  const probe = dependencies.discovery || discovery;
  const makeClient = dependencies.createClient || createBranchingClient;
  const { org, site } = context;
  const support = await probe.discover({ providerId: DA_RS_PROVIDER, org, site });
  if (support.status !== 'available') throw new Error(`Branching ${support.status}`);
  const client = makeClient({ org: context.org, site: context.site });
  const branch = await client.get(context.branch);
  if (branch?.id !== context.branch) throw new Error('Branch metadata does not match the URL');
  // Only lock the current URL, never a destination being validated for a switch.
  if (branch.activeSyncId) {
    const active = branchContext();
    if (active?.org === context.org && active.siteSegment === context.siteSegment) {
      lockBranchEditing();
    }
  }
  return { client, branch, capabilities: support.capabilities };
}

export async function discoverBranching(org, site) {
  return discovery.discover({ providerId: DA_RS_PROVIDER, org, site });
}

// Only offer Default -> branch when the current default Source is the same
// origin as the selected da-rs binding, and nx2 has not selected Helix.
export async function defaultSourceMatchesBinding(org, site) {
  const { isHlx6 } = await import(`${getNx2()}/utils/api.js`);
  if (await isHlx6(org, site)) return false;
  const { DA_ADMIN } = await import(`${getNx2()}/utils/utils.js`);
  return new URL(DA_ADMIN).origin === new URL(DA_ORIGIN).origin;
}
