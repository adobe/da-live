/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

const tick = () => new Promise((resolve) => { setTimeout(resolve, 20); });

describe('preflight-responder', () => {
  let initPreflightResponder;
  let takePendingPreflightRequest;
  let canvasBus;

  before(async () => {
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    ({ initPreflightResponder, takePendingPreflightRequest } = await import(
      '../../../../../blocks/canvas/editor-utils/preflight-responder.js'
    ));
    ({ canvasBus } = await import('../../../../../blocks/canvas/utils/canvas-bus.js'));
    initPreflightResponder();
  });

  afterEach(() => {
    // Drain any parked request so tests don't leak state into each other.
    takePendingPreflightRequest();
  });

  it('opens the governance panel and parks the request on a run', async () => {
    let openDetail;
    const onOpen = (e) => { openDetail = e.detail; };
    document.addEventListener('nx-panel-open', onOpen);
    canvasBus.preflightRunRequest.emit({ paths: ['/org/site/a.html'], requestId: 'run-1' });
    await tick();
    document.removeEventListener('nx-panel-open', onOpen);

    expect(openDetail).to.deep.equal({ section: 'tools', id: 'governance' });
  });

  it('takePendingPreflightRequest returns then clears the parked request', async () => {
    canvasBus.preflightRunRequest.emit({ paths: ['/org/site/a.html'], requestId: 'run-2' });
    await tick();

    expect(takePendingPreflightRequest()).to.deep.equal({ path: '/org/site/a.html', requestId: 'run-2' });
    expect(takePendingPreflightRequest()).to.equal(null);
  });

  it('ignores malformed runs (missing requestId or multiple paths)', async () => {
    canvasBus.preflightRunRequest.emit({ paths: ['/org/site/a.html'] });
    canvasBus.preflightRunRequest.emit({ paths: ['/a', '/b'], requestId: 'run-3' });
    await tick();
    expect(takePendingPreflightRequest()).to.equal(null);
  });

  it('is idempotent — repeated init does not double-wire the subscription', async () => {
    initPreflightResponder();
    initPreflightResponder();
    let count = 0;
    const onOpen = () => { count += 1; };
    document.addEventListener('nx-panel-open', onOpen);
    canvasBus.preflightRunRequest.emit({ paths: ['/org/site/a.html'], requestId: 'run-4' });
    await tick();
    document.removeEventListener('nx-panel-open', onOpen);
    expect(count).to.equal(1);
  });
});
