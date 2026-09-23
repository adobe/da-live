/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

const tick = () => new Promise((resolve) => { setTimeout(resolve, 20); });

// The gate wiring is what we test here; the REST call (evaluatePage) and the
// da-nx renderer (ensureRenderer) are external, so every element gets a stubbed
// `_evaluate` that just sets `_data`/`_error` synthetically.
function stubEvaluate(el, { failed = 0, error = null } = {}) {
  el._evaluate = async () => {
    el._error = error;
    el._data = error ? undefined : { failed };
  };
  return el;
}

function captureStatus() {
  const events = [];
  const handler = (e) => { events.push(e.detail); };
  document.addEventListener('nx-preflight-status', handler);
  return {
    events,
    stop: () => document.removeEventListener('nx-preflight-status', handler),
  };
}

describe('ew-governance preflight gate', () => {
  let canvasBus;

  before(async () => {
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    await import('../../../../../blocks/canvas/ew-governance/ew-governance.js');
    ({ canvasBus } = await import('../../../../../blocks/canvas/utils/canvas-bus.js'));
  });

  it('reports success when no checks failed, echoing the run path + requestId', async () => {
    const el = stubEvaluate(document.createElement('ew-governance'), { failed: 0 });
    const cap = captureStatus();
    await el._handlePreflightRun({ paths: ['/org/site/a.html'], requestId: 'g1' });
    cap.stop();
    expect(cap.events).to.deep.equal([{ path: '/org/site/a.html', status: 'success', requestId: 'g1' }]);
  });

  it('reports fail when a check failed', async () => {
    const el = stubEvaluate(document.createElement('ew-governance'), { failed: 1 });
    const cap = captureStatus();
    await el._handlePreflightRun({ paths: ['/org/site/a.html'], requestId: 'g2' });
    cap.stop();
    expect(cap.events).to.deep.equal([{ path: '/org/site/a.html', status: 'fail', requestId: 'g2' }]);
  });

  it('reports fail when the evaluation errors', async () => {
    const el = stubEvaluate(document.createElement('ew-governance'), { error: 'boom' });
    const cap = captureStatus();
    await el._handlePreflightRun({ paths: ['/org/site/a.html'], requestId: 'g3' });
    cap.stop();
    expect(cap.events).to.deep.equal([{ path: '/org/site/a.html', status: 'fail', requestId: 'g3' }]);
  });

  it('reports cancelled when the panel closes before the run settles', async () => {
    const el = document.createElement('ew-governance');
    let release;
    el._evaluate = () => new Promise((resolve) => { release = resolve; });
    const running = el._handlePreflightRun({ paths: ['/org/site/a.html'], requestId: 'g4' });
    await tick(); // let the panel-close listener register

    const cap = captureStatus();
    document.dispatchEvent(new CustomEvent('nx-panel-close'));
    cap.stop();
    expect(cap.events).to.deep.equal([{ path: '/org/site/a.html', status: 'cancelled', requestId: 'g4' }]);

    // The late-settling evaluate must not emit a second (success) status.
    const cap2 = captureStatus();
    release();
    await running;
    cap2.stop();
    expect(cap2.events).to.deep.equal([]);
  });

  it('_cancelGate emits cancelled for an in-flight gate (disconnect backstop)', () => {
    const el = document.createElement('ew-governance');
    el._gateRequestId = 'g5';
    el._gatePath = '/org/site/a.html';
    el._gateSettled = false;
    const cap = captureStatus();
    el._cancelGate();
    cap.stop();
    expect(cap.events).to.deep.equal([{ path: '/org/site/a.html', status: 'cancelled', requestId: 'g5' }]);
  });

  it('dedupes a repeated requestId — runs the gate once', async () => {
    const el = stubEvaluate(document.createElement('ew-governance'), { failed: 0 });
    const cap = captureStatus();
    await el._handlePreflightRun({ paths: ['/org/site/a.html'], requestId: 'g6' });
    await el._handlePreflightRun({ paths: ['/org/site/a.html'], requestId: 'g6' });
    cap.stop();
    expect(cap.events).to.have.lengthOf(1);
  });

  it('a non-gate refresh emits a requestId-less status at the derived doc path', async () => {
    const el = stubEvaluate(document.createElement('ew-governance'), { failed: 0 });
    el._hashState = { org: 'o', site: 's', path: '/p' };
    const cap = captureStatus();
    await el._evaluateAndReport();
    cap.stop();
    expect(cap.events).to.deep.equal([{ path: '/o/s/p.html', status: 'success' }]);
  });

  it('runs the gate once on first open via the parked pending request', async () => {
    const { initPreflightResponder } = await import(
      '../../../../../blocks/canvas/editor-utils/preflight-responder.js'
    );
    initPreflightResponder();
    // Fire the run before the panel mounts: it is parked, not delivered live.
    canvasBus.preflightRunRequest.emit({ paths: ['/org/site/a.html'], requestId: 'g7' });
    await tick();

    const el = stubEvaluate(document.createElement('ew-governance'), { failed: 0 });
    const cap = captureStatus();
    document.body.appendChild(el);
    await tick();
    el.remove();
    cap.stop();

    const gateEvents = cap.events.filter((d) => d.requestId === 'g7');
    expect(gateEvents).to.deep.equal([{ path: '/org/site/a.html', status: 'success', requestId: 'g7' }]);
  });
});
