import { DA_ORIGIN } from '../constants.js';
import { daFetch } from '../utils.js';
import { branchContext, validateBranch } from './context.js';
import { isDaRsBinding } from '../da-rs-provider.js';
import {
  branchUploadTarget,
  branchUploadMatchesDocument,
  validBranchSourceResponse,
  validBranchUploadResponse,
} from './branch-media.js';

function argsFor(arg, extra = {}) {
  if (typeof arg !== 'string') return { ...arg, ...extra };
  const [, org, site, ...parts] = arg.split('/');
  return { org, site, path: parts.length ? `/${parts.join('/')}` : '', ...extra };
}

function scoped(context, arg, extra) {
  const args = argsFor(arg, extra);
  if (args.org !== context.org || args.site !== context.siteSegment
    || (args.path && (!args.path.startsWith('/') || /(?:^|\/)\.{1,2}(?:\/|$)/.test(args.path)
      || /[?#\\]|%2f|%5c|%2e|%25/i.test(args.path)))) {
    throw new Error('Operation must remain within the selected branch');
  }
  return args;
}

const denied = () => { throw new Error('This action is unavailable on a content branch'); };
const deniedNamespace = new Proxy({}, { get: () => denied });
const isMediaPath = (path) => /\.(?:avif|gif|ico|jpe?g|mp4|pdf|png|svg|webp)$/i.test(path || '');

export function createBranchSource(context, fetcher = daFetch, settings = {}) {
  const { isCurrent = () => true, documentHash } = settings;
  const request = (operation, args, options = {}) => fetcher(
    `${DA_ORIGIN}/${operation}/${context.org}/${context.siteSegment}${args.path || ''}`,
    { ...options, noRedirect: true, redirect: 'error' },
  );
  const bodyForm = (body, path) => {
    const form = new FormData();
    const type = path?.endsWith('.json') ? 'application/json' : 'text/html';
    const data = body instanceof Blob ? body : new Blob([body], { type });
    form.append('data', data);
    return form;
  };
  const checkMediaBranch = (response, args) => {
    if (!isCurrent()) return new Response('Branch context changed', { status: 409 });
    const url = new URL(`${DA_ORIGIN}/source/${context.org}/${context.siteSegment}${args.path}`).href;
    if (response.ok && (response.headers?.get('content-branch') !== context.branch
      || response.redirected || (response.url && response.url !== url))) {
      return new Response('Media response did not match the requested branch Source', { status: 422 });
    }
    return response;
  };
  const transfer = (operation) => (arg, extra) => {
    const args = scoped(context, arg, extra);
    scoped(context, args.destination);
    const body = new FormData();
    body.append('destination', args.destination);
    if (args.continuationToken) body.append('continuation-token', args.continuationToken);
    return request(operation, args, { method: 'POST', body });
  };
  return {
    get: (arg, extra) => {
      const args = scoped(context, arg, extra);
      if (isMediaPath(args.path) && !isCurrent()) {
        return Promise.resolve(new Response('Branch context changed', { status: 409 }));
      }
      const response = request('source', args);
      if (!isMediaPath(args.path)) return response;
      return Promise.resolve(response).then((result) => checkMediaBranch(result, args));
    },
    getMetadata: (arg, extra) => request('source', scoped(context, arg, extra), { method: 'HEAD' }),
    list: async (arg, extra) => {
      const args = scoped(context, arg, extra);
      const headers = args.continuationToken ? { 'da-continuation-token': args.continuationToken } : {};
      const response = await request('list', args, { headers });
      const items = response.ok ? await response.json() : [];
      return {
        ok: response.ok,
        items,
        permissions: response.permissions,
        continuationToken: response.headers?.get('da-continuation-token') || null,
      };
    },
    save: async (arg, extra) => {
      const args = scoped(context, arg, extra);
      if (isMediaPath(args.path) && !isCurrent()) {
        return new Response('Branch context changed', { status: 409 });
      }
      const response = await request('source', args, { method: 'POST', body: bodyForm(args.body, args.path) });
      if (!isMediaPath(args.path)) return response;
      const checked = checkMediaBranch(response, args);
      if (!checked.ok) return checked;
      let payload;
      try { payload = await response.clone().json(); } catch {
        // Invalid responses fail closed.
      }
      if (!isCurrent()) return new Response('Branch context changed', { status: 409 });
      const expected = new URL(`${DA_ORIGIN}/source/${context.org}/${context.siteSegment}${args.path}`).pathname;
      if (!validBranchSourceResponse(payload, expected)) {
        return new Response('Branch media upload returned an invalid Source URL', { status: 422 });
      }
      return response;
    },
    uploadMedia: async (arg, extra) => {
      const input = argsFor(arg, extra);
      const target = branchUploadTarget(input.path, input.body);
      scoped(context, { ...input, path: target.parent });
      if (documentHash && !branchUploadMatchesDocument(target.parent, context, documentHash)) {
        throw new Error('Media upload must remain in the current document');
      }
      if (!isCurrent()) return new Response('Branch context changed', { status: 409 });
      const args = { ...input, path: target.path };
      const options = { method: 'POST', headers: { 'If-None-Match': '*' }, body: bodyForm(args.body, args.path) };
      const response = await request('source', args, options);
      const checked = checkMediaBranch(response, args);
      if (!checked.ok) return checked;
      let payload;
      try { payload = await response.clone().json(); } catch {
        // Treat unrecognized replies as unsafe.
      }
      if (!isCurrent()) return new Response('Branch context changed', { status: 409 });
      const expected = new URL(`${DA_ORIGIN}/source/${context.org}/${context.siteSegment}${target.path}`).pathname;
      if (!validBranchUploadResponse(payload, expected, target.filename)) {
        return new Response('Branch upload returned an unscoped media URL', { status: 422 });
      }
      return response;
    },
    createFolder: (arg, extra) => {
      const args = scoped(context, arg, extra);
      return request('source', { ...args, path: `${args.path.replace(/\/$/, '')}/` }, { method: 'POST' });
    },
    delete: (arg, extra) => request('source', scoped(context, arg, extra), { method: 'DELETE' }),
    deleteFolder: denied,
    copy: transfer('copy'),
    move: transfer('move'),
  };
}

export async function getBranchApi(baseApiPromise, expectedHref = window.location.href) {
  const { hash, href } = window.location;
  if (href !== expectedHref) throw new Error('Branch context changed');
  const context = branchContext(hash);
  if (!context) return baseApiPromise;
  const validated = await validateBranch(context);
  // Capture and check the URL after every asynchronous validation.
  const currentContext = branchContext();
  if (window.location.href !== href
    || currentContext?.siteSegment !== context.siteSegment || currentContext?.org !== context.org) {
    throw new Error('Branch context changed');
  }
  if (validated.binding?.mode === 'helix6') {
    const { getDaRsApi } = await import('../da-rs-api.js');
    validated.assertCurrent();
    if (window.location.href !== href) throw new Error('Branch context changed');
    const { binding, assertCurrent } = validated;
    const options = { context, binding, href, assertCurrent };
    return getDaRsApi(baseApiPromise, options);
  }
  const api = await baseApiPromise;
  validated.assertCurrent();
  if (window.location.href !== href) throw new Error('Branch context changed');
  const guardedFetch = async (...args) => {
    validated.assertCurrent();
    const current = branchContext();
    if (window.location.href !== href
      || current?.org !== context.org || current?.siteSegment !== context.siteSegment) {
      throw new Error('Branch context changed');
    }
    const result = await daFetch(...args);
    validated.assertCurrent();
    if (window.location.href !== href) throw new Error('Branch context changed');
    return result;
  };
  const sourceOptions = { isCurrent: () => window.location.href === href, documentHash: hash };
  const source = createBranchSource(context, guardedFetch, sourceOptions);
  const config = {
    get: (arg, extra) => {
      const args = argsFor(arg, extra);
      if (args.org === context.org && !args.site) {
        if (isDaRsBinding()) {
          return guardedFetch(`${DA_ORIGIN}/config/${context.org}/`, { noRedirect: true, redirect: 'error' });
        }
        return api.config.get(args);
      }
      scoped(context, { ...args, path: '' });
      const url = `${DA_ORIGIN}/config/${context.org}/${context.siteSegment}/`;
      return guardedFetch(url, { noRedirect: true });
    },
    save: (arg, extra) => {
      const args = scoped(context, arg, extra);
      const url = `${DA_ORIGIN}/config/${context.org}/${context.siteSegment}/`;
      const options = { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: args.body, noRedirect: true };
      return guardedFetch(url, options);
    },
    delete: denied,
    getAggregated: denied,
  };
  const versions = {
    list: (arg, extra) => {
      const args = scoped(context, arg, extra);
      return guardedFetch(`${DA_ORIGIN}/versionlist/${args.org}/${args.site}${args.path}`);
    },
    get: (arg, extra) => {
      const args = scoped(context, arg, extra);
      if (typeof args.versionId !== 'string' || /(?:^|\/)\.{1,2}(?:\/|$)/.test(args.versionId)) {
        throw new Error('Invalid version');
      }
      return guardedFetch(`${DA_ORIGIN}/versionsource/${args.org}/${args.site}/${args.versionId}`);
    },
    create: (arg, extra) => {
      const args = scoped(context, arg, extra);
      const url = `${DA_ORIGIN}/versionsource/${args.org}/${args.site}${args.path}`;
      return guardedFetch(url, { method: 'POST', body: JSON.stringify({ label: args.comment }) });
    },
  };
  return {
    ...api,
    source,
    config,
    versions,
    isHlx6: async () => false,
    aem: deniedNamespace,
    status: deniedNamespace,
    snapshot: deniedNamespace,
    jobs: deniedNamespace,
  };
}
