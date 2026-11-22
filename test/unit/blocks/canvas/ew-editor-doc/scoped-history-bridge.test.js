/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { EditorState, EditorView } from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import { setNx } from '../../../../../scripts/utils.js';
import { DA_ORIGIN } from '../../../../../blocks/shared/constants.js';
import { invalidateDaRsDiscovery } from '../../../../../blocks/shared/da-rs-provider.js';
import { invalidateBranchingDiscovery } from '../../../../../blocks/shared/branch-selector/context.js';
import { getExtensionsBridge } from '../../../../../blocks/canvas/editor-utils/extensions-bridge.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
const { createEditorViewBridge } = await import('../../../../../blocks/canvas/ew-editor-doc/utils/editor-view-bridge.js');
const { createDaRsSnapshot } = await import('../../../../../blocks/canvas/ew-canvas-versions/da-rs-snapshot.js');
await import('../../../../../blocks/canvas/ew-editor-doc/ew-editor-doc.js');
await import('../../../../../blocks/canvas/ew-canvas-versions/ew-canvas-versions.js');

const context = { org: 'h6test', repo: 'work~draft', path: 'h6test/work~draft/page' };
const path = '/h6test/work~draft/page.html';
const sourceUrl = `${DA_ORIGIN}/h6test/sites/work~draft/source/page.html`;
const capabilities = {
  supported: true,
  apiVersion: 1,
  defaultBranchId: 'main',
  addressing: 'site-suffix',
  separator: '~',
  operations: ['create', 'changes', 'sync', 'publish', 'revert', 'restore'],
  itemKinds: ['html', 'json', 'media', 'config'],
  branchScopedSource: true,
  branchScopedCollaboration: true,
  helix6BranchSource: true,
};

describe('qualified H6 History editor bridge', () => {
  let savedUrl;
  let savedFetch;
  let host;
  let view;
  let panel;
  let calls;
  let activeHref;
  let releaseVersion;
  let versionStarted;
  let holdVersion;

  beforeEach(() => {
    savedUrl = window.location.href;
    savedFetch = window.fetch;
    const url = new URL(savedUrl);
    url.searchParams.set('da-source', 'da-rs');
    url.hash = '#/h6test/work~draft/page';
    window.history.replaceState(null, '', url);
    activeHref = window.location.href;
    invalidateDaRsDiscovery();
    invalidateBranchingDiscovery();
    calls = [];
    holdVersion = false;
    window.fetch = async (target, options = {}) => {
      calls.push({ target, options });
      if (target.endsWith('/ping/h6test/work')) {
        return new Response('', { headers: { 'x-api-upgrade-available': 'true' } });
      }
      if (target.endsWith('/capabilities')) return new Response(JSON.stringify(capabilities));
      if (target.endsWith('/branches/h6test/work/draft')) return new Response('{"id":"draft"}');
      if (options.method === 'HEAD') {
        return new Response(null, {
          headers: {
            'content-branch': 'draft',
            'x-da-source-mode': 'helix6',
            'x-da-actions': '/work/page.html=read,write',
            etag: '"draft-item:1"',
          },
        });
      }
      if (target.endsWith('/.versions/v1')) {
        if (holdVersion) {
          return new Promise((resolve) => {
            releaseVersion = resolve;
            versionStarted();
          });
        }
        return new Response('<body><header></header><main><div><p>Restored content</p></div></main><footer></footer></body>');
      }
      return new Response('', { status: 201 });
    };
  });

  afterEach(() => {
    panel?.remove();
    view?.destroy();
    host?.remove();
    getExtensionsBridge().view = null;
    window.fetch = savedFetch;
    window.history.replaceState(null, '', savedUrl);
    invalidateDaRsDiscovery();
    invalidateBranchingDiscovery();
  });

  function mountView(editable = true) {
    host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    const mount = document.createElement('div');
    root.append(mount);
    document.body.append(host);
    const current = () => window.location.href === activeHref;
    const plugin = createEditorViewBridge(context, sourceUrl, current);
    expect(plugin).to.exist;
    const schema = getSchema();
    const doc = schema.nodeFromJSON({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Current content' }] }] });
    const state = EditorState.create({ schema, doc, plugins: [plugin] });
    view = new EditorView(mount, {
      state,
      editable: () => editable,
      dispatchTransaction(tr) { view.updateState(view.state.apply(tr)); },
    });
    const session = { view, wsProvider: {} };
    host.getComparisonSession = ({ org, site, path: docPath }) => (
      org === 'h6test' && site === 'work~draft' && docPath === 'page.html' ? session : null
    );
    host.saveForComparison = async () => ({ ok: true });
    return session;
  }

  async function mountPanel() {
    panel = document.createElement('ew-canvas-versions');
    document.body.append(panel);
    panel.path = path;
    panel._versions = [];
    panel._refreshVersions = () => {};
    await panel.updateComplete;
  }

  it('registers the live qualified editor and creates/restores through scoped raw History', async () => {
    mountView();
    await mountPanel();
    expect(getExtensionsBridge().view).to.equal(view);
    expect(panel._canWrite).to.equal(true);
    expect(panel.shadowRoot.querySelector('button[aria-label="Create version"]')).to.exist;
    await panel.handleNewSubmit({ preventDefault() {}, target: { elements: { label: { value: 'saved' } } } });
    const snapshot = calls.find(({ target }) => target.includes('/.versions?'));
    expect(snapshot?.target).to.equal(`${sourceUrl}/.versions?operation=version&comment=saved`);
    expect(snapshot.options.headers['If-Match']).to.equal('"draft-item:1"');
    panel._restoreEntry = { versionId: 'v1' };
    await panel.handleRestoreConfirm();
    expect(view.state.doc.textContent).to.equal('Restored content');
    expect(calls.some(({ target }) => target === `${sourceUrl}/.versions/v1`)).to.equal(true);
    expect(calls.every(({ target }) => new URL(target).origin === DA_ORIGIN)).to.equal(true);
  });

  it('does not register unbound, legacy or mismatched branch documents', () => {
    expect(createEditorViewBridge(context, `${DA_ORIGIN}/source/h6test/work~draft/page.html`, () => true))
      .to.equal(null);
    expect(createEditorViewBridge(context, sourceUrl.replace('work~draft', 'work~other'), () => true))
      .to.equal(null);
    expect(createEditorViewBridge(context, sourceUrl.replace(DA_ORIGIN, 'https://other.example'), () => true))
      .to.equal(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('da-source');
    window.history.replaceState(null, '', url);
    expect(createEditorViewBridge(context, sourceUrl, () => true)).to.equal(null);
  });

  it('does not register a branch view for an unsafe document path', () => {
    const url = new URL(window.location.href);
    const invalid = { ...context, path: 'h6test/work~draft/../page' };
    url.hash = `#/${invalid.path}`;
    window.history.replaceState(null, '', url);
    const normalized = `${DA_ORIGIN}/h6test/sites/work~draft/page.html`;
    expect(createEditorViewBridge(invalid, normalized, () => true)).to.equal(null);
  });

  it('keeps the bound tool panel local without hosted extension discovery', async () => {
    const { getCanvasToolPanelViews } = await import('../../../../../blocks/canvas/ew-panel-extensions/helpers.js');
    const before = calls.length;
    const views = await getCanvasToolPanelViews({ org: 'h6test', site: 'work~draft' });
    expect(views.map(({ id }) => id)).to.deep.equal(['outline', 'metadata', 'files', 'versions']);
    expect(views.every(({ firstParty }) => firstParty)).to.equal(true);
    expect(calls).to.have.length(before);
  });

  it('clears a stale view immediately on navigation, without clearing a newer view on teardown', () => {
    mountView();
    const old = view;
    const url = new URL(window.location.href);
    url.hash = '#/h6test/work~other/page';
    window.history.replaceState(null, '', url);
    expect(getExtensionsBridge().view).to.equal(null);
    const next = { ...context, repo: 'work~other', path: 'h6test/work~other/page' };
    const plugin = createEditorViewBridge(next, sourceUrl.replace('work~draft', 'work~other'), () => true);
    const schema = getSchema();
    const state = EditorState.create({ schema, plugins: [plugin] });
    const newer = new EditorView(document.createElement('div'), { state });
    try {
      expect(getExtensionsBridge().view).to.equal(newer);
      old.destroy();
      view = null;
      expect(getExtensionsBridge().view).to.equal(newer);
    } finally { newer.destroy(); }
  });

  it('updates the Versions permission state when the scoped view becomes stale', async () => {
    mountView();
    await mountPanel();
    expect(panel._canWrite).to.equal(true);
    const url = new URL(window.location.href);
    url.hash = '#/h6test/work~other/page';
    window.history.replaceState(null, '', url);
    window.dispatchEvent(new Event('hashchange'));
    await panel.updateComplete;
    expect(getExtensionsBridge().view).to.equal(null);
    expect(panel._canWrite).to.equal(false);
  });

  it('does not restore into a read-only editor', async () => {
    mountView(false);
    await mountPanel();
    panel._restoreEntry = { versionId: 'v1' };
    await panel.handleRestoreConfirm();
    expect(view.state.doc.textContent).to.equal('Current content');
    expect(calls.some(({ target }) => target.includes('/.versions/v1'))).to.equal(false);
  });

  it('does not snapshot after a branch change during the durable flush', async () => {
    mountView();
    let release;
    let started;
    const waiting = new Promise((resolve) => { started = resolve; });
    host.saveForComparison = () => new Promise((resolve) => {
      release = resolve;
      started();
    });
    const pending = createDaRsSnapshot({
      path,
      label: 'saved',
      view,
      editor: host,
      isCurrent: () => window.location.href === activeHref && getExtensionsBridge().view === view,
    });
    await waiting;
    const url = new URL(window.location.href);
    url.hash = '#/h6test/work~other/page';
    window.history.replaceState(null, '', url);
    release({ ok: true });
    expect(await pending).to.equal(false);
    expect(getExtensionsBridge().view).to.equal(null);
    expect(calls.some(({ target, options }) => target.includes('/.versions') && options.method === 'POST'))
      .to.equal(false);
  });

  it('does not create a branch snapshot if HEAD no longer grants write', async () => {
    mountView();
    const fetcher = window.fetch;
    window.fetch = async (target, options = {}) => {
      if (options.method === 'HEAD') {
        calls.push({ target, options });
        return new Response(null, {
          headers: {
            'content-branch': 'draft',
            'x-da-source-mode': 'helix6',
            'x-da-actions': '/work/page.html=read',
            etag: '"draft-item:1"',
          },
        });
      }
      return fetcher(target, options);
    };
    const result = await createDaRsSnapshot({ path, label: 'saved', view, editor: host, isCurrent: () => getExtensionsBridge().view === view });
    expect(result).to.equal(false);
    expect(calls.some(({ target, options }) => target.includes('/.versions') && options.method === 'POST'))
      .to.equal(false);
  });

  it('discards a version response after navigating to another branch', async () => {
    mountView();
    await mountPanel();
    holdVersion = true;
    const waiting = new Promise((resolve) => { versionStarted = resolve; });
    panel._restoreEntry = { versionId: 'v1' };
    const pending = panel.handleRestoreConfirm();
    await waiting;
    const url = new URL(window.location.href);
    url.hash = '#/h6test/work~other/page';
    window.history.replaceState(null, '', url);
    releaseVersion(new Response('<body><main><div><p>Old branch</p></div></main></body>'));
    await pending;
    expect(getExtensionsBridge().view).to.equal(null);
    expect(view.state.doc.textContent).to.equal('Current content');
  });

  it('does not restore a response parsed for an obsolete editor schema', async () => {
    mountView();
    await mountPanel();
    holdVersion = true;
    const waiting = new Promise((resolve) => { versionStarted = resolve; });
    panel._restoreEntry = { versionId: 'v1' };
    const pending = panel.handleRestoreConfirm();
    await waiting;
    const schema = getSchema();
    expect(schema).not.to.equal(view.state.schema);
    const doc = schema.nodeFromJSON(view.state.doc.toJSON());
    view.updateState(EditorState.create({ schema, doc, plugins: view.state.plugins }));
    expect(getExtensionsBridge().view).to.equal(view);
    releaseVersion(new Response('<body><main><div><p>Old schema</p></div></main></body>'));
    await pending;
    expect(view.state.doc.textContent).to.equal('Current content');
  });

  it('registers the actual qualified Canvas Content editor view and releases it on removal', async () => {
    const NativeWebSocket = window.WebSocket;
    class InertWebSocket {
      constructor() { this.readyState = 0; }

      close() { this.readyState = 3; }

      send() {}

      addEventListener() {}

      removeEventListener() {}
    }
    InertWebSocket.CONNECTING = 0;
    InertWebSocket.OPEN = 1;
    window.WebSocket = InertWebSocket;
    const editor = document.createElement('ew-editor-doc');
    editor.session = { ok: true, sourceUrl, token: 'token', permissions: ['read', 'write'] };
    editor.ctx = context;
    document.body.append(editor);
    try {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        if (editor._proseContext?.view || editor._error) break;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => { setTimeout(resolve, 10); });
      }
      expect(editor._error).to.equal(undefined);
      expect(editor._proseContext?.view).to.exist;
      await editor.updateComplete;
      expect(getExtensionsBridge().view).to.equal(editor._proseContext.view);
      expect(getExtensionsBridge().view.editable).to.equal(true);
      await mountPanel();
      expect(panel._canWrite).to.equal(true);
      expect(panel.shadowRoot.querySelector('button[aria-label="Create version"]')).to.exist;
      editor.saveForComparison = async () => ({ ok: true });
      await panel.handleNewSubmit({ preventDefault() {}, target: { elements: { label: { value: 'actual' } } } });
      const snapshot = calls.find(({ target }) => target.includes('/.versions?'));
      expect(snapshot?.target).to.equal(`${sourceUrl}/.versions?operation=version&comment=actual`);
      expect(snapshot.options.headers['If-Match']).to.equal('"draft-item:1"');
      panel._restoreEntry = { versionId: 'v1' };
      await panel.handleRestoreConfirm();
      expect(editor._proseContext.view.state.doc.textContent).to.equal('Restored content');
      const { wsProvider, ydoc } = editor._proseContext;
      const next = new URL(window.location.href);
      next.hash = '#/h6test/work~other/page';
      window.history.replaceState(null, '', next);
      expect(getExtensionsBridge().view).to.equal(null);
      await panel.updateComplete;
      expect(panel._canWrite).to.equal(false);
      editor.remove();
      wsProvider.destroy();
      ydoc.destroy();
      expect(getExtensionsBridge().view).to.equal(null);
    } finally {
      editor.remove();
      window.WebSocket = NativeWebSocket;
    }
  });
});
