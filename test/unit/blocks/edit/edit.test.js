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
    // Offline collab socket; the not-permitted path disconnects it.
    window.WebSocket = function FakeWebSocket() {
      this.readyState = 0;
      this.send = () => {};
      this.close = socketClosed;
    };
    // Collab keep-alive intervals land on this clock and are dropped on uninstall.
    const clock = sinon.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    sinon.stub(window, 'fetch').resolves(new Response('', { status: 200 }));
    sinon.stub(source, 'get').resolves({ status: 403, permissions: [] });
    setImsResult({ accessToken: { token: 'test-token' } });
    // Capture the real Recent write without sharing it with concurrently running test pages.
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
      expect(el.querySelector('.da-edit-not-permitted')).not.to.equal(null);
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
