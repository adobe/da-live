import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setNx, getNx, getNx2Api } from '../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: init, showNotPermitted, removeNotPermitted } = await import('../../../../blocks/edit/edit.js');
const { source } = await getNx2Api();
const { setImsResult } = await import(`${getNx()}/utils/ims.js`);

describe('edit entry point', () => {
  it('records the opened document in Recent with its .html path', async () => {
    const { href } = window.location;
    const savedSocket = window.WebSocket;
    const el = document.createElement('div');
    let socketClosed;
    const closed = new Promise((resolve) => { socketClosed = resolve; });
    window.WebSocket = function FakeWebSocket() {
      this.readyState = 0;
      this.send = () => {};
      this.close = socketClosed;
    };
    const clock = sinon.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    sinon.stub(window, 'fetch').resolves(new Response('', { status: 200 }));
    sinon.stub(source, 'get').resolves({ status: 403, permissions: [] });
    setImsResult({ accessToken: { token: 'test-token' } });
    const setItem = sinon.stub(Storage.prototype, 'setItem');
    const writes = [];
    setItem.callsFake(function record(key, value) {
      if (key === 'da-recent-files') writes.push(JSON.parse(value));
      else setItem.wrappedMethod.call(this, key, value);
    });
    const addListener = sinon.spy(window, 'addEventListener');
    try {
      window.history.replaceState(null, '', '/edit#/org/site/docs/page');
      await init(el);
      await closed;
      expect(writes[0]['/org/site'][0]).to.equal('/org/site/docs/page.html');
    } finally {
      addListener.getCalls().forEach(({ args }) => window.removeEventListener(...args));
      clock.uninstall();
      sinon.restore();
      setImsResult(undefined);
      window.WebSocket = savedSocket;
      window.history.replaceState(null, '', href);
    }
  });
});

describe('edit not permitted message', () => {
  let el;
  let daTitle;

  beforeEach(() => {
    // Keep the fixture detached: <da-content> is a real Lit element that
    // renders from `details` once connected. These tests only exercise the
    // DOM swap, so it must never connect (and never render without details).
    el = document.createElement('div');
    el.append(document.createElement('da-content'));
    daTitle = {};
  });

  it('removes the editor, hides the title actions and shows the shared message', () => {
    showNotPermitted({ el, daTitle, message: 'Not permitted' });
    expect(el.querySelectorAll('da-content').length).to.equal(0);
    expect(daTitle.hideActions).to.be.true;
    const box = el.querySelector('.da-edit-not-permitted .empty-list');
    expect(box.querySelector('h3').textContent).to.equal('Not permitted');
    expect(box.querySelectorAll('.empty-list-action').length).to.equal(1);
  });

  it('removes the message and restores the title actions', () => {
    showNotPermitted({ el, daTitle, message: 'Not permitted' });
    removeNotPermitted({ el, daTitle });
    expect(el.querySelectorAll('.da-edit-not-permitted').length).to.equal(0);
    expect(daTitle.hideActions).to.be.false;
  });
});

describe('edit entry on imported content', () => {
  const IMPORTED_CAPS = {
    apiVersion: 1,
    transport: 'helix6',
    contentProfile: 'aem-import',
    readOnly: true,
    openKinds: ['image', 'sheet'],
    collaboration: false,
    branching: false,
    generation: 'g-test',
  };
  let href;
  let savedSocket;
  let sockets;
  let el;
  let addListener;
  let invalidate;

  const respond = (capsResponse) => async (target) => {
    const url = String(target);
    if (url.includes('/ping/')) return new Response('', { headers: { 'x-api-upgrade-available': 'true' } });
    if (url.endsWith('/source-capabilities')) return capsResponse();
    return new Response('', { status: 200 });
  };

  const settle = async () => {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && !el.querySelector('.da-edit-not-permitted')) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => { setTimeout(resolve, 10); });
    }
  };

  beforeEach(async () => {
    ({ invalidateDaRsDiscovery: invalidate } = await import('../../../../blocks/shared/da-rs-provider.js'));
    href = window.location.href;
    savedSocket = window.WebSocket;
    sockets = 0;
    window.WebSocket = function FakeWebSocket() {
      sockets += 1;
      this.readyState = 0;
      this.send = () => {};
      this.close = () => {};
    };
    el = document.createElement('div');
    addListener = sinon.spy(window, 'addEventListener');
    invalidate();
  });

  afterEach(() => {
    addListener.getCalls().forEach(({ args }) => window.removeEventListener(...args));
    sinon.restore();
    window.WebSocket = savedSocket;
    window.history.replaceState(null, '', href);
    invalidate();
  });

  [
    ['an imported site', () => Response.json(IMPORTED_CAPS), 'cannot be opened in the editor', 'wknd'],
    ['an imported branch URL', () => Response.json(IMPORTED_CAPS), 'cannot be opened in the editor', 'wknd~draft'],
    ['failed capability discovery', () => new Response('', { status: 500 }), 'Unable to verify', 'wknd'],
  ].forEach(([label, capsResponse, message, site]) => {
    it(`denies a direct /edit URL for ${label} before any document, socket or editor`, async () => {
      sinon.stub(window, 'fetch').callsFake(respond(capsResponse));
      const get = sinon.stub(source, 'get').resolves({ status: 200, permissions: ['write'], text: async () => '' });
      const save = sinon.stub(source, 'save').resolves({ ok: true });
      window.history.replaceState(null, '', `/edit?da-source=da-rs#/demo/${site}/page`);
      await init(el);
      await settle();
      expect(el.querySelector('.da-edit-not-permitted h3').textContent).to.contain(message);
      expect(el.querySelector('da-title').readOnly).to.equal(true);
      expect(el.querySelector('da-content')).to.equal(null);
      expect(el.querySelector('da-branch-selector')).to.equal(null);
      expect(get.called).to.equal(false);
      expect(save.called).to.equal(false);
      expect(sockets).to.equal(0);
    });
  });
});
