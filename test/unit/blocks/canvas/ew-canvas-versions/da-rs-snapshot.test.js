/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { createDaRsSnapshot } from '../../../../../blocks/canvas/ew-canvas-versions/da-rs-snapshot.js';
import { setNx } from '../../../../../scripts/utils.js';
import { DA_ORIGIN } from '../../../../../blocks/shared/constants.js';
import { invalidateDaRsDiscovery } from '../../../../../blocks/shared/da-rs-provider.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
await import('../../../../../blocks/canvas/ew-canvas-versions/ew-canvas-versions.js');
const { getExtensionsBridge } = await import('../../../../../blocks/canvas/editor-utils/extensions-bridge.js');

describe('bound History snapshot', () => {
  let calls;
  let view;
  let editor;
  let session;
  let api;
  let active;
  const path = '/demo/work/page.html';

  beforeEach(() => {
    calls = [];
    active = true;
    view = { editable: true, state: { doc: {} } };
    session = { view, wsProvider: {} };
    editor = {
      getComparisonSession: () => session,
      saveForComparison: async () => {
        calls.push('flush');
        return { ok: true };
      },
    };
    api = {
      isHlx6: async () => {
        calls.push('mode');
        return true;
      },
      source: {
        getMetadata: async () => {
          calls.push('head');
          const response = new Response('', { headers: { ETag: '"r1"' } });
          response.permissions = ['read', 'write'];
          return response;
        },
      },
      versions: {
        create: async (target, options) => {
          calls.push({ target, options });
          return new Response('', { status: 201 });
        },
      },
    };
  });

  const run = (options = {}) => createDaRsSnapshot({
    path, label: 'first', view, editor, isCurrent: () => active, getApi: async () => api, ...options,
  });

  it('flushes before HEAD and snapshots with the exact returned ETag', async () => {
    expect(await run()).to.equal(true);
    expect(calls).to.deep.equal([
      'flush', 'mode', 'head', { target: path, options: { comment: 'first', operation: 'version', ifMatch: '"r1"' } },
    ]);
  });

  it('does not snapshot after a failed flush', async () => {
    editor.saveForComparison = async () => {
      calls.push('flush');
      return { ok: false };
    };
    expect(await run()).to.equal(false);
    expect(calls).to.deep.equal(['flush']);
  });

  it('does not snapshot after navigation or a new edit during the flush', async () => {
    editor.saveForComparison = async () => {
      calls.push('flush');
      active = false;
      return { ok: true };
    };
    expect(await run()).to.equal(false);
    expect(calls).to.deep.equal(['flush']);
    active = true;
    editor.saveForComparison = async () => {
      calls.push('edit');
      view.state.doc = {};
      return { ok: true };
    };
    expect(await run()).to.equal(false);
    expect(calls).to.deep.equal(['flush', 'edit']);
  });

  it('rejects weak or missing validators and a lost write grant', async () => {
    const makeHead = (etag, permissions) => async () => {
      calls.push('head');
      const response = new Response('', { headers: etag ? { ETag: etag } : {} });
      response.permissions = permissions;
      return response;
    };
    for (const [etag, permissions] of [['W/"r1"', ['write']], [null, ['write']], ['"r1"', ['read']]]) {
      api.source.getMetadata = makeHead(etag, permissions);
      expect(await run()).to.equal(false);
    }
    expect(calls.filter((item) => typeof item === 'object')).to.have.length(0);
  });

  it('does not report success when the version precondition fails', async () => {
    api.versions.create = async () => new Response('', { status: 412 });
    expect(await run()).to.equal(false);
  });

  it('flushes bound legacy documents without sending an unsupported precondition', async () => {
    api.isHlx6 = async () => false;
    expect(await run()).to.equal(true);
    expect(calls).to.deep.equal(['flush', { target: path, options: { comment: 'first' } }]);
  });
});

describe('bound History snapshot UI', () => {
  it('flushes the active editor and sends the HEAD ETag to the real adapter', async () => {
    const savedUrl = window.location.href;
    const savedFetch = window.fetch;
    const bridge = getExtensionsBridge();
    const savedView = bridge.view;
    const calls = [];
    const url = new URL(savedUrl);
    url.searchParams.set('da-source', 'da-rs');
    url.hash = '#/demo/work/page';
    window.history.replaceState(null, '', url);
    invalidateDaRsDiscovery();
    const view = { editable: true, state: { doc: {} } };
    const session = { view, wsProvider: {} };
    const editor = {
      getComparisonSession: () => session,
      saveForComparison: async () => {
        calls.push('flush');
        return { ok: true };
      },
    };
    view.dom = { getRootNode: () => ({ host: editor }) };
    bridge.view = view;
    window.fetch = async (target, options) => {
      calls.push({ target, options });
      if (target.includes('/ping/')) return new Response('', { headers: { 'x-api-upgrade-available': 'true' } });
      if (options.method === 'HEAD') {
        return new Response(null, { headers: { ETag: '"r1"', 'x-da-actions': '/work/page.html=read,write' } });
      }
      return new Response('', { status: 201 });
    };
    const panel = document.createElement('ew-canvas-versions');
    Object.defineProperty(panel, 'isConnected', { value: true });
    panel.path = '/demo/work/page.html';
    panel._refreshVersions = () => {};
    try {
      await panel.handleNewSubmit({ preventDefault() {}, target: { elements: { label: { value: 'first' } } } });
      expect(calls[0]).to.equal('flush');
      expect(calls[2].options.method).to.equal('HEAD');
      expect(calls[2].target).to.equal(`${DA_ORIGIN}/demo/sites/work/source/page.html`);
      expect(calls[3].target)
        .to.equal(`${DA_ORIGIN}/demo/sites/work/source/page.html/.versions?operation=version&comment=first`);
      expect(calls[3].options.headers['If-Match']).to.equal('"r1"');
    } finally {
      bridge.view = savedView;
      window.fetch = savedFetch;
      window.history.replaceState(null, '', savedUrl);
      invalidateDaRsDiscovery();
    }
  });
});
