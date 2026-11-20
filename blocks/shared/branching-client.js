import { DA_ORIGIN } from './constants.js';
import { daFetch } from './utils.js';
import { parseSiteSegment, withBranch } from './content-branch-context.js';

function part(value) {
  if (typeof value !== 'string' || !value || value === '.' || value === '..' || /[/\\]/.test(value)) {
    throw new TypeError('Invalid route segment');
  }
  return encodeURIComponent(value);
}

function query(params = {}) {
  const values = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) values.set(key, String(value));
  });
  const encoded = values.toString();
  return encoded ? `?${encoded}` : '';
}

/** HTTP error preserving status and the structured server error for UI decisions. */
export class BranchingError extends Error {
  constructor(status, error) {
    super(error?.message || `Branching request failed (${status})`);
    this.name = 'BranchingError';
    this.status = status;
    this.code = error?.code;
    this.details = error;
  }
}

/** Bound to one explicitly selected da-rs origin and site; never retries unscoped. */
export function createBranchingClient({ org, site, origin = DA_ORIGIN, fetcher = daFetch }) {
  const parsed = parseSiteSegment(site);
  if (parsed.branch !== null) throw new TypeError('Expected a bare site');
  const base = new URL(origin).origin;
  const scope = `${part(org)}/${part(site)}`;
  const branches = `${base}/branches/${scope}`;
  const log = `${base}/log/${scope}`;

  async function request(url, { method = 'GET', body, headers = {}, signal, raw = false } = {}) {
    const options = { method, headers: { ...headers }, signal, noRedirect: true, redirect: 'error' };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const response = await fetcher(url, options);
    if (!response.ok) {
      let data;
      try { data = await response.json(); } catch { /* Error body is optional. */ }
      throw new BranchingError(response.status, data?.error);
    }
    if (raw) return response;
    if (response.status === 204) return null;
    return response.json();
  }

  async function logWithRevision(url) {
    const response = await request(url, { raw: true });
    const header = response.headers.get('Branch-Revision');
    const defaultRevision = Number(header);
    if (!header || !/^\d+$/.test(header) || !Number.isSafeInteger(defaultRevision)) {
      throw new Error('Missing or invalid default revision');
    }
    return { data: await response.json(), defaultRevision };
  }

  const branch = (id) => `${branches}/${part(id)}`;
  const session = (id, syncId) => `${branch(id)}/sync/${part(syncId)}`;
  return Object.freeze({
    // Discovery needs the raw response to distinguish unsupported from unavailable.
    capabilities: ({ signal } = {}) => fetcher(`${branches}/capabilities`, { method: 'GET', headers: {}, signal, noRedirect: true, redirect: 'error' }),
    enable: () => request(`${branches}/enable`, { method: 'POST' }),
    list: () => request(`${branches}/`),
    create: (name) => request(`${branches}/`, { method: 'POST', body: { name } }),
    get: (id) => request(branch(id)),
    delete: (id) => request(branch(id), { method: 'DELETE' }),
    changes: (id, cursor) => request(`${branch(id)}/changes${query({ cursor })}`),
    changesDetail: (id, params) => request(`${branch(id)}/changes/detail${query(params)}`),
    getChangeValue: (id, { path, branchRevision, defaultRevision, side }) => {
      if (typeof path !== 'string' || !path.startsWith('/')
        || !Number.isSafeInteger(branchRevision) || branchRevision < 0
        || !Number.isSafeInteger(defaultRevision) || defaultRevision < 0
        || !['base', 'branch', 'default'].includes(side)) throw new TypeError('Invalid pinned change value');
      return request(`${branch(id)}/changes/value${query({ path, branchRevision, defaultRevision, side })}`, { raw: true });
    },
    sync: (id, expectedBranchRevision) => request(`${branch(id)}/sync`, { method: 'POST', body: { expectedBranchRevision } }),
    getSync: (id, syncId) => request(session(id, syncId)),
    getSyncValue: (id, syncId, entryId, side) => {
      if (!['base', 'branch', 'default'].includes(side)) throw new TypeError('Invalid sync value side');
      return request(`${session(id, syncId)}/entries/${part(entryId)}/${side}`, { raw: true });
    },
    resolve: (id, syncId, entryId, resolution) => request(`${session(id, syncId)}/resolutions/${part(entryId)}`, { method: 'PUT', body: resolution }),
    completeSync: (id, syncId, expectedSessionRevision) => request(`${session(id, syncId)}/complete`, { method: 'POST', body: { expectedSessionRevision } }),
    cancelSync: (id, syncId) => request(session(id, syncId), { method: 'DELETE' }),
    publish: (id, expectedBranchRevision, idempotencyKey) => {
      if (typeof idempotencyKey !== 'string' || !idempotencyKey) throw new TypeError('Idempotency key required');
      return request(`${branch(id)}/publish`, { method: 'POST', body: { expectedBranchRevision }, headers: { 'Idempotency-Key': idempotencyKey } });
    },
    listLog: (params) => request(`${log}/${query(params)}`),
    getCommit: (revision) => request(`${log}/${part(String(revision))}`),
    listLogWithRevision: (params) => logWithRevision(`${log}/${query(params)}`),
    getCommitWithRevision: (revision) => logWithRevision(`${log}/${part(String(revision))}`),
    getLogValue: (revision, index, side) => {
      if (!['before', 'after'].includes(side)) throw new TypeError('Invalid value side');
      return request(`${log}/${part(String(revision))}/changes/${part(String(index))}/${side}`, { raw: true });
    },
    getSourceValue: (path, selectedBranch = null) => {
      if (typeof path !== 'string' || !path.startsWith('/')) throw new TypeError('Invalid source path');
      const sourcePath = path.slice(1).split('/').map(part).join('/');
      return request(`${base}/source/${part(org)}/${withBranch(site, selectedBranch)}/${sourcePath}`, { raw: true });
    },
    getCurrentValue: (path) => {
      if (typeof path !== 'string') throw new TypeError('Invalid item path');
      const config = path.startsWith('config:/');
      if (!config && !path.startsWith('/')) throw new TypeError('Invalid item path');
      const tail = config ? path.slice('config:/'.length) : path.slice(1);
      if (!config && !tail) throw new TypeError('Invalid item path');
      const suffix = tail ? `/${tail.split('/').map(part).join('/')}` : '';
      return request(`${base}/${config ? 'config' : 'source'}/${scope}${suffix}`, { raw: true });
    },
    revert: (revision, body) => request(`${log}/${part(String(revision))}/revert`, { method: 'POST', body }),
    restore: (body) => request(`${log}/restore`, { method: 'POST', body }),
    // Returned URLs are deliberately not accepted. Construct Source reads from
    // separately validated context, or log reads via getLogValue above.
  });
}
