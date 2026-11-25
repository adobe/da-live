import { Y, WebsocketProvider } from 'da-y-wrapper';
import { aem2doc, doc2aem } from 'da-parser';
import { DA_ORIGIN } from './constants.js';
import { daFetch } from './utils.js';
import { daRsSourceUrl, discoverDaRs, isStrongSourceETag } from './da-rs-provider.js';
import { parseSiteSegment } from './content-branch-context.js';
import { validateBranch } from './branch-selector/context.js';
import { getDaRsDemoState } from './da-rs-bootstrap.js';

const SAVE_DELAY = 1200;

// Resolve both DA and H6 aliases to the selected site's real Source transport.
async function sourceTarget(path) {
  const url = new URL(path);
  if (url.origin !== DA_ORIGIN || url.username || url.password || url.search || url.hash) {
    throw new Error('Invalid single-author Source URL');
  }
  const parts = url.pathname.split('/');
  let org;
  let siteSegment;
  let doc;
  if (parts[1] === 'source') {
    [, , org, siteSegment, ...doc] = parts;
  } else if (parts[2] === 'sites' && parts[4] === 'source') {
    [, org, , siteSegment, , ...doc] = parts;
  } else throw new Error('Invalid single-author Source path');
  if (!org || org !== getDaRsDemoState().config?.org || !siteSegment || !doc.length
    || doc.some((part) => !part || part === '.' || part === '..')
    || /%2f|%5c|%2e|%25/i.test(url.pathname)) {
    throw new Error('Invalid single-author document');
  }
  const active = window.location.hash.startsWith('#/') ? window.location.hash.slice(2) : '';
  if (active.replace(/\.html$/i, '') !== `${org}/${siteSegment}/${doc.join('/')}`.replace(/\.html$/i, '')) {
    throw new Error('The editor context changed.');
  }
  const parsed = parseSiteSegment(siteSegment);
  const binding = parsed.branch
    ? (await validateBranch({ org, ...parsed, siteSegment })).binding
    : await discoverDaRs(org, parsed.site);
  if (binding?.mode !== 'helix6') throw new Error('Single-author mode requires Helix 6 Source');
  return {
    url: daRsSourceUrl({ ...binding, branch: parsed.branch }, `/${doc.join('/')}`),
    branch: parsed.branch,
  };
}

function showSaveError(message) {
  let alert = document.getElementById('da-single-author-save-error');
  if (!message) {
    alert?.remove();
    return;
  }
  if (!alert) {
    alert = document.createElement('div');
    alert.id = 'da-single-author-save-error';
    alert.setAttribute('role', 'alert');
    Object.assign(alert.style, {
      position: 'fixed',
      bottom: '1rem',
      right: '1rem',
      zIndex: '2147483647',
      background: '#9b1c1c',
      color: '#fff',
      padding: '1rem',
      maxWidth: '32rem',
    });
    document.body.append(alert);
  }
  alert.textContent = message;
}

/** A serial, conditional save queue. Edits remain dirty after any failure. */
export function createSaveQueue({
  ydoc, target, etag, current, fetchSource = daFetch, serialize = doc2aem,
  report = showSaveError, unloadTarget = window,
}) {
  let baseline = current;
  let validator = etag;
  let timer;
  let pending;
  let stopped = false;
  let conflict = false;
  let writable = false;
  const { href } = window.location;
  const dirty = () => serialize(ydoc) !== baseline;
  const beforeUnload = (event) => {
    if (dirty()) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  unloadTarget.addEventListener('beforeunload', beforeUnload);

  async function save() {
    clearTimeout(timer);
    if (pending) return pending.then((result) => (result.ok && dirty() ? save() : result));
    if (stopped) return { ok: false, error: 'The editor session is closed.' };
    if (conflict) return { ok: false, error: 'The document changed elsewhere. Copy your edits before reloading.' };
    if (!dirty()) return { ok: true };
    if (!writable) return { ok: false, error: 'This document is read-only.' };
    const body = serialize(ydoc);
    pending = (async () => {
      try {
        if (window.location.href !== href) throw new Error('The editor context changed. Copy your edits.');
        const response = await fetchSource(target.url, {
          method: 'PUT',
          headers: { 'Content-Type': 'text/html', 'If-Match': validator },
          body,
          noRedirect: true,
          redirect: 'error',
        });
        if (!response.ok) {
          if ([404, 409, 410, 412].includes(response.status)) conflict = true;
          throw new Error(`Save failed (${response.status}). Copy your edits before reloading.`);
        }
        const next = response.headers.get('etag');
        if (!isStrongSourceETag(next)) {
          conflict = true;
          throw new Error('Save could not be verified. Copy your edits before reloading.');
        }
        if (target.branch && (response.headers.get('content-branch') !== target.branch
          || response.headers.get('x-da-branch-instance') !== target.instance)) {
          conflict = true;
          throw new Error('The branch changed. Copy your edits before reloading.');
        }
        validator = next;
        baseline = body;
        report(null);
        return { ok: true };
      } catch (error) {
        report(error.message);
        return { ok: false, error: error.message };
      }
    })();
    let result;
    try {
      result = await pending;
    } finally {
      pending = null;
    }
    if (result.ok && dirty()) return save();
    return result;
  }
  const update = () => {
    clearTimeout(timer);
    if (writable && !stopped && !conflict && dirty()) timer = setTimeout(save, SAVE_DELAY);
  };
  ydoc.on('update', update);
  return {
    save,
    setWritable(value) { writable = value === true; },
    disconnect() {
      stopped = true;
      clearTimeout(timer);
      ydoc.off('update', update);
      if (dirty()) report('Unsaved edits remain. Copy your edits before leaving this page.');
      else unloadTarget.removeEventListener('beforeunload', beforeUnload);
    },
  };
}

/** A local Yjs provider: no WebSocket or cross-tab broadcast is ever opened. */
export async function createSingleAuthorConnection(path, { ydoc = new Y.Doc() } = {}) {
  const { href } = window.location;
  const target = await sourceTarget(path);
  const response = await daFetch(target.url, { noRedirect: true, redirect: 'error', cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to load document (${response.status}).`);
  const etag = response.headers.get('etag');
  target.instance = response.headers.get('x-da-branch-instance');
  if (response.headers.get('x-da-content-profile') !== 'native-da'
    || !isStrongSourceETag(etag)
    || (target.branch && (response.headers.get('content-branch') !== target.branch
      || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(target.instance || '')))) {
    throw new Error('Unable to verify the Source document.');
  }
  const body = await response.text();
  if (window.location.href !== href) throw new Error('The editor context changed.');
  aem2doc(body, ydoc);
  const queue = createSaveQueue({ ydoc, target, etag, current: doc2aem(ydoc) });
  const provider = new WebsocketProvider('ws://localhost', target.url, ydoc, { connect: false, disableBc: true });
  provider.singleAuthor = queue;
  provider.synced = true;
  // Existing editor focus handlers must not open a collaboration transport.
  provider.connect = () => {};
  const disconnect = provider.disconnect.bind(provider);
  provider.disconnect = (...args) => {
    queue.disconnect();
    return disconnect(...args);
  };
  return { wsProvider: provider, ydoc };
}
