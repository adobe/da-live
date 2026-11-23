import { DA_ORIGIN, isAllowedDaAdminOrigin } from './constants.js';
import { daFetch, getAuthToken } from './utils.js';
import { getDaRsDemoState, isDaRsSelected } from './da-rs-bootstrap.js';

const discoveries = new Map();
const capabilities = new Map();
let lastSelection;
let discoveryGeneration = 0;

// This is an explicit provider selection, not a URL supplied by the caller.
export function isDaRsBinding() {
  const params = new URL(window.location.href).searchParams;
  const selection = `${params.get('da-source')}:${params.get('da-admin')}:${DA_ORIGIN}:${getDaRsDemoState().status}`;
  if (lastSelection !== selection) {
    discoveries.clear();
    capabilities.clear();
    discoveryGeneration += 1;
    lastSelection = selection;
  }
  return isDaRsSelected();
}

export function invalidateDaRsDiscovery() {
  discoveries.clear();
  capabilities.clear();
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

export async function getDaRsDemoConfig() {
  const { status, config, error } = getDaRsDemoState();
  if (status === 'failed') throw new Error(`Invalid da-rs demo configuration: ${error?.message}`);
  return status === 'ready' && isDaRsSelected() ? config : null;
}

const PROFILES = ['aem-import', 'native-da'];
const OPEN_KINDS = ['page', 'sheet', 'image', 'asset'];

// A demo context is the deployment default; an explicit ?da-source stays backwards compatible.
const isDemoContext = () => !new URL(window.location.href).searchParams.get('da-source')
  && getDaRsDemoState().status === 'ready';

function parseCapabilities(data, binding) {
  const {
    apiVersion, transport, contentProfile, readOnly, openKinds, collaboration, branching,
    generation,
  } = data || {};
  const imported = contentProfile === 'aem-import';
  if (apiVersion !== 1 || transport !== 'helix6' || !PROFILES.includes(contentProfile)
    || ![readOnly, collaboration, branching].every((value) => typeof value === 'boolean')
    || !Array.isArray(openKinds) || !openKinds.every((kind) => OPEN_KINDS.includes(kind))
    || !(generation === null || typeof generation === 'string')
    || (imported && (!readOnly || collaboration || branching || typeof generation !== 'string'))
    || (!imported && readOnly)) {
    throw new Error('Invalid da-rs capabilities response');
  }
  return Object.freeze({
    apiVersion,
    transport,
    contentProfile,
    readOnly,
    openKinds: Object.freeze([...openKinds]),
    collaboration,
    branching,
    generation,
    origin: binding.origin,
    org: binding.org,
    site: binding.site,
  });
}

async function identityKey() {
  const token = await getAuthToken();
  if (!token) return 'anonymous';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function fetchCapabilities(org, site, generation, identity, href) {
  const binding = await discoverDaRs(org, site);
  const current = async () => {
    if (!isDaRsBinding() || discoveryGeneration !== generation
      || window.location.href !== href || await identityKey() !== identity) {
      throw new Error('da-rs context changed');
    }
  };
  await current();
  if (binding.mode !== 'helix6') {
    // Unknown is never native in a demo context.
    if (isDemoContext()) throw new Error('da-rs demo site is not served over Helix 6');
    return null;
  }
  const response = await daFetch(`${DA_ORIGIN}/${org}/sites/${site}/source-capabilities`, { noRedirect: true, redirect: 'error', cache: 'no-store' });
  await current();
  if (!response.ok || response.redirected) throw new Error(`da-rs capabilities unavailable (${response.status})`);
  return parseCapabilities(await response.json(), binding);
}

export async function discoverDaRsCapabilities(org, site) {
  if (!isDaRsBinding()) return null;
  if (!isAllowedDaAdminOrigin(DA_ORIGIN) || !validSite(org, site)) {
    throw new Error('Invalid da-rs site binding');
  }
  const identity = await identityKey();
  const generation = discoveryGeneration;
  const key = `da-rs|${DA_ORIGIN}|${identity}|${org}/${site}|${generation}`;
  if (!capabilities.has(key)) {
    const pending = fetchCapabilities(org, site, generation, identity, window.location.href)
      .catch((error) => {
        if (capabilities.get(key) === pending) capabilities.delete(key);
        throw error;
      });
    capabilities.set(key, pending);
  }
  return capabilities.get(key);
}

const NONE = Object.freeze({
  canOpen: false, canWrite: false, collaboration: false, branching: false, readOnly: true, view: 'none',
});

export function siteItemCapabilities(siteCaps, kind, permissions) {
  const writable = Array.isArray(permissions) && permissions.includes('write');
  const folder = kind === 'folder';
  if (!siteCaps) {
    // Unbound/hosted: unchanged native routing and permission checks, never a grant.
    let view = 'editor';
    if (folder) view = 'browse';
    else if (kind === 'image' || kind === 'asset') view = 'media';
    return {
      canOpen: true,
      canWrite: writable,
      collaboration: !folder,
      branching: false,
      readOnly: !writable,
      view,
    };
  }
  const known = folder || OPEN_KINDS.includes(kind);
  const open = known && (folder || siteCaps.openKinds.includes(kind));
  if (siteCaps.contentProfile === 'aem-import') {
    let view = 'none';
    if (folder) view = 'browse';
    else if (open && kind === 'image') view = 'media';
    else if (open && kind === 'sheet') view = 'sheet-readonly';
    if (view === 'none') return NONE;
    return {
      canOpen: true, canWrite: false, collaboration: false, branching: false, readOnly: true, view,
    };
  }
  if (!open) return NONE;
  const canWrite = !siteCaps.readOnly && writable;
  let view = 'editor';
  if (folder) view = 'browse';
  else if (kind === 'image' || kind === 'asset') view = 'media';
  return {
    canOpen: true,
    canWrite,
    collaboration: siteCaps.collaboration && (kind === 'page' || kind === 'sheet'),
    branching: siteCaps.branching,
    readOnly: !canWrite,
    view,
  };
}
