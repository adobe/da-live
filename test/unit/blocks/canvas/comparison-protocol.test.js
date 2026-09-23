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
      setupIframeChannel({
        iframe, hashState: { org: 'example', site: 'site', path: 'page' }, getView: () => null,
      }).then((value) => { connection = value; });
    });
    ({ data: ready, port: clientPort } = await initialized);
  });
  afterEach(() => { unsubscribe?.(); connection?.destroy(); clientPort?.close(); });

  it('advertises host capabilities in the existing ready handshake', () => {
    expect(ready.capabilities).to.deep.equal({ comparison: 1, saveDocument: 1 });
  });

  it('acknowledges a request over the same port and uses host-owned page context', async () => {
    expect(canvasBus.comparisonRequest).to.exist;
    unsubscribe = canvasBus.comparisonRequest.subscribe(({ action, context, details, resolve }) => {
      expect(action).to.equal('openComparison');
      expect(context).to.deep.equal({ org: 'example', site: 'site', path: 'page' });
      expect(details).to.deep.equal({ candidate: 'document', baseline: 'live' });
      resolve({ ok: true });
    });
    const response = new Promise((resolve) => { clientPort.onmessage = ({ data }) => resolve(data); });
    clientPort.postMessage({ action: 'openComparison', requestId: 'compare-1', details: { candidate: 'document', baseline: 'live', path: '/other', html: '<script>bad</script>' } });
    expect(await response).to.deep.equal({ action: 'sdkResponse', requestId: 'compare-1', result: { ok: true } });
  });

  it('rejects unsupported comparison types before notifying the canvas', async () => {
    expect(ready.capabilities?.comparison).to.equal(1);
    const response = new Promise((resolve) => { clientPort.onmessage = ({ data }) => resolve(data); });
    clientPort.postMessage({ action: 'openComparison', requestId: 'compare-2', details: { candidate: 'url', baseline: 'live' } });
    expect((await response).result).to.deep.equal({ ok: false, error: 'invalid-comparison' });
  });
});
