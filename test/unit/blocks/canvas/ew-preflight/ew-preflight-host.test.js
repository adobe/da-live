import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

const tick = () => new Promise((resolve) => { setTimeout(resolve, 30); });

function captureStatus() {
  const events = [];
  const handler = (e) => { events.push(e.detail); };
  document.addEventListener('nx-preflight-status', handler);
  return {
    events,
    stop: () => document.removeEventListener('nx-preflight-status', handler),
  };
}

describe('ew-preflight-host', () => {
  let canvasBus;
  let peekPendingPreflightRequest;
  let takePendingPreflightRequest;
  let el;

  before(async () => {
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    const responder = await import('../../../../../blocks/canvas/editor-utils/preflight-responder.js');
    ({ peekPendingPreflightRequest, takePendingPreflightRequest } = responder);
    responder.initPreflightResponder();
    await import('../../../../../blocks/canvas/ew-preflight/ew-preflight-host.js');
    ({ canvasBus } = await import('../../../../../blocks/canvas/utils/canvas-bus.js'));
  });

  async function mount() {
    const host = document.createElement('ew-preflight-host');
    document.body.append(host);
    await host.updateComplete;
    return host;
  }

  const builtin = (host) => host.shadowRoot.querySelector('ew-preflight');

  afterEach(() => {
    el?.remove();
    el = null;
    takePendingPreflightRequest();
  });

  it('renders the built-in Preflight and exposes its header actions', async () => {
    el = await mount();
    expect(builtin(el)).to.exist;
    expect(el.getHeaderActions()).to.equal(builtin(el).getHeaderActions());
  });

  it('lets the built-in Preflight claim a publish gate parked before mount', async () => {
    const cap = captureStatus();
    canvasBus.preflightRunRequest.emit({ paths: ['/org/site/a.html'], requestId: 'h1' });
    expect(peekPendingPreflightRequest()?.requestId).to.equal('h1');
    el = await mount();
    await tick();
    cap.stop();
    expect(peekPendingPreflightRequest()).to.equal(null);
    expect(cap.events.filter((d) => d.requestId === 'h1')).to.have.length(1);
  });
});
