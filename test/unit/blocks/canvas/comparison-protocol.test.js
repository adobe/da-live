import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../scripts/utils.js';
import { canvasBus } from '../../../../blocks/canvas/utils/canvas-bus.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
let setupIframeChannel;
before(async () => {
  ({ setupIframeChannel } = await import('../../../../blocks/canvas/ew-panel-extensions/iframe-protocol.js'));
});

describe('comparison plugin protocol', () => {
  let connection;
  let ready;
  let clientPort;
  let unsubscribe;
  beforeEach(async () => {
    const initialized = new Promise((resolve) => {
      const iframe = {
        src: `${location.origin}/test-plugin`,
        contentWindow: { postMessage: (data, origin, ports) => resolve({ data, port: ports[0] }) },
      };
      setupIframeChannel({ iframe, hashState: { org: 'example', site: 'site', path: 'page' }, getView: () => null }).then((value) => { connection = value; });
    });
    ({ data: ready, port: clientPort } = await initialized);
  });
  afterEach(() => {
    unsubscribe?.();
    connection?.destroy();
    clientPort?.close();
  });

  it('initializes the existing ready handshake without capability negotiation', () => {
    expect(ready.ready).to.equal(true);
    expect(ready.capabilities).to.equal(undefined);
  });

  it('opens comparison without a request ID or response callback, using host-owned context', async () => {
    const received = new Promise((resolve) => {
      unsubscribe = canvasBus.comparisonRequest.subscribe(resolve);
    });
    clientPort.postMessage({ action: 'openComparison', details: { candidate: 'document', baseline: 'live', path: '/other', html: '<script>bad</script>' } });
    const request = await received;
    expect(request.action).to.equal('openComparison');
    expect(request.context).to.deep.equal({ org: 'example', site: 'site', path: 'page' });
    expect(request.details).to.deep.equal({ candidate: 'document', baseline: 'live' });
    expect(request.resolve).to.equal(undefined);
  });

  it('ignores invalid comparison inputs before routing a valid fire-and-forget close', async () => {
    const requests = [];
    const closed = new Promise((resolve) => {
      unsubscribe = canvasBus.comparisonRequest.subscribe((request) => {
        requests.push(request);
        if (request.action === 'closeComparison') resolve(request);
      });
    });
    clientPort.postMessage({ action: 'openComparison', details: { candidate: 'url', baseline: 'live' } });
    clientPort.postMessage({ action: 'closeComparison' });
    const request = await closed;
    expect(requests).to.have.length(1);
    expect(request.resolve).to.equal(undefined);
    expect(request.context).to.deep.equal({ org: 'example', site: 'site', path: 'page' });
  });

  it('acknowledges save completion over the same port', async () => {
    unsubscribe = canvasBus.comparisonRequest.subscribe(({ action, context, details, resolve }) => {
      expect(action).to.equal('saveDocument');
      expect(context).to.deep.equal({ org: 'example', site: 'site', path: 'page' });
      expect(details).to.equal(undefined);
      resolve({ ok: true });
    });
    const response = new Promise((resolve) => {
      clientPort.onmessage = ({ data }) => resolve(data);
    });
    clientPort.postMessage({ action: 'saveDocument', requestId: 'save-1', details: { path: '/other' } });
    expect(await response).to.deep.equal({ action: 'sdkResponse', requestId: 'save-1', result: { ok: true } });
  });

  it('does not start a save without a valid response correlation ID', async () => {
    const requests = [];
    const closed = new Promise((resolve) => {
      unsubscribe = canvasBus.comparisonRequest.subscribe((request) => {
        requests.push(request.action);
        if (request.action === 'closeComparison') resolve();
      });
    });
    clientPort.postMessage({ action: 'saveDocument' });
    clientPort.postMessage({ action: 'saveDocument', requestId: '' });
    clientPort.postMessage({ action: 'closeComparison' });
    await closed;
    expect(requests).to.deep.equal(['closeComparison']);
  });
});
