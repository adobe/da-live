/* eslint-disable object-curly-newline */
/* eslint-disable no-use-before-define */
import { HLX_ADMIN, AEM_API, DA_ADMIN, ALLOWED_TOKEN } from './utils.js';
import { loadIms, handleSignIn } from './ims.js';

// ============================================================================
// Public API
// ----------------------------------------------------------------------------
// Namespaces (alphabetical):
//   aem        combined preview + live operations (single or bulk)
//   config     org/site config get/save/delete
//   jobs       background job get/details/stop
//   org        org-level operations
//   signout    DA logout
//   snapshot   snapshot CRUD + review/publish
//   source     DA <-> AEM document operations (get/list/save/copy/move/...)
//   status     AEM status (preview/live) for a path
//   versions   document version list/get/create
//
// Response helpers:
//   asJson     unwrap a method promise to { ok, data, status, error } (JSON)
//   asText     unwrap a method promise to { ok, data, status, error } (text)
//
// Low-level:
//   daFetch    authenticated fetch (used by everything above)
//   isHlx6     Helix 6 upgrade-status probe (cached)
//   fromPath   `/org/site/file/path` -> { org, site, path }
//
// All namespace methods return a raw `Response` (augmented with
// `resp.permissions`) EXCEPT `source.list`, which merges body + header
// continuation token + normalized items into `{ ok, items, continuationToken,
// permissions }`. See `source.list` notes for why.
// ============================================================================

// aem: combined preview + live operations.
// preview/unPreview/publish/unPublish accept `path` as string or array (2+ -> bulk).
// preview/publish also accept optional `forceUpdate`/`forceSync` flags.
export const aem = {
  getPreview: withArgs(({ org, site, path }) => callPath({
    api: 'preview', org, site, path, method: 'GET',
  })),

  getPublish: withArgs(({ org, site, path }) => callPath({
    api: 'live', org, site, path, method: 'GET',
  })),

  preview: withArgs(({ org, site, path, forceUpdate, forceSync }) => callPath({
    api: 'preview', org, site, path, method: 'POST', forceUpdate, forceSync,
  })),

  unPreview: withArgs(({ org, site, path }) => callPath({
    api: 'preview', org, site, path, method: 'DELETE', includeDelete: true,
  })),

  publish: withArgs(({ org, site, path, forceUpdate, forceSync }) => callPath({
    api: 'live', org, site, path, method: 'POST', forceUpdate, forceSync,
  })),

  unPublish: withArgs(({ org, site, path }) => callPath({
    api: 'live', org, site, path, method: 'DELETE', includeDelete: true,
  })),
};

// config: top-level org/site config.
export const config = {
  get: withArgs(async ({ org, site }) => {
    const url = await getDaApiPath(CONFIG, org, site);
    return daFetch({ url });
  }),

  save: withArgs(async ({ org, site, body }) => {
    const url = await getDaApiPath(CONFIG, org, site);
    const formData = new FormData();
    formData.append(CONFIG, body);
    return daFetch({ url, opts: { method: 'PUT', body: formData } });
  }),

  delete: withArgs(async ({ org, site }) => {
    const url = await getDaApiPath(CONFIG, org, site);
    return daFetch({ url, opts: { method: 'DELETE' } });
  }),

  getAggregated: withArgs(async ({ org, site }) => {
    const hlx6 = await isHlx6(org, site);
    if (!hlx6) return { ...HLX6_ONLY };
    const url = `${AEM_API}/${org}/aggregated/${site}/config.json`;
    return daFetch({ url });
  }),
};

// jobs: background job control.
export const jobs = {
  get: async ({ org, site, topic, name }) => {
    const tail = name ? `/${topic}/${name}` : `/${topic}`;
    const url = await getAemApiPath('jobs', org, site, tail);
    return daFetch({ url });
  },

  details: async ({ org, site, topic, name }) => {
    const url = await getAemApiPath('jobs', org, site, `/${topic}/${name}/details`);
    return daFetch({ url });
  },

  stop: async ({ org, site, topic, name }) => {
    const url = await getAemApiPath('jobs', org, site, `/${topic}/${name}`);
    return daFetch({ url, opts: { method: 'DELETE' } });
  },
};

// org: organization-level operations. New-API only; no hlx6 detection
// (no site to probe). The endpoint will 404 on non-migrated orgs.
const orgNs = {
  listSites: async ({ org }) => daFetch({ url: `${AEM_API}/${org}/sites` }),
};
export { orgNs as org };

export const signout = () => {
  daFetch({ url: `${DA_ADMIN}/logout` });
};

// snapshot: snapshot CRUD and review/publish actions.
export const snapshot = {
  list: async ({ org, site }) => {
    const url = await getAemApiPath('snapshots', org, site);
    return daFetch({ url });
  },

  get: async ({ org, site, snapshotId }) => {
    const url = await getAemApiPath('snapshots', org, site, `/${snapshotId}`);
    return daFetch({ url });
  },

  save: async ({ org, site, snapshotId, body }) => {
    const url = await getAemApiPath('snapshots', org, site, `/${snapshotId}`);
    const opts = body ? jsonOpts('POST', body) : { method: 'POST' };
    return daFetch({ url, opts });
  },

  delete: async ({ org, site, snapshotId }) => {
    const url = await getAemApiPath('snapshots', org, site, `/${snapshotId}`);
    return daFetch({ url, opts: { method: 'DELETE' } });
  },

  addPath: async ({ org, site, snapshotId, path }) => {
    const normalized = normalizePath(path);
    if (Array.isArray(normalized) && normalized.length >= 2) {
      const url = await getAemApiPath('snapshots', org, site, `/${snapshotId}/*`);
      return daFetch({ url, opts: jsonOpts('POST', { paths: normalized }) });
    }
    const single = Array.isArray(normalized) ? normalized[0] : normalized;
    const url = await getAemApiPath('snapshots', org, site, `/${snapshotId}${single}`);
    return daFetch({ url, opts: { method: 'POST' } });
  },

  removePath: async ({ org, site, snapshotId, path }) => {
    const normalized = normalizePath(path);
    if (Array.isArray(normalized) && normalized.length >= 2) {
      const url = await getAemApiPath('snapshots', org, site, `/${snapshotId}/*`);
      return daFetch({ url, opts: jsonOpts('POST', { paths: normalized, delete: true }) });
    }
    const single = Array.isArray(normalized) ? normalized[0] : normalized;
    const url = await getAemApiPath('snapshots', org, site, `/${snapshotId}${single}`);
    return daFetch({ url, opts: { method: 'DELETE' } });
  },

  publish: async ({ org, site, snapshotId }) => {
    const url = new URL(await getAemApiPath('snapshots', org, site, `/${snapshotId}`));
    url.searchParams.set('publish', 'true');
    return daFetch({ url: url.toString(), opts: { method: 'POST' } });
  },

  review: async ({ org, site, snapshotId, action }) => {
    const url = new URL(await getAemApiPath('snapshots', org, site, `/${snapshotId}`));
    url.searchParams.set('review', action);
    return daFetch({ url: url.toString(), opts: { method: 'POST' } });
  },
};

// source: DA <-> AEM document operations. First arg is either
// { org, site, path, ...extras } or a `/org/site/file/path` string.
// `extras` (second arg) merges with parsed args when arg is a string.
export const source = {
  get: withArgs(async ({ org, site, path }) => {
    const url = await getDaApiPath(SOURCE, org, site, path);
    return daFetch({ url });
  }),

  // Returns `{ ok, items, continuationToken, permissions }`. Pagination
  // continues when the server returns a `da-continuation-token` header; pass
  // it back via the method's `continuationToken` arg to fetch the next page.
  list: withArgs(async ({ org, site, path, continuationToken, opts }) => {
    const cleanPath = (path || '').replace(/\/$/, '');
    const parentPath = `/${org}${site ? `/${site}` : ''}${cleanPath}`;
    const fetchOpts = continuationToken
      ? { ...opts, headers: { ...opts?.headers, 'da-continuation-token': continuationToken } }
      : opts;
    let resp;
    // Org-only list (no site) is DA-legacy only; hlx6 has no equivalent.
    if (site) {
      const hlx6 = await isHlx6(org, site);
      if (hlx6) {
        const slashed = path?.endsWith('/') ? path : `${path ?? ''}/`;
        const url = await getDaApiPath(SOURCE, org, site, slashed);
        resp = await daFetch({ url, opts: fetchOpts });
      }
    }
    if (!resp) {
      const url = await getDaApiPath(LIST, org, site, path);
      resp = await daFetch({ url, opts: fetchOpts });
    }
    const nextToken = resp?.headers?.get?.('da-continuation-token') || null;
    const { permissions } = resp || {};
    if (!resp?.ok) return { ok: false, items: [], continuationToken: nextToken, permissions };
    let raw;
    try {
      raw = await resp.json();
    } catch { raw = []; }
    const items = Array.isArray(raw) ? hlx6ToDaList(parentPath, raw) : [];
    return { ok: true, items, continuationToken: nextToken, permissions };
  }),

  save: withArgs(async ({ org, site, path, body }) => {
    const hlx6 = await isHlx6(org, site);
    const url = await getDaApiPath(SOURCE, org, site, path);
    const opts = { method: 'POST' };
    const ext = Object.keys(TYPE_MAP).find((e) => path.endsWith(e));
    if (hlx6) {
      opts.body = body;
      if (ext) opts.headers = { 'Content-Type': TYPE_MAP[ext] };
      return daFetch({ url, opts });
    }
    const formData = new FormData();
    formData.append('data', new Blob([body], { type: TYPE_MAP[ext] }));
    opts.body = formData;
    return daFetch({ url, opts });
  }),

  // HEAD request — the value is in the response headers (doc-id, last-modified, etc.).
  getMetadata: withArgs(async ({ org, site, path }) => {
    const url = await getDaApiPath(SOURCE, org, site, path);
    return daFetch({ url, opts: { method: 'HEAD' } });
  }),

  delete: withArgs(async ({ org, site, path }) => {
    const url = await getDaApiPath(SOURCE, org, site, path);
    return daFetch({ url, opts: { method: 'DELETE' } });
  }),

  copy: withArgs(async ({
    org, site, path, destination, collision,
  }) => {
    const hlx6 = await isHlx6(org, site);
    if (hlx6) {
      const url = new URL(await getDaApiPath(SOURCE, org, site, destination));
      url.searchParams.set('source', path);
      if (collision) url.searchParams.set('collision', collision);
      return daFetch({ url: url.toString(), opts: { method: 'PUT' } });
    }
    const formData = new FormData();
    formData.append('destination', destination);
    return daFetch({
      url: `${DA_ADMIN}/copy/${org}/${site}${path}`,
      opts: { method: 'POST', body: formData },
    });
  }),

  move: withArgs(async ({
    org, site, path, destination, collision,
  }) => {
    const hlx6 = await isHlx6(org, site);
    if (hlx6) {
      const url = new URL(await getDaApiPath(SOURCE, org, site, destination));
      url.searchParams.set('source', path);
      url.searchParams.set('move', 'true');
      if (collision) url.searchParams.set('collision', collision);
      return daFetch({ url: url.toString(), opts: { method: 'PUT' } });
    }
    const formData = new FormData();
    formData.append('destination', destination);
    return daFetch({
      url: `${DA_ADMIN}/move/${org}/${site}${path}`,
      opts: { method: 'POST', body: formData },
    });
  }),

  createFolder: withArgs(async ({ org, site, path }) => {
    const url = await getDaApiPath(SOURCE, org, site, `${path}/`);
    return daFetch({ url, opts: { method: 'POST' } });
  }),

  deleteFolder: withArgs(async ({ org, site, path }) => {
    const url = await getDaApiPath(SOURCE, org, site, `${path}/`);
    return daFetch({ url, opts: { method: 'DELETE' } });
  }),
};

// status: single-path only. H6 has no bulk status endpoint.
export const status = {
  get: withArgs(async ({ org, site, path }) => {
    const url = await getAemApiPath('status', org, site, path);
    return daFetch({ url });
  }),
};

// versions: list/get/create document versions.
export const versions = {
  list: withArgs(async ({ org, site, path }) => {
    const hlx6 = await isHlx6(org, site);
    if (hlx6) {
      return daFetch({ url: `${AEM_API}/${org}/sites/${site}/source${path}/.versions` });
    }
    // Legacy DA uses a separate /versionlist endpoint for listing.
    return daFetch({ url: `${DA_ADMIN}/versionlist/${org}/${site}${path}` });
  }),

  // versionId on hlx6 is the ULID returned by versions.list; on legacy it is
  // the trailing `{versionGuid}/{fileGuid}.{ext}` segment from the list response.
  get: withArgs(async ({ org, site, path, versionId }) => {
    const hlx6 = await isHlx6(org, site);
    if (hlx6) {
      const url = `${AEM_API}/${org}/sites/${site}/source${path}/.versions/${versionId}`;
      return daFetch({ url });
    }
    return daFetch({ url: `${DA_ADMIN}/versionsource/${org}/${versionId}` });
  }),

  create: withArgs(async ({ org, site, path, operation, comment }) => {
    const hlx6 = await isHlx6(org, site);
    const url = await getDaApiPath(VERSIONS, org, site, path);
    const opts = { method: 'POST' };
    if (hlx6) {
      // hlx6 accepts { operation, comment } JSON body.
      const payload = {};
      if (operation) payload.operation = operation;
      if (comment) payload.comment = comment;
      if (Object.keys(payload).length > 0) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify(payload);
      }
    } else if (comment) {
      // Legacy DA accepts { label } JSON body. Map comment -> label.
      opts.body = JSON.stringify({ label: comment });
    }
    return daFetch({ url, opts });
  }),
};

// ----------------------------------------------------------------------------
// Response helpers — opt-in unwrappers for the common parse-or-fail patterns.
// Pass any namespace method's returned promise (or a resolved Response).
//
// Both return a flat object: `{ ok, data, status, error }`.
//   - `ok`     — `resp.ok` (true for 2xx)
//   - `data`   — parsed body (JSON / text). Populated even on non-ok when
//                the error response had a parseable body — matches axios.
//                `null` when the body could not be parsed or there is no response.
//   - `status` — HTTP status code (`0` when there is no response at all).
//   - `error`  — `null` on success; otherwise one of:
//                  `'no-response'`  — daFetch returned `{}` (no auth token)
//                  `'not-ok'`       — response arrived but `resp.ok` is false
//                  `'parse-failed'` — body failed to parse (json/text)
//
// Callers branch on `ok` for the success path, and can inspect `status` /
// `error` / `data` for failure handling without losing information.
// ----------------------------------------------------------------------------

async function unwrap(promise, parser) {
  const resp = await promise;
  if (!resp || typeof resp.status !== 'number') {
    return { ok: false, data: null, status: 0, error: 'no-response' };
  }
  let data = null;
  let error = null;
  try {
    data = await resp[parser]();
  } catch {
    error = 'parse-failed';
  }
  if (!resp.ok && !error) error = 'not-ok';
  return { ok: !!resp.ok, data, status: resp.status, error };
}

// 2xx -> { ok: true, data: <parsed JSON>, status, error: null }
// Non-ok -> { ok: false, data: <error body if parseable, else null>, status, error }
export const asJson = (promise) => unwrap(promise, 'json');

// 2xx -> { ok: true, data: <text>, status, error: null }
// Non-ok -> { ok: false, data: <text if available>, status, error }
export const asText = (promise) => unwrap(promise, 'text');

// ============================================================================
// Low-level fetch + upgrade probe
// ============================================================================

export const daFetch = async ({ url, opts = { method: 'GET' }, redirect = false }) => {
  const { accessToken } = await loadIms();
  if (!accessToken) {
    handleSignIn();
    return {};
  }

  opts.headers = opts.headers || {};

  const canToken = ALLOWED_TOKEN.some((origin) => new URL(url).origin === origin);
  if (canToken) {
    opts.headers.Authorization = `Bearer ${accessToken.token}`;
    if ([HLX_ADMIN, AEM_API].some((origin) => new URL(url).origin === origin)) {
      opts.headers['x-content-source-authorization'] = `Bearer ${accessToken.token}`;
      opts.headers.Authorization = `Bearer ${accessToken.token}`;
    }
  }

  const resp = await fetch(url, opts);
  if (resp.status === 401 || resp.status === 403) {
    if (redirect) window.location = `${window.location.origin}/not-found`;
  }

  // If child actions header is present, use it.
  // This is a hint as to what can be done with the children.
  if (resp.headers?.get('x-da-child-actions')) {
    resp.permissions = resp.headers.get('x-da-child-actions').split('=').pop().split(',');
    return resp;
  }

  // Use the self actions hint if child actions are not present.
  if (resp.headers?.get('x-da-actions')) {
    resp.permissions = resp.headers?.get('x-da-actions')?.split('=').pop().split(',');
    return resp;
  }

  // TODO: HLX6 does not have this, so fake it for now.
  resp.permissions ??= ['read', 'write'];

  return resp;
};

export const isHlx6 = (() => {
  const cache = {};

  const fetchUpgradeStatus = async (path) => {
    const lsCache = JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
    if (lsCache[path]) return true;

    const resp = await daFetch({ url: `${HLX_ADMIN}/ping${path}` });
    const upgraded = resp.headers.get('x-api-upgrade-available') !== null;
    if (upgraded) {
      lsCache[path] = true;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lsCache));
    }
    return upgraded;
  };

  return (org, site) => {
    if (!site) return false;

    const path = `/${org}/${site}`;
    cache[path] ??= fetchUpgradeStatus(path);
    return cache[path];
  };
})();

// Convert a `/org/site/file/path` string into `{ org, site, path }`.
export function fromPath(str) {
  const [, org, site, ...parts] = str.split('/');
  return { org, site, path: parts.length ? `/${parts.join('/')}` : '' };
}

// ============================================================================
// Internal helpers
// ============================================================================

const SOURCE = 'source';
const LIST = 'list';
const CONFIG = 'config';
const VERSIONS = 'versions';
const REF = 'main';
const STORAGE_KEY = 'hlx6-upgrade';
const HLX6_ONLY = { error: 'Requires Helix 6 upgrade', status: 501 };

const TYPE_MAP = {
  '.html': 'text/html',
  '.json': 'application/json',
  '.link': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
};

// DA-owned endpoints proxied between DA_ADMIN and AEM_API.
async function getDaApiPath(api, org, site, path = '') {
  const hlx6 = await isHlx6(org, site);

  if (api === VERSIONS) {
    if (hlx6) return `${AEM_API}/${org}/sites/${site}/source${path}/.versions`;
    return `${DA_ADMIN}/versionsource/${org}/${site}${path}`;
  }

  if (api === CONFIG) {
    // TODO: For now config is only supported on DA_ADMIN
    // if (hlx6) {
    //   if (!site) return `${AEM_API}/${org}/config.json`;
    //   return `${AEM_API}/${org}/sites/${site}/config.json`;
    // }
    if (!site) return `${DA_ADMIN}/config/${org}/`;
    return `${DA_ADMIN}/config/${org}/${site}/`;
  }

  // HLX6 has no list api, so source formatting is used (with trailing slash).
  if (api === LIST) {
    if (!site) return `${DA_ADMIN}/list/${org}`;
    return `${DA_ADMIN}/list/${org}/${site}${path}`;
  }

  // SOURCE
  if (hlx6) return `${AEM_API}/${org}/sites/${site}/source${path}`;
  return `${DA_ADMIN}/source/${org}/${site}${path}`;
}

// AEM-only endpoints. New API origin or legacy admin.hlx.page with ref=main.
async function getAemApiPath(api, org, site, path = '') {
  const hlx6 = await isHlx6(org, site);

  if (hlx6) {
    if (api === 'jobs') return `${AEM_API}/${org}/sites/${site}/jobs${path}`;
    if (api === 'snapshots') return `${AEM_API}/${org}/sites/${site}/snapshots${path}`;
    return `${AEM_API}/${org}/sites/${site}/${api}${path}`;
  }

  // Legacy: singular forms for jobs/snapshots, ref in path.
  if (api === 'jobs') return `${HLX_ADMIN}/job/${org}/${site}/${REF}${path}`;
  if (api === 'snapshots') return `${HLX_ADMIN}/snapshot/${org}/${site}/${REF}${path}`;
  return `${HLX_ADMIN}/${api}/${org}/${site}/${REF}${path}`;
}

// HOF: wraps a method body so it receives resolved args. The first arg
// can be either `{ org, site, path, ...extras }` or a `/org/site/file/path`
// string; `extras` (second positional) merges in when arg is a string.
// `org` is required; `site` is required by most methods but optional for a
// few (e.g., `source.list({ org })` lists at the org level on legacy DA).
// Bad input is logged but still passed through — the resulting fetch
// fails naturally and callers handle non-ok responses as usual.
function withArgs(fn) {
  return (arg = {}, extras = {}) => {
    const args = typeof arg === 'string'
      ? { ...fromPath(arg), ...extras }
      : arg;
    if (!args.org) {
      // eslint-disable-next-line no-console
      console.error('api: invalid args - pass /org/site/... string or { org, site, path }', arg);
    }
    if (typeof args.path === 'string' && !args.path.startsWith('/')) {
      args.path = `/${args.path}`;
    }
    return fn(args);
  };
}

// Ensure a path (or each path in an array) starts with `/`. Non-strings
// pass through untouched so callers handling unusual inputs aren't surprised.
function normalizePath(path) {
  if (Array.isArray(path)) return path.map(normalizePath);
  if (typeof path !== 'string') return path;
  return path.startsWith('/') ? path : `/${path}`;
}

function jsonOpts(method, payload) {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

// Dispatcher for AEM ops that accept path as string or array.
// Array of length >= 2 routes to the bulk /* endpoint with { paths, delete? }.
// `forceUpdate`/`forceSync` are bulk-only (server ignores them on single-path).
async function callPath({
  api, org, site, path, method, includeDelete = false, forceUpdate, forceSync,
}) {
  if (Array.isArray(path) && path.length >= 2) {
    const url = await getAemApiPath(api, org, site, '/*');
    const payload = { paths: path };
    if (includeDelete) payload.delete = true;
    if (forceUpdate) payload.forceUpdate = true;
    if (forceSync) payload.forceSync = true;
    return daFetch({ url, opts: jsonOpts('POST', payload) });
  }
  const single = Array.isArray(path) ? path[0] : path;
  const url = await getAemApiPath(api, org, site, single);
  return daFetch({ url, opts: { method } });
}

function hlx6ToDaList(parentPath, items) {
  return items.map((item) => {
    const contentType = item['content-type'];

    // Only HLX6 has a content type
    if (!contentType) return item;

    // Normalize folder
    const isFolder = item.name.endsWith('/');
    let name = isFolder ? item.name.slice(0, -1) : item.name;

    // Set the path before extension removal
    const path = `${parentPath}/${name}`;

    // Remove extension for display
    const nameSplit = name.split('.');
    name = nameSplit.length > 1 ? nameSplit[0] : name;

    // Scaffold out the basics
    const daItem = { name, path, contentType };

    const ext = nameSplit.length > 1 && nameSplit.pop();
    if (ext) daItem.ext = ext;

    const lastModified = item['last-modified'];
    if (lastModified) {
      const unixTime = Math.floor(new Date(lastModified).getTime());
      daItem.lastModified = unixTime;
    }

    return daItem;
  });
}
