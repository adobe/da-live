import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { doc2aem, aem2doc, getSchema, yDocToProsemirror } from 'da-parser';
import { Y, yUndo, yRedo } from 'da-y-wrapper';
import { setNx } from '../../../../../scripts/utils.js';
import { OFFLINE_MODE } from '../../../../../blocks/shared/constants.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { loadLocalDocument } = await import('../../../../../blocks/canvas/ew-editor-doc/utils/local-document.js');
const { default: initProse } = await import('../../../../../blocks/canvas/ew-editor-doc/prose.js');
await import('../../../../../blocks/canvas/ew-editor-doc/ew-editor-doc.js');
await import('../../../../../blocks/canvas/ew-selection-toolbar/ew-selection-toolbar.js');

const SOURCE_HTML = `<body><header></header><main>
  <div data-section-name="Intro"><h2>Title</h2><p>Hello <strong>world</strong></p>
    <div class="cards"><div><div><p>Card content</p></div></div></div>
  </div><div data-section-name="Next"><p>Second section</p></div>
</main><footer></footer>
<div class="da-metadata"><div><div>custom-property</div><div>Preserved</div></div></div>
</body>`;

describe('canvas explicitly configured offline editor', () => {
  let el;
  let fetchStub;
  let websocket;
  let writes;
  let sourceStatus;
  let saveStatus;
  let readPermissions;

  beforeEach(() => {
    writes = [];
    sourceStatus = 200;
    saveStatus = 200;
    readPermissions = ['read', 'write'];
    websocket = sinon.stub(window, 'WebSocket').callsFake(function FakeWebSocket() {
      this.readyState = 0;
      this.close = () => {};
      this.send = () => {};
    });
    sinon.stub(customElements.get('ew-selection-toolbar').prototype, '_checkAemAssets').resolves();
    fetchStub = sinon.stub(window, 'fetch').callsFake(async (url, opts = {}) => {
      if (opts.method === 'POST') {
        const body = opts.body instanceof FormData
          ? await opts.body.get('data').text()
          : opts.body;
        writes.push({ url: String(url), body });
        return new Response('', { status: saveStatus });
      }
      if (String(url).includes('/ping/')) return new Response('', { status: 200 });
      return new Response(SOURCE_HTML, {
        status: sourceStatus,
        headers: { 'x-da-actions': readPermissions.join(',') },
      });
    });
    el = document.createElement('ew-editor-doc');
    el.offline = true;
    el.ctx = { org: 'localorg', repo: 'localsite', path: 'localorg/localsite/page' };
    el.session = {
      ok: true,
      sourceUrl: 'https://admin.da.live/source/localorg/localsite/page.html',
      permissions: ['read', 'write'],
      token: 'test-token',
      docId: null,
    };
  });

  afterEach(async () => {
    saveStatus = 200;
    if (el.hasPendingSave) await el.forceSave();
    el.remove();
    el._teardown();
    sinon.restore();
  });

  it('keeps the shared default connected', () => {
    expect(OFFLINE_MODE).to.be.false;
    expect(document.createElement('ew-editor-doc').offline).to.equal(OFFLINE_MODE);
  });

  it('loads content and metadata locally without a socket, broadcast, or initial write', async () => {
    await el._loadEditor();
    const { view, ydoc, wsProvider } = el._proseContext;
    expect(websocket.called).to.be.false;
    expect(wsProvider.shouldConnect).to.be.false;
    expect(wsProvider.bcconnected).to.be.false;
    expect(view.state.doc.textContent).to.include('Hello world').and.include('Card content');
    expect(ydoc.getMap('daMetadata').get('custom-property')).to.equal('Preserved');
    expect(view.dom.dataset.sectionName).to.equal('Intro');
    expect(doc2aem(ydoc)).to.include('data-section-name="Next"');
    expect(await el.forceSave()).to.deep.equal({ ok: true });
    expect(writes).to.have.length(0);
  });

  it('persists a schema round trip including metadata, blocks and sections', async () => {
    await el._loadEditor();
    const { view, ydoc } = el._proseContext;
    view.dispatch(view.state.tr.insertText('Edited ', 1));
    ydoc.getMap('daMetadata').set('custom-property', 'Changed');
    expect(el.hasPendingSave).to.be.true;
    expect(await el.forceSave()).to.deep.equal({ ok: true });
    expect(writes).to.have.length(1);
    expect(writes[0].url).to.equal(el.session.sourceUrl);
    expect(writes[0].body).to.include('Edited Title').and.include('class="cards"');
    expect(writes[0].body).to.include('data-section-name="Intro"');
    expect(writes[0].body).to.include('data-section-name="Next"').and.include('Changed');
    expect(writes[0].body).not.to.include('ProseMirror');
    const savedDoc = new Y.Doc();
    try {
      aem2doc(writes[0].body, savedDoc);
      expect(yDocToProsemirror(getSchema(), savedDoc).toJSON())
        .to.deep.equal(view.state.doc.toJSON());
    } finally {
      savedDoc.destroy();
    }
    expect(el.hasPendingSave).to.be.false;
    expect(websocket.called).to.be.false;
  });

  it('keeps local undo and redo without undoing the initial source load', async () => {
    await el._loadEditor();
    const { view } = el._proseContext;
    const initialDoc = view.state.doc.toJSON();
    yUndo(view.state);
    expect(view.state.doc.toJSON()).to.deep.equal(initialDoc);
    view.dispatch(view.state.tr.insertText('Edited ', 1));
    yUndo(view.state);
    expect(view.state.doc.textContent).not.to.include('Edited');
    yRedo(view.state);
    expect(view.state.doc.textContent).to.include('Edited Title');
  });

  it('retains edits on save errors and retries without opening collaboration', async () => {
    const showError = sinon.stub(el, '_showSaveError').resolves();
    const states = [];
    const unsubscribe = canvasBus.editorSaveState.subscribe((state) => states.push(state));
    try {
      await el._loadEditor();
      el._proseContext.view.dispatch(el._proseContext.view.state.tr.insertText('Edited ', 1));
      saveStatus = 403;
      expect((await el.forceSave()).ok).to.be.false;
      expect(el.hasPendingSave).to.be.true;
      expect(el._proseContext.view.editable).to.be.true;
      expect(states.at(-1).status).to.equal('error');
      expect(showError.calledOnce).to.be.true;
      saveStatus = 200;
      expect(await el.forceSave()).to.deep.equal({ ok: true });
      expect(states.at(-1).status).to.equal('saved');
      expect(websocket.called).to.be.false;
    } finally {
      unsubscribe();
    }
  });

  it('honors read-only grants from the source GET', async () => {
    readPermissions = ['read'];
    await el._loadEditor();
    expect(el._proseContext.view.editable).to.be.false;
    expect(el._sourcePersistence).to.be.undefined;
    expect(await el.forceSave()).to.deep.equal({ ok: true });
    expect(writes).to.have.length(0);
  });

  it('does not fetch local source content or create a direct writer in connected mode', async () => {
    el.offline = false;
    await el._loadEditor();
    expect(el._proseContext.wsProvider.shouldConnect).to.be.true;
    expect(websocket.calledOnce).to.be.true;
    expect(el._sourcePersistence).to.be.undefined;
    expect(fetchStub.called).to.be.false;
  });

  it('surfaces a missing document instead of silently creating one', async () => {
    sourceStatus = 404;
    await el._loadEditor();
    expect(el._proseContext).to.be.undefined;
    expect(el._error).to.equal('The document no longer exists.');
    expect(writes).to.have.length(0);
  });

  it('surfaces load failures instead of opening an empty editor', async () => {
    sourceStatus = 403;
    await el._loadEditor();
    expect(el._proseContext).to.be.undefined;
    expect(el._error).to.equal('Not permitted');
    expect(websocket.called).to.be.false;
    expect(writes).to.have.length(0);
  });

  it('ignores a source read completing after teardown', async () => {
    let finishRead;
    let signalStarted;
    const started = new Promise((resolve) => { signalStarted = resolve; });
    fetchStub.callsFake(() => new Promise((resolve) => {
      finishRead = resolve;
      signalStarted();
    }));
    const loading = el._loadEditor();
    await started;
    el._teardown();
    finishRead(new Response(SOURCE_HTML, { status: 200 }));
    await loading;
    expect(el._proseContext).to.be.undefined;
    expect(websocket.called).to.be.false;
  });

  it('flushes final snapshots independently of the destroyed Y.Doc', async () => {
    await el._loadEditor();
    const { view, ydoc, wsProvider } = el._proseContext;
    view.dispatch(view.state.tr.insertText('Final ', 1));
    const persistence = el._sourcePersistence;
    el._teardown();
    expect(await persistence.flush()).to.deep.equal({ ok: true });
    expect(writes[0].body).to.include('Final Title');
    expect(ydoc.isDestroyed).to.be.true;
    expect(wsProvider.shouldConnect).to.be.false;
  });

  it('reports a network failure without treating it as a missing document', async () => {
    fetchStub.rejects(new Error('Source unavailable'));
    try {
      await loadLocalDocument(el.session.sourceUrl);
      expect.fail('Expected the source read to fail');
    } catch (error) {
      expect(error.message).to.equal('Source unavailable');
    }
    expect(writes).to.have.length(0);
  });

  it('mounts offline, accepts save requests, and warns only with pending changes', async () => {
    const load = el._loadEditor.bind(el);
    let signalReady;
    const ready = new Promise((resolve) => { signalReady = resolve; });
    sinon.stub(el, '_loadEditor').callsFake(async () => {
      await load();
      signalReady();
    });
    document.body.append(el);
    await ready;
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.ProseMirror')).to.exist;
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).to.be.false;
    el._proseContext.view.dispatch(el._proseContext.view.state.tr.insertText('Pending ', 1));
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).to.be.true;
    canvasBus.editorSaveRequest.emit();
    await el.forceSave();
    expect(writes[0].body).to.include('Pending Title');
    expect(websocket.called).to.be.false;
  });

  it('makes standalone readiness explicit and validates connected initial content', async () => {
    let editable;
    const result = await initProse({
      path: el.session.sourceUrl,
      permissions: ['read'],
      offline: true,
      setEditable: (value) => { editable = value; },
    });
    try {
      expect(editable).to.be.false;
      expect(result.wsProvider.bcconnected).to.be.false;
      expect(websocket.called).to.be.false;
    } finally {
      result.view.destroy();
      result.wsProvider.destroy();
      result.ydoc.destroy();
    }
    try {
      await initProse({ path: el.session.sourceUrl, permissions: ['read'], initialMetadata: {} });
      expect.fail('Expected connected initialization to reject local content');
    } catch (error) {
      expect(error.message).to.include('requires offline mode');
    }
  });
});
