import { DA_ORIGIN } from './constants.js';
import { createBranchingClient } from './branching-client.js';
import { isSingleAuthorDemo } from './da-rs-bootstrap.js';

const OPERATIONS = Object.freeze(['create', 'changes', 'sync', 'publish', 'revert', 'restore']);
const ITEM_KINDS = Object.freeze(['html', 'json', 'media', 'config']);
const DEFAULT_TIMEOUT_MS = 1500;

// Select this identity only when Source is actually bound to this da-rs origin.
export const DA_RS_PROVIDER = `da-rs:${DA_ORIGIN}`;

const result = (status, reason) => Object.freeze({ status, reason });

function contextKey({ providerId, org, site }) {
  if (![providerId, org, site].every((value) => typeof value === 'string' && value.trim())) {
    throw new TypeError('Branching discovery requires providerId, org, and site');
  }
  return JSON.stringify([providerId, org, site]);
}

function parseCapabilities(data) {
  if (data?.supported === false) return result('unsupported', 'not-supported');
  if (data?.supported !== true || data.apiVersion !== 1) return result('unavailable', 'invalid-capabilities');
  const complete = data.defaultBranchId === 'main' && data.addressing === 'site-suffix'
    && data.separator === '~' && data.branchScopedSource === true
    && (data.branchScopedCollaboration === true || isSingleAuthorDemo())
    && Array.isArray(data.operations)
    && OPERATIONS.every((op) => data.operations.includes(op)) && Array.isArray(data.itemKinds)
    && ITEM_KINDS.every((kind) => data.itemKinds.includes(kind));
  if (!complete) return result('unavailable', 'incomplete-capabilities');
  return Object.freeze({
    status: 'available',
    capabilities: Object.freeze({
      supported: true,
      apiVersion: 1,
      defaultBranchId: 'main',
      addressing: 'site-suffix',
      separator: '~',
      operations: OPERATIONS,
      itemKinds: ITEM_KINDS,
      branchScopedSource: true,
      branchScopedCollaboration: data.branchScopedCollaboration === true,
      helix6BranchSource: data.helix6BranchSource === true,
    }),
  });
}

async function probe(loader, context, signal) {
  const module = await loader({ ...context, signal });
  if (typeof module?.capabilities !== 'function') return result('unsupported', 'missing-module');
  const response = await module.capabilities({ org: context.org, site: context.site, signal });
  if (!response || typeof response.json !== 'function') return result('unavailable', 'invalid-response');
  if ([404, 501].includes(response.status)) return result('unsupported', 'not-implemented');
  if ([401, 403].includes(response.status)) return result('unavailable', 'authorization');
  if (!response.ok) return result('unavailable', 'request-failed');
  try {
    return parseCapabilities(await response.json());
  } catch {
    return result('unavailable', 'invalid-response');
  }
}

async function discoverSupport(loader, context, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => {
      resolve(result('unavailable', 'timeout'));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([probe(loader, context, controller.signal), deadline]);
  } catch {
    return result('unavailable', 'request-failed');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Optional, inert discovery. The default loader recognizes only DA_RS_PROVIDER;
 * callers explicitly select it when their Source provider is da-rs. A custom
 * provider-bound loader can return undefined for providers without branching.
 * Invalidate on provider/account changes and before retry; consumers must guard
 * navigation against responses from their former context.
 */
export function createBranchingDiscovery({
  loadBranching = ({ providerId, org, site }) => (providerId === DA_RS_PROVIDER
    ? createBranchingClient({ org, site }) : undefined),
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof loadBranching !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('Branching discovery requires a loader and positive finite timeout');
  }
  const cache = new Map();
  return Object.freeze({
    discover(context, { refresh = false, maxAgeMs = 0, requireHelix6 = false } = {}) {
      const { providerId, org, site } = context;
      const captured = { providerId, org, site };
      const key = contextKey(captured);
      let entry = cache.get(key);
      const reusable = entry?.settled && entry.result?.status === 'available'
        && (!requireHelix6 || entry.result.capabilities.helix6BranchSource)
        && Date.now() - entry.settledAt < maxAgeMs;
      if (!entry || (refresh && entry.settled && !reusable)) {
        entry = { settled: false, promise: discoverSupport(loadBranching, captured, timeoutMs) };
        cache.set(key, entry);
        const pending = entry;
        pending.promise.then((value) => {
          pending.result = value;
          pending.settledAt = Date.now();
          pending.settled = true;
        });
      }
      return entry.promise;
    },
    invalidate(context) {
      if (context) cache.delete(contextKey(context));
      else cache.clear();
    },
  });
}
