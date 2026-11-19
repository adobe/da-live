import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

let initProse;
let savedWebSocket;
let savedIMS;

before(async () => {
  ({ default: initProse } = await import('../../../../../blocks/canvas/ew-editor-doc/prose.js'));
});

beforeEach(() => {
  // No real socket: the test drives the provider's events directly.
  savedWebSocket = window.WebSocket;
  window.WebSocket = function FakeWebSocket() {
    this.readyState = 0;
    this.close = () => {};
    this.send = () => {};
  };
  savedIMS = window.adobeIMS;
  window.localStorage.setItem('nx-ims', 'true');
  window.adobeIMS = { getAccessToken: () => null, refreshToken: async () => {}, signIn: () => {} };
});

afterEach(() => {
  window.WebSocket = savedWebSocket;
  if (savedIMS === undefined) delete window.adobeIMS; else window.adobeIMS = savedIMS;
  window.localStorage.removeItem('nx-ims');
  document.querySelectorAll('da-dialog.da-auth-banner').forEach((el) => el.remove());
});

async function connect() {
  return initProse({
    path: 'https://admin.da.live/source/authorg/authsite/page.html',
    permissions: ['read', 'write'],
    setEditable: () => {},
    getToken: () => 'test-token',
  });
}

function teardown({ wsProvider, ydoc, view }) {
  wsProvider.disconnect({ data: 'Client navigation' });
  wsProvider.destroy?.();
  view?.destroy?.();
  ydoc.destroy();
}

const type = (view) => view.dispatch(view.state.tr.insertText('x', 1));

describe('canvas collab auth loss', () => {
  [
    { code: 4403, reason: 'forbidden' },
    { code: 4401, reason: 'auth' },
  ].forEach((close) => {
    it(`blocks local edits after a ${close.code} it cannot recover from, until a re-sync`, async () => {
      const result = await connect();
      const { view, wsProvider } = result;
      try {
        type(view);
        expect(view.state.doc.textContent).to.equal('x');

        wsProvider.emit('connection-close', [close, wsProvider]);
        await wait(80);

        expect(wsProvider.shouldConnect).to.equal(false);
        expect(view.editable).to.equal(false);
        expect(view.dom.getAttribute('contenteditable')).to.equal('false');
        expect(document.querySelector('da-dialog.da-auth-banner')).to.exist;
        type(view);
        expect(view.state.doc.textContent).to.equal('x');

        wsProvider.emit('synced', [true]);
        expect(view.editable).to.equal(true);
        type(view);
        expect(view.state.doc.textContent).to.equal('xx');
      } finally {
        teardown(result);
      }
    });
  });
});
