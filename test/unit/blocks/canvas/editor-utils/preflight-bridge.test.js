/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

describe('preflight-bridge', () => {
  let initPreflightBridge;
  let reportPreflightStatus;
  let canvasBus;

  before(async () => {
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    ({ initPreflightBridge, reportPreflightStatus } = await import(
      '../../../../../blocks/canvas/editor-utils/preflight-bridge.js'
    ));
    ({ canvasBus } = await import('../../../../../blocks/canvas/utils/canvas-bus.js'));
    initPreflightBridge();
  });

  it('translates a document RUN event onto canvasBus.preflightRunRequest', () => {
    let received;
    const unsub = canvasBus.preflightRunRequest.subscribe((detail) => { received = detail; });
    const detail = { paths: ['/org/site/a'], requestId: 'run-1' };
    document.dispatchEvent(new CustomEvent('nx-preflight-run', { detail }));
    unsub();
    expect(received).to.deep.equal(detail);
  });

  it('translates a document STATUS event onto canvasBus.preflightStatusState', () => {
    let received;
    const unsub = canvasBus.preflightStatusState.subscribe((detail) => { received = detail; });
    const detail = { path: '/org/site/a', status: 'success', requestId: 'run-2' };
    document.dispatchEvent(new CustomEvent('nx-preflight-status', { detail }));
    unsub();
    expect(received).to.deep.equal(detail);
  });

  it('reportPreflightStatus dispatches a document STATUS event with the given detail', () => {
    let detail;
    const onStatus = (e) => { detail = e.detail; };
    document.addEventListener('nx-preflight-status', onStatus);
    reportPreflightStatus({ path: '/org/site/a', status: 'cancelled', requestId: 'run-3' });
    document.removeEventListener('nx-preflight-status', onStatus);
    expect(detail).to.deep.equal({ path: '/org/site/a', status: 'cancelled', requestId: 'run-3' });
  });

  it('is idempotent — repeated init does not double-wire the listeners', () => {
    initPreflightBridge();
    initPreflightBridge();
    let count = 0;
    const unsub = canvasBus.preflightRunRequest.subscribe(() => { count += 1; });
    document.dispatchEvent(new CustomEvent('nx-preflight-run', { detail: { paths: ['/x'], requestId: 'idem' } }));
    unsub();
    expect(count).to.equal(1);
  });
});
