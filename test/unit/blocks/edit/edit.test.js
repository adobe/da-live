import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setNx } from '../../../../scripts/utils.js';
import getPathDetails from '../../../../blocks/shared/pathDetails.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
const { setUI } = await import('../../../../blocks/edit/edit.js');

const SOURCE_HTML = '<body><header></header><main><div><h1>Existing title</h1></div></main><footer></footer></body>';

describe('legacy explicitly configured offline navigation', () => {
  let root;
  let originalUrl;
  let originalTitle;
  let fetchStub;
  let websocket;

  function navigate(path) {
    window.history.replaceState(null, '', `/edit#/navigationorg/navigationsite/${path}`);
  }

  beforeEach(() => {
    originalUrl = window.location.href;
    originalTitle = document.title;
    navigate('page');
    root = document.createElement('div');
    const content = document.createElement('da-content');
    content.details = getPathDetails();
    content.permissions = ['read', 'write'];
    content.offline = true;
    content.handleEditorLoaded = () => {};
    root.append(content);
    document.body.append(root);
    websocket = sinon.stub(window, 'WebSocket').callsFake(function FakeWebSocket() {
      this.readyState = 0;
      this.close = () => {};
      this.send = () => {};
    });
    sinon.stub(console, 'warn');
    fetchStub = sinon.stub(window, 'fetch').callsFake(async (url) => (
      new Response(String(url).includes('/source/') ? SOURCE_HTML : '{}', { status: 200, headers: { 'x-da-actions': 'read,write' } })
    ));
  });

  afterEach(async () => {
    const content = root.querySelector('da-content');
    fetchStub.resolves(new Response('', { status: 200 }));
    if (content.hasPendingSave) await content.forceSave();
    root.remove();
    window.history.replaceState(null, '', originalUrl);
    document.title = originalTitle;
    sinon.restore();
  });

  it('loads editable local source content only with explicit offline configuration', async () => {
    await setUI(root);
    const content = root.querySelector('da-content');
    await content.updateComplete;
    await content.shadowRoot.querySelector('da-editor').updateComplete;
    expect(content.offline).to.be.true;
    expect(window.view.state.doc.textContent).to.equal('Existing title');
    expect(window.view.dom.isContentEditable).to.be.true;
    expect(content.hasPendingSave).to.be.false;
    expect(fetchStub.getCalls().some((call) => call.args[1]?.method === 'POST')).to.be.false;
    expect(websocket.called).to.be.false;
  });

  it('preserves early collaboration startup when offline is disabled', async () => {
    const content = root.querySelector('da-content');
    content.offline = false;
    await setUI(root);
    expect(websocket.calledOnce).to.be.true;
    expect(content.wsProvider.shouldConnect).to.be.true;
    expect(content.sourcePersistence).to.be.undefined;
    content.wsProvider.emit('status', [{ status: 'disconnected' }]);
    expect(content.offline).to.be.false;
    expect(content.sourcePersistence).to.be.undefined;
    content.destroyEditor();
    websocket.resetHistory();
    window.dispatchEvent(new Event('focus'));
    expect(websocket.called).to.be.false;
  });

  [false, true].forEach((offline) => {
    it(`keeps the denied document title without an editor when offline is ${offline}`, async () => {
      const content = root.querySelector('da-content');
      content.offline = offline;
      fetchStub.callsFake(async (url) => new Response(
        String(url).includes('/source/') ? 'Forbidden' : '{}',
        { status: String(url).includes('/source/') ? 403 : 200 },
      ));

      await setUI(root).then(
        () => expect.fail('Expected the denied source read to fail'),
        (error) => expect(error.message).to.equal('Could not load the document (403).'),
      );

      const title = root.querySelector('da-title');
      expect(title).not.to.be.null;
      await title.updateComplete;
      expect(title.shadowRoot.querySelector('h1').textContent).to.include('page');
      expect(document.title).to.equal('Edit page - DA');
      expect(content.proseEl).to.be.undefined;
      expect(content.wsProvider).to.be.undefined;
      expect(content.sourcePersistence).to.be.undefined;
    });
  });

  it('retains unsaved content and its title when the destination source is denied', async () => {
    await setUI(root);
    const content = root.querySelector('da-content');
    const title = root.querySelector('da-title');
    const { view } = window;
    view.dispatch(view.state.tr.insertText('Unsaved ', 1));
    fetchStub.callsFake(async (url) => new Response(
      String(url).includes('/source/') ? 'Forbidden' : '{}',
      { status: String(url).includes('/source/') ? 403 : 200 },
    ));
    navigate('denied');

    await setUI(root).then(
      () => expect.fail('Expected the denied source read to fail'),
      (error) => expect(error.message).to.equal('Could not load the document (403).'),
    );

    expect(window.location.hash).to.equal('#/navigationorg/navigationsite/page.html');
    expect(window.view).to.equal(view);
    expect(view.isDestroyed).to.be.false;
    expect(view.state.doc.textContent).to.include('Unsaved Existing title');
    expect(title.details.fullpath).to.equal('/navigationorg/navigationsite/page.html');
    expect(content.hasPendingSave).to.be.true;
    fetchStub.resolves(new Response('', { status: 200 }));
  });

  it('restores the hash and retains the editable document if saving fails', async () => {
    await setUI(root);
    const content = root.querySelector('da-content');
    const { view } = window;
    view.dispatch(view.state.tr.insertText('Unsaved ', 1));
    sinon.stub(console, 'error');
    fetchStub.callsFake(async (url, options = {}) => new Response(
      String(url).includes('/source/') ? SOURCE_HTML : '{}',
      { status: options.method === 'POST' ? 403 : 200 },
    ));
    navigate('next');
    await setUI(root);
    expect(window.location.hash).to.equal('#/navigationorg/navigationsite/page.html');
    expect(window.view).to.equal(view);
    expect(view.isDestroyed).to.be.false;
    expect(view.state.doc.textContent).to.include('Unsaved Existing title');
    expect(content.hasPendingSave).to.be.true;
    fetchStub.resolves(new Response('', { status: 200 }));
  });

  it('saves edits made during destination lookup before replacing the editor', async () => {
    await setUI(root);
    const oldView = window.view;
    let finishRead;
    let signalRead;
    const readStarted = new Promise((resolve) => { signalRead = resolve; });
    let savedBody;
    fetchStub.callsFake(async (url, options = {}) => {
      if (options.method === 'POST') {
        savedBody = await options.body.get('data').text();
        return new Response('', { status: 200 });
      }
      if (String(url).endsWith('/next.html')) {
        signalRead();
        return new Promise((resolve) => { finishRead = resolve; });
      }
      return new Response('{}', { status: 200 });
    });
    navigate('next');
    const loading = setUI(root);
    await readStarted;
    oldView.dispatch(oldView.state.tr.insertText('Latest ', 1));
    finishRead(new Response(SOURCE_HTML, { status: 200, headers: { 'x-da-actions': 'read,write' } }));
    await loading;
    expect(savedBody).to.include('Latest Existing title');
    expect(oldView.isDestroyed).to.be.true;
    expect(window.view).not.to.equal(oldView);
    expect(root.querySelector('da-content').details.fullpath)
      .to.equal('/navigationorg/navigationsite/next.html');
  });

  it('ignores a source read completing after a newer navigation', async () => {
    let finishRead;
    let signalRead;
    const readStarted = new Promise((resolve) => { signalRead = resolve; });
    fetchStub.callsFake(async (url) => {
      if (String(url).endsWith('/page.html')) {
        signalRead();
        return new Promise((resolve) => { finishRead = resolve; });
      }
      return new Response(SOURCE_HTML, { status: 200, headers: { 'x-da-actions': 'read,write' } });
    });
    const obsolete = setUI(root);
    await readStarted;
    navigate('latest');
    await setUI(root);
    const { view } = window;
    finishRead(new Response('<main><div><h1>Obsolete</h1></div></main>', { status: 200 }));
    await obsolete;
    expect(window.view).to.equal(view);
    expect(view.state.doc.textContent).to.equal('Existing title');
    expect(root.querySelector('da-content').details.fullpath)
      .to.equal('/navigationorg/navigationsite/latest.html');
  });
});
