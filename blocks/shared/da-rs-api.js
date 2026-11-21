import { DA_ORIGIN, SUPPORTED_FILES, SUPPORTED_IMAGE_TYPES } from './constants.js';
import { daFetch } from './utils.js';
import { daRsSourceUrl, discoverDaRs, isDaRsBinding, isValidDaRsSegment, isStrongSourceETag } from './da-rs-provider.js';
import { branchUploadTarget } from './branch-selector/branch-media.js';

const denied = () => { throw new Error('This action is unavailable on the da-rs provider'); };
const deniedNamespace = new Proxy({}, { get: () => denied });

function argsFor(arg, extra = {}) {
  if (typeof arg !== 'string') return { ...arg, ...extra };
  const [, org, site, ...parts] = arg.split('/');
  return { org, site, path: parts.length ? `/${parts.join('/')}` : '', ...extra };
}

function validate(args) {
  const { org, site, path = '' } = args;
  if (!isValidDaRsSegment(org) || (site && !isValidDaRsSegment(site))
    || (path && (!path.startsWith('/') || /(?:^|\/)\.{1,2}(?:\/|$)|[?#\\]|%2f|%5c|%2e|%25/i.test(path)))) {
    throw new Error('Invalid da-rs path');
  }
  return args;
}

function normalizeListing(org, site, path, items) {
  const parent = `/${org}/${site}${(path || '').replace(/\/$/, '')}`;
  return items.map((item) => {
    if (!item['content-type']) return item;
    const filename = item.name.replace(/\/$/, '');
    const parts = filename.split('.');
    const result = { name: parts[0], path: `${parent}/${filename}`, contentType: item['content-type'] };
    if (parts.length > 1) result.ext = parts.pop();
    if (item['last-modified']) result.lastModified = new Date(item['last-modified']).getTime();
    return result;
  });
}

export async function getDaRsApi(basePromise) {
  const { hash, search } = window.location;
  const base = await basePromise;
  const current = () => isDaRsBinding()
    && window.location.hash === hash && window.location.search === search;
  const checkCurrent = () => { if (!current()) throw new Error('da-rs context changed'); };
  checkCurrent();
  const checkScope = (args) => {
    const parts = hash.startsWith('#/') ? hash.slice(2).split('/') : [];
    if (parts[0] && (parts[0] !== args.org || (args.site && parts[1] && parts[1] !== args.site))) {
      throw new Error('Operation must remain within the selected site');
    }
  };
  const request = async (url, opts = {}) => {
    checkCurrent();
    const target = new URL(url);
    if (target.origin !== DA_ORIGIN || target.username || target.password) {
      throw new Error('Invalid da-rs request origin');
    }
    const result = await daFetch(url, { ...opts, noRedirect: true, redirect: 'error' });
    checkCurrent();
    return result;
  };
  const bindingFor = async (args) => {
    checkCurrent();
    validate(args);
    checkScope(args);
    const binding = await discoverDaRs(args.org, args.site);
    checkCurrent();
    return binding;
  };
  const sourceRequest = async (arg, extra, opts = {}) => {
    const args = validate(argsFor(arg, extra));
    const binding = await bindingFor(args);
    return request(daRsSourceUrl(binding, args.path), opts);
  };
  const source = {
    get: (arg, extra) => sourceRequest(arg, extra),
    getMetadata: (arg, extra) => sourceRequest(arg, extra, { method: 'HEAD' }),
    list: async (arg, extra) => {
      const args = validate(argsFor(arg, extra));
      if (!args.site) {
        checkScope(args);
        const resp = await request(`${DA_ORIGIN}/list/${args.org}`);
        const items = resp.ok ? await resp.json() : [];
        return { ok: resp.ok, items, permissions: resp.permissions };
      }
      const binding = await bindingFor(args);
      const path = args.path || '';
      const url = binding.mode === 'helix6'
        ? daRsSourceUrl(binding, `${path.replace(/\/$/, '')}/`)
        : `${DA_ORIGIN}/list/${args.org}/${args.site}${path}`;
      const headers = args.continuationToken ? { 'da-continuation-token': args.continuationToken } : {};
      const resp = await request(url, { headers });
      const items = resp.ok ? await resp.json() : [];
      checkCurrent();
      return {
        ok: resp.ok,
        items: normalizeListing(args.org, args.site, path, items),
        permissions: resp.permissions,
        continuationToken: resp.headers.get('da-continuation-token'),
      };
    },
    save: async (arg, extra) => {
      const args = validate(argsFor(arg, extra));
      const binding = await bindingFor(args);
      const type = SUPPORTED_FILES[args.path?.split('.').pop()?.toLowerCase()]
        || 'application/octet-stream';
      let { body } = args;
      const opts = { method: 'POST' };
      if (binding.mode === 'helix6') opts.headers = { 'Content-Type': body?.type || type };
      else {
        const form = new FormData();
        form.append('data', body instanceof Blob ? body : new Blob([body], { type }));
        body = form;
      }
      opts.body = body;
      return request(daRsSourceUrl(binding, args.path), opts);
    },
    replace: async (arg, extra) => {
      const args = validate(argsFor(arg, extra));
      if (args.body === undefined || args.body === null) throw new Error('A Source update requires a body');
      const binding = await bindingFor(args);
      if (binding.mode !== 'helix6') return source.save(arg, extra);
      const type = SUPPORTED_FILES[args.path?.split('.').pop()?.toLowerCase()]
        || 'application/octet-stream';
      const headers = { 'Content-Type': args.body?.type || type };
      if (args.ifMatch !== undefined) {
        if (!isStrongSourceETag(args.ifMatch)) throw new Error('An exact strong ETag is required');
        headers['If-Match'] = args.ifMatch;
      }
      return request(daRsSourceUrl(binding, args.path), { method: 'PUT', headers, body: args.body });
    },
    uploadMedia: async (arg, extra) => {
      const args = validate(argsFor(arg, extra));
      if (!SUPPORTED_IMAGE_TYPES.includes(args.body?.type)) throw new Error('Unsupported media type');
      const binding = await bindingFor(args);
      const target = branchUploadTarget(args.path, args.body);
      const hashParts = hash.startsWith('#/') ? hash.slice(2).split('/') : [];
      const directory = hashParts.slice(2, -1).join('/');
      const page = hashParts.at(-1)?.replace(/\.html$/i, '');
      const documentPath = `/${directory}${directory ? '/' : ''}.${page}`;
      if (hashParts[0] !== args.org || hashParts[1] !== args.site
        || target.parent !== documentPath) {
        throw new Error('Media upload must remain in the current document');
      }
      const url = daRsSourceUrl(binding, target.path);
      const opts = { method: 'POST', headers: {} };
      if (binding.mode === 'helix6') {
        opts.headers['Content-Type'] = args.body.type;
        opts.body = args.body;
      } else {
        opts.headers['If-None-Match'] = '*';
        opts.body = new FormData();
        opts.body.append('data', args.body);
      }
      const result = await request(url, opts);
      if (!result.ok) return result;
      if (result.redirected || (result.url && result.url !== url)) throw new Error('Invalid media response');
      const response = new Response(JSON.stringify({ source: { contentUrl: `./${target.filename}` } }), { status: result.status, headers: { 'Content-Type': 'application/json' } });
      response.permissions = result.permissions;
      return response;
    },
    createFolder: async (arg, extra) => {
      const args = validate(argsFor(arg, extra));
      const binding = await bindingFor(args);
      return request(daRsSourceUrl(binding, `${(args.path || '').replace(/\/$/, '')}/`), { method: 'POST' });
    },
    delete: (arg, extra) => sourceRequest(arg, extra, { method: 'DELETE' }),
    deleteFolder: async (arg, extra) => {
      const args = validate(argsFor(arg, extra));
      const binding = await bindingFor(args);
      if (binding.mode === 'helix6') return denied();
      return request(daRsSourceUrl(binding, `${args.path.replace(/\/$/, '')}/`), { method: 'DELETE' });
    },
    move: async (arg, extra) => {
      const args = validate(argsFor(arg, extra));
      const binding = await bindingFor(args);
      if (binding.mode === 'helix6') return denied();
      if (!args.destination?.startsWith(`/${args.org}/${args.site}/`)) return denied();
      const form = new FormData();
      form.append('destination', args.destination);
      if (args.continuationToken) form.append('continuation-token', args.continuationToken);
      return request(`${DA_ORIGIN}/move/${args.org}/${args.site}${args.path}`, { method: 'POST', body: form });
    },
    copy: async (arg, extra) => {
      const args = validate(argsFor(arg, extra));
      const binding = await bindingFor(args);
      const prefix = `/${args.org}/${args.site}`;
      if (typeof args.destination !== 'string' || !args.destination.startsWith(`${prefix}/`)) {
        throw new Error('Copy must remain within the selected site');
      }
      if (binding.mode !== 'helix6') {
        const form = new FormData();
        form.append('destination', args.destination);
        return request(`${DA_ORIGIN}/copy/${args.org}/${args.site}${args.path}`, { method: 'POST', body: form });
      }
      const destination = args.destination.slice(prefix.length);
      validate({ ...args, path: destination });
      const url = new URL(daRsSourceUrl(binding, destination));
      url.searchParams.set('source', args.path);
      if (args.collision) url.searchParams.set('collision', args.collision);
      return request(url.href, { method: 'PUT' });
    },
  };
  const config = {
    get: (arg, extra) => {
      const args = validate(argsFor(arg, extra));
      checkScope(args);
      return request(`${DA_ORIGIN}/config/${args.org}/${args.site ? `${args.site}/` : ''}`);
    },
    save: (arg, extra) => {
      const args = validate(argsFor(arg, extra));
      checkScope(args);
      return request(`${DA_ORIGIN}/config/${args.org}/${args.site ? `${args.site}/` : ''}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: args.body });
    },
    delete: denied,
    getAggregated: denied,
  };
  const versions = {
    history: async (arg, extra) => {
      const args = validate(argsFor(arg, extra));
      const binding = await bindingFor(args);
      if (binding.mode !== 'helix6') return null;
      return request(`${daRsSourceUrl(binding, args.path)}/.history`);
    },
    list: async (arg, extra) => {
      const args = validate(argsFor(arg, extra));
      const binding = await bindingFor(args);
      return request(binding.mode === 'helix6' ? `${daRsSourceUrl(binding, args.path)}/.versions`
        : `${DA_ORIGIN}/versionlist/${args.org}/${args.site}${args.path}`);
    },
    get: async (arg, extra) => {
      const args = validate(argsFor(arg, extra));
      const binding = await bindingFor(args);
      if (!args.versionId || /[?#\\]|(?:^|\/)\.{1,2}(?:\/|$)|%2f|%5c|%25/i.test(args.versionId)) throw new Error('Invalid version');
      if (binding.mode === 'helix6'
        && (typeof args.versionId !== 'string' || args.versionId.length > 128
          || /[^a-zA-Z0-9._-]/.test(args.versionId)
          || args.versionId === '.' || args.versionId === '..')) throw new Error('Invalid version');
      return request(binding.mode === 'helix6' ? `${daRsSourceUrl(binding, args.path)}/.versions/${args.versionId}`
        : `${DA_ORIGIN}/versionsource/${args.org}/${args.site}/${args.versionId}`);
    },
    create: async (arg, extra) => {
      const args = validate(argsFor(arg, extra));
      const binding = await bindingFor(args);
      if (binding.mode === 'helix6') {
        const url = new URL(`${daRsSourceUrl(binding, args.path)}/.versions`);
        if (args.operation) url.searchParams.set('operation', args.operation);
        if (args.comment) url.searchParams.set('comment', args.comment);
        const headers = {};
        if (args.ifMatch !== undefined) {
          if (!isStrongSourceETag(args.ifMatch)) {
            throw new Error('A version requires an exact strong ETag');
          }
          headers['If-Match'] = args.ifMatch;
        }
        return request(url.href, { method: 'POST', headers });
      }
      return request(`${DA_ORIGIN}/versionsource/${args.org}/${args.site}${args.path}`, { method: 'POST', body: JSON.stringify({ label: args.comment }) });
    },
  };
  return {
    ...base,
    source,
    config,
    versions,
    isHlx6: async (org, site) => (await bindingFor({ org, site })).mode === 'helix6',
    aem: deniedNamespace,
    status: deniedNamespace,
    snapshot: deniedNamespace,
    jobs: deniedNamespace,
    org: deniedNamespace,
    signout: denied,
    daFetch: ({ url, opts }) => {
      if (new URL(url).origin !== DA_ORIGIN) return denied();
      return request(url, opts);
    },
  };
}
