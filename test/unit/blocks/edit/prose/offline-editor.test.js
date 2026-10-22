import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { doc2aem } from 'da-parser';
import { yUndo, yRedo } from 'da-y-wrapper';
import { setNx } from '../../../../../scripts/utils.js';
import { OFFLINE_MODE } from '../../../../../blocks/shared/constants.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
window.location.hash = '#/offlineorg/offlinesite/page.html';

const { default: initProse } = await import('../../../../../blocks/edit/prose/index.js');
await import('../../../../../blocks/edit/da-content/da-content.js');
await import('../../../../../blocks/edit/da-title/da-title.js');

const SOURCE_HTML = `<body><header></header><main>
  <div data-section-name="Intro"><h2>Title</h2><p>Hello <strong>world</strong></p>
    <div class="cards"><div><div><p>Card content</p></div></div></div>
  </div><div data-section-name="Next"><p>Second section</p></div>
</main><footer></footer>
<div class="da-metadata"><div><div>custom-property</div><div>Preserved</div></div></div>
</body>`;

describe('legacy explicitly configured offline editor', () => {
  let content;
  let title;
  let websocket;
  let writes;
  let saveStatus;

  async function load(permissions = ['read', 'write'], options = {}) {
    await initProse({
      path: 'https://admin.da.live/source/offlineorg/offlinesite/page.html',
      sourcePath: '/offlineorg/offlinesite/page.html',
      permissions,
      doc: new DOMParser().parseFromString(SOURCE_HTML, 'text/html'),
      daContent: content,
      offline: true,
      ...options,
    });
    return window.view;
  }

  beforeEach(() => {
    writes = [];
    saveStatus = 200;
    websocket = sinon.stub(window, 'WebSocket').callsFake(function FakeWebSocket() {
      this.readyState = 0;
      this.close = () => {};
      this.send = () => {};
    });
    sinon.stub(window, 'fetch').callsFake(async (url, opts = {}) => {
      if (opts.method === 'POST') {
        const body = opts.body instanceof FormData
          ? await opts.body.get('data').text()
          : opts.body;
        writes.push({ url: String(url), body });
        return new Response('', { status: saveStatus });
      }
      return new Response('{}', { status: 200 });
    });
    title = document.createElement('da-title');
    title.details = {
      view: 'edit',
      org: 'offlineorg',
      site: 'offlinesite',
      path: '/page',
      fullpath: '/offlineorg/offlinesite/page.html',
      parent: '/offlineorg/offlinesite',
      name: 'page',
    };
    title.permissions = ['read', 'write'];
    document.body.append(title);
    content = document.createElement('da-content');
    content.details = {
      fullpath: '/offlineorg/offlinesite/page.html',
      sourceUrl: 'https://admin.da.live/source/offlineorg/offlinesite/page.html',
      owner: 'offlineorg',
      repo: 'offlinesite',
      previewUrl: 'https://main--offlinesite--offlineorg.aem.page/page',
    };
    content.permissions = ['read', 'write'];
    document.body.append(content);
  });

  afterEach(async () => {
    saveStatus = 200;
    if (content.hasPendingSave) await content.forceSave();
    content.remove();
    title.remove();
    sinon.restore();
  });

  it('uses the shared connected default for the host', () => {
    expect(OFFLINE_MODE).to.be.false;
    expect(content.offline).to.equal(OFFLINE_MODE);
  });

  it('seeds source content and metadata without a socket, broadcast, or initial write', async () => {
    const view = await load();
    expect(view.state.doc.textContent).to.include('Hello world').and.include('Card content');
    expect(content.wsProvider.shouldConnect).to.be.false;
    expect(content.wsProvider.bcconnected).to.be.false;
    expect(websocket.called).to.be.false;
    expect(doc2aem(content.wsProvider.doc)).to.include('Preserved');
    expect(view.dom.dataset.sectionName).to.equal('Intro');
    expect(await content.forceSave()).to.deep.equal({ ok: true });
    expect(writes).to.have.length(0);
    expect(title.saveState.status).to.equal('saved');
  });

  it('saves document and metadata edits to the canonical source path', async () => {
    const view = await load();
    view.dispatch(view.state.tr.insertText('Edited ', 1));
    content.wsProvider.doc.getMap('daMetadata').set('custom-property', 'Changed');
    expect(content.hasPendingSave).to.be.true;
    expect(await content.forceSave()).to.deep.equal({ ok: true });
    expect(writes).to.have.length(1);
    expect(writes[0].url).to.equal(content.details.sourceUrl);
    expect(writes[0].body).to.include('Edited Title').and.include('Changed');
    expect(writes[0].body).to.include('class="cards"');
    expect(writes[0].body).to.include('data-section-name="Next"');
    expect(writes[0].body).not.to.include('ProseMirror');
    expect(title.saveState.status).to.equal('saved');
    expect(websocket.called).to.be.false;
  });

  it('supports local undo/redo without losing seeded content', async () => {
    const view = await load();
    const initial = view.state.doc.toJSON();
    yUndo(view.state);
    expect(view.state.doc.toJSON()).to.deep.equal(initial);
    view.dispatch(view.state.tr.insertText('Edited ', 1));
    yUndo(view.state);
    expect(view.state.doc.textContent).not.to.include('Edited');
    yRedo(view.state);
    expect(view.state.doc.textContent).to.include('Edited Title');
  });

  it('retains failed saves, displays an error and retries without a collab fallback', async () => {
    const view = await load();
    view.dispatch(view.state.tr.insertText('Edited ', 1));
    saveStatus = 403;
    expect((await content.forceSave()).ok).to.be.false;
    await title.updateComplete;
    expect(content.hasPendingSave).to.be.true;
    expect(title.saveState.status).to.equal('error');
    expect(title.shadowRoot.querySelector('[role="alert"]')).to.exist;
    saveStatus = 200;
    expect(await title.retrySave()).to.deep.equal({ ok: true });
    expect(title.saveState.status).to.equal('saved');
    expect(websocket.called).to.be.false;
  });

  it('does not create a writer or an editable view for read-only documents', async () => {
    const view = await load(['read']);
    expect(view.editable).to.be.false;
    expect(content.sourcePersistence).to.be.undefined;
    expect(await content.forceSave()).to.deep.equal({ ok: true });
    expect(writes).to.have.length(0);
  });

  it('warns on unload only while dirty and flushes final snapshots on teardown', async () => {
    const view = await load();
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).to.be.false;
    view.dispatch(view.state.tr.insertText('Final ', 1));
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).to.be.true;
    const persistence = content.sourcePersistence;
    const ydoc = content.wsProvider.doc;
    content.destroyEditor();
    expect(await persistence.flush()).to.deep.equal({ ok: true });
    expect(writes[0].body).to.include('Final Title');
    expect(ydoc.isDestroyed).to.be.true;
    expect(window.view).to.be.undefined;
  });

  it('uses sourcePath rather than deriving a write path from a source-bus URL', async () => {
    const view = await load(['read', 'write'], { path: 'https://api.aem.live/offlineorg/sites/offlinesite/source/page.html' });
    view.dispatch(view.state.tr.insertText('Edited ', 1));
    await content.forceSave();
    expect(writes[0].url).to.equal(content.details.sourceUrl);
  });

  it('refuses prestarted collaboration in offline mode', async () => {
    try {
      await load(['read'], { wsPromise: Promise.resolve({}) });
      expect.fail('Expected an incompatible connection to be rejected');
    } catch (error) {
      expect(error.message).to.equal('wsPromise requires offline: false.');
    }
    expect(websocket.called).to.be.false;
  });
});
