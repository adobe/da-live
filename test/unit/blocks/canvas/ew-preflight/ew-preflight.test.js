/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { getNx, setNx } from '../../../../../scripts/utils.js';
import { adaptEvaluation } from '../../../../../blocks/canvas/ew-preflight/adapter.js';

const tick = () => new Promise((resolve) => { setTimeout(resolve, 20); });
const GATE_PAGE = { org: 'org', site: 'site', path: '/a' };

function createGateElement() {
  const el = document.createElement('ew-preflight');
  el._hashState = GATE_PAGE;
  return el;
}

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

describe('ew-preflight preflight gate', () => {
  let canvasBus;
  let hashChange;
  let takePendingPreflightRequest;

  before(async () => {
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    await import('../../../../../blocks/canvas/ew-preflight/ew-preflight.js');
    ({ canvasBus } = await import('../../../../../blocks/canvas/utils/canvas-bus.js'));
    ({ hashChange } = await import(`${getNx()}/utils/utils.js`));
    const responder = await import('../../../../../blocks/canvas/editor-utils/preflight-responder.js');
    ({ takePendingPreflightRequest } = responder);
    responder.initPreflightResponder();
  });

  beforeEach(() => {
    hashChange._set(GATE_PAGE);
  });

  afterEach(() => {
    takePendingPreflightRequest();
    hashChange._set({});
  });

  it('reports success when no checks failed, echoing the run path + requestId', async () => {
    const el = stubEvaluate(createGateElement(), { failed: 0 });
    const cap = captureStatus();
    await el._handlePreflightRun({ paths: ['/org/site/a.html'], requestId: 'g1' });
    cap.stop();
    expect(cap.events).to.deep.equal([{ path: '/org/site/a.html', status: 'success', requestId: 'g1' }]);
  });

  it('reports fail when a check failed', async () => {
    const el = stubEvaluate(createGateElement(), { failed: 1 });
    const cap = captureStatus();
    await el._handlePreflightRun({ paths: ['/org/site/a.html'], requestId: 'g2' });
    cap.stop();
    expect(cap.events).to.deep.equal([{ path: '/org/site/a.html', status: 'fail', requestId: 'g2' }]);
  });

  it('reports fail when only site-code checks fail', async () => {
    const data = adaptEvaluation({
      site_code_evaluation: {
        evaluations: [
          {
            check_title: 'Page has exactly one H1',
            alignment: 'NO',
            reasoning: 'No H1 heading found.',
            suggestions: 'Add a single H1 heading.',
            category: null,
          },
        ],
      },
    });
    const el = createGateElement();
    el._evaluate = async () => { el._data = data; };
    const cap = captureStatus();
    await el._handlePreflightRun({ paths: ['/org/site/a.html'], requestId: 'sitefail' });
    cap.stop();
    expect(cap.events).to.deep.equal([
      { path: '/org/site/a.html', status: 'fail', requestId: 'sitefail' },
    ]);
  });

  it('reports success when site-code checks pass or are not applicable', async () => {
    const data = adaptEvaluation({
      site_code_evaluation: {
        evaluations: [
          {
            check_title: 'Baseline preflight check',
            alignment: 'YES',
            reasoning: 'Site preflight is wired up.',
            suggestions: null,
            category: null,
          },
          {
            check_title: 'Cards block has valid structure',
            alignment: 'NA',
            reasoning: 'No cards block on the page.',
            suggestions: null,
            category: null,
          },
        ],
      },
    });
    const el = createGateElement();
    el._evaluate = async () => { el._data = data; };
    const cap = captureStatus();
    await el._handlePreflightRun({ paths: ['/org/site/a.html'], requestId: 'sitepass' });
    cap.stop();
    expect(cap.events).to.deep.equal([
      { path: '/org/site/a.html', status: 'success', requestId: 'sitepass' },
    ]);
  });

  it('passes adapted site-code findings to the shared preflight renderer', async () => {
    const data = adaptEvaluation({
      site_code_evaluation: {
        evaluations: [
          {
            check_title: 'All images have alt text',
            alignment: 'NO',
            reasoning: 'One image is missing alt text.',
            suggestions: 'Provide descriptive alt text.',
            category: null,
          },
        ],
      },
    });
    const el = createGateElement();
    el._evaluate = async () => { el._data = data; };
    document.body.appendChild(el);
    try {
      await el.updateComplete;
      const renderer = el.shadowRoot.querySelector('nx-page-eval');
      expect(renderer).to.exist;
      expect(renderer.data).to.equal(data);
      expect(renderer.data.sections[0].items[0].title).to.equal('All images have alt text');
      expect(renderer.data.sections[0].items[0].suggestion.suggested).to.equal('Provide descriptive alt text.');
    } finally {
      el.remove();
    }
  });

  it('reports fail when the evaluation errors', async () => {
    const el = stubEvaluate(createGateElement(), { error: 'boom' });
    const cap = captureStatus();
    await el._handlePreflightRun({ paths: ['/org/site/a.html'], requestId: 'g3' });
    cap.stop();
    expect(cap.events).to.deep.equal([{ path: '/org/site/a.html', status: 'fail', requestId: 'g3' }]);
  });

  it('reports cancelled when the tools panel closes before the run settles', async () => {
    const el = createGateElement();
    let release;
    el._evaluate = () => new Promise((resolve) => { release = resolve; });
    const running = el._handlePreflightRun({ paths: ['/org/site/a.html'], requestId: 'g4' });

    const cap = captureStatus();
    canvasBus.toolPanelViewState.emit(null);
    cap.stop();
    expect(cap.events).to.deep.equal([{ path: '/org/site/a.html', status: 'cancelled', requestId: 'g4' }]);

    // The late-settling evaluate must not emit a second (success) status.
    const cap2 = captureStatus();
    release();
    await running;
    cap2.stop();
    expect(cap2.events).to.deep.equal([]);
  });

  it('keeps the run going when another panel closes or the tool view switches', async () => {
    const el = createGateElement();
    let release;
    el._evaluate = () => new Promise((resolve) => {
      release = () => {
        el._error = null;
        el._data = { failed: 0 };
        resolve();
      };
    });
    const running = el._handlePreflightRun({ paths: ['/org/site/a.html'], requestId: 'g4b' });

    const cap = captureStatus();
    // Chat's close button: bubbles to document with no section.
    document.dispatchEvent(new CustomEvent('nx-panel-close', { bubbles: true, composed: true }));
    document.dispatchEvent(new CustomEvent('nx-panel-close', { detail: { section: 'chat' } }));
    // The tool panel re-broadcasts / switches view while still open.
    canvasBus.toolPanelViewState.emit('preflight');
    canvasBus.toolPanelViewState.emit('files');
    expect(cap.events).to.deep.equal([]);

    release();
    await running;
    cap.stop();
    expect(cap.events).to.deep.equal([{ path: '/org/site/a.html', status: 'success', requestId: 'g4b' }]);
  });

  it('_cancelGate emits cancelled for an in-flight gate (disconnect backstop)', () => {
    const el = createGateElement();
    el._gateRequestId = 'g5';
    el._gatePath = '/org/site/a.html';
    el._gateSettled = false;
    const cap = captureStatus();
    el._cancelGate();
    cap.stop();
    expect(cap.events).to.deep.equal([{ path: '/org/site/a.html', status: 'cancelled', requestId: 'g5' }]);
  });

  it('dedupes a repeated requestId — runs the gate once', async () => {
    const el = stubEvaluate(createGateElement(), { failed: 0 });
    const cap = captureStatus();
    await el._handlePreflightRun({ paths: ['/org/site/a.html'], requestId: 'g6' });
    await el._handlePreflightRun({ paths: ['/org/site/a.html'], requestId: 'g6' });
    cap.stop();
    expect(cap.events).to.have.lengthOf(1);
  });

  it('a non-gate refresh emits a requestId-less status at the derived doc path', async () => {
    const el = stubEvaluate(createGateElement(), { failed: 0 });
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

    const el = stubEvaluate(createGateElement(), { failed: 0 });
    const cap = captureStatus();
    document.body.appendChild(el);
    await tick();
    el.remove();
    cap.stop();

    const gateEvents = cap.events.filter((d) => d.requestId === 'g7');
    expect(gateEvents).to.deep.equal([{ path: '/org/site/a.html', status: 'success', requestId: 'g7' }]);
  });

  it('claims live and duplicate requests so a fresh instance does not replay them', async () => {
    const { initPreflightResponder, peekPendingPreflightRequest } = await import('../../../../../blocks/canvas/editor-utils/preflight-responder.js');
    initPreflightResponder();
    const el = stubEvaluate(createGateElement());
    const fresh = stubEvaluate(createGateElement());
    const detail = { paths: ['/org/site/a.html'], requestId: 'g8' };
    let cap;
    try {
      document.body.appendChild(el);
      await tick();
      cap = captureStatus();

      canvasBus.preflightRunRequest.emit(detail);
      expect(peekPendingPreflightRequest()).to.equal(null);
      await tick();

      canvasBus.preflightRunRequest.emit(detail);
      expect(peekPendingPreflightRequest()).to.equal(null);
      await tick();

      el.remove();
      document.body.appendChild(fresh);
      await tick();

      expect(cap.events.filter((d) => d.requestId)).to.deep.equal([
        { path: '/org/site/a.html', status: 'success', requestId: 'g8' },
      ]);
      expect(cap.events.filter((d) => !d.requestId)).to.have.lengthOf(1);
    } finally {
      el.remove();
      fresh.remove();
      cap?.stop();
      takePendingPreflightRequest();
    }
  });

  it('cancels a mismatched live request once without evaluating or replacing an active gate', async () => {
    hashChange._set({ ...GATE_PAGE, path: '/b' });
    const el = stubEvaluate(createGateElement());
    let evaluations = 0;
    let cap;
    try {
      document.body.appendChild(el);
      await tick();
      el._evaluate = async () => { evaluations += 1; };
      el._gateRequestId = 'active';
      el._gatePath = '/org/site/b.html';
      el._gateSettled = false;
      cap = captureStatus();

      const detail = { paths: ['/org/site/a.html'], requestId: 'mismatch' };
      canvasBus.preflightRunRequest.emit(detail);
      await tick();
      canvasBus.preflightRunRequest.emit(detail);
      await tick();

      expect(cap.events).to.deep.equal([
        { path: '/org/site/a.html', status: 'cancelled', requestId: 'mismatch' },
      ]);
      expect(evaluations).to.equal(0);
      expect(el._gateRequestId).to.equal('active');
      expect(el._gatePath).to.equal('/org/site/b.html');
      expect(el._gateSettled).to.equal(false);
      expect(takePendingPreflightRequest()).to.equal(null);
    } finally {
      cap?.stop();
      el.remove();
    }
  });

  it('cancels a gate without evaluating when no document context is available', async () => {
    const el = createGateElement();
    el._hashState = {};
    let evaluations = 0;
    el._evaluate = async () => { evaluations += 1; };
    const cap = captureStatus();
    try {
      await el._handlePreflightRun({ paths: ['/org/site/a.html'], requestId: 'no-page' });
      expect(cap.events).to.deep.equal([
        { path: '/org/site/a.html', status: 'cancelled', requestId: 'no-page' },
      ]);
      expect(evaluations).to.equal(0);
      expect(el._gateRequestId).to.equal(undefined);
    } finally {
      cap.stop();
      el._cancelGate();
    }
  });

  it('cancels a request parked before navigation instead of evaluating the new page for that gate', async () => {
    canvasBus.preflightRunRequest.emit({ paths: ['/org/site/a.html'], requestId: 'parked-a' });
    hashChange._set({ ...GATE_PAGE, path: '/b' });
    canvasBus.toolPanelViewState.emit('preflight');
    const el = createGateElement();
    const runs = [];
    el._evaluate = async () => {
      runs.push({ path: el._hashState.path, requestId: el._gateRequestId });
      el._data = { failed: 0 };
    };
    const cap = captureStatus();
    try {
      document.body.appendChild(el);
      await tick();
      expect(cap.events.filter((detail) => detail.requestId)).to.deep.equal([
        { path: '/org/site/a.html', status: 'cancelled', requestId: 'parked-a' },
      ]);
      expect(runs).to.deep.equal([{ path: '/b', requestId: undefined }]);
      expect(takePendingPreflightRequest()).to.equal(null);
    } finally {
      cap.stop();
      el.remove();
      canvasBus.toolPanelViewState.emit(null);
    }
  });
});

describe('ew-preflight document navigation', () => {
  let canvasBus;
  let hashChange;
  const PAGE_A = { org: 'o', site: 's', path: '/a' };
  const PAGE_B = { org: 'o', site: 's', path: '/b' };

  before(async () => {
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    await import('../../../../../blocks/canvas/ew-preflight/ew-preflight.js');
    ({ canvasBus } = await import('../../../../../blocks/canvas/utils/canvas-bus.js'));
    ({ hashChange } = await import(`${getNx()}/utils/utils.js`));
  });

  // Records which page each evaluation ran for; `hold` keeps the next run pending.
  // Mirrors the real _evaluate's runId guard against stale responses.
  function trackEvaluate(el) {
    const runs = [];
    el._evaluate = () => {
      const { path } = el._hashState;
      const runId = (el._runId ?? 0) + 1;
      el._runId = runId;
      el._loading = true;
      runs.push(path);
      return new Promise((resolve) => {
        const finish = () => {
          if (el._runId === runId) {
            el._loading = false;
            el._error = null;
            el._data = { failed: 0, path };
          }
          resolve();
        };
        if (el.hold) el.release = finish;
        else finish();
      });
    };
    return runs;
  }

  async function mount(view) {
    hashChange._set(PAGE_A);
    canvasBus.toolPanelViewState.emit(view);
    const el = document.createElement('ew-preflight');
    const runs = trackEvaluate(el);
    document.body.appendChild(el);
    await tick();
    return { el, runs };
  }

  it('evaluates exactly once on first mount with the view active', async () => {
    const { el, runs } = await mount('preflight');
    try {
      expect(runs).to.deep.equal(['/a']);
    } finally {
      el.remove();
    }
  });

  it('does not evaluate again when a gate already ran while the view was hidden', async () => {
    const { el, runs } = await mount('preflight');
    try {
      canvasBus.toolPanelViewState.emit('files');
      hashChange._set(PAGE_B);
      el.hold = true;
      const running = el._handlePreflightRun({ paths: ['/o/s/b.html'], requestId: 'nav2' });
      canvasBus.toolPanelViewState.emit('preflight');
      await tick();
      expect(runs).to.deep.equal(['/a', '/b']);
      el.release();
      await running;
      canvasBus.toolPanelViewState.emit('preflight');
      await tick();
      expect(runs).to.deep.equal(['/a', '/b']);
    } finally {
      el.remove();
    }
  });

  it('re-evaluates the new page when navigating while the view is active', async () => {
    const { el, runs } = await mount('preflight');
    try {
      hashChange._set(PAGE_B);
      await tick();
      expect(runs).to.deep.equal(['/a', '/b']);
      expect(el._data.path).to.equal('/b');
    } finally {
      el.remove();
    }
  });

  it('defers re-evaluation until the view is shown again', async () => {
    const { el, runs } = await mount('preflight');
    try {
      canvasBus.toolPanelViewState.emit('files');
      hashChange._set(PAGE_B);
      await tick();
      expect(runs).to.deep.equal(['/a']);
      expect(el._data).to.equal(null);

      canvasBus.toolPanelViewState.emit('preflight');
      await tick();
      expect(runs).to.deep.equal(['/a', '/b']);
    } finally {
      el.remove();
    }
  });

  it('ignores hash changes that keep the same page', async () => {
    const { el, runs } = await mount('preflight');
    try {
      hashChange._set({ ...PAGE_A });
      await tick();
      expect(runs).to.deep.equal(['/a']);
    } finally {
      el.remove();
    }
  });

  it('cancels a gate for the old page and drops its late result', async () => {
    const { el, runs } = await mount('preflight');
    try {
      el.hold = true;
      const running = el._handlePreflightRun({ paths: ['/o/s/a.html'], requestId: 'nav1' });
      const releaseOld = el.release;

      const cap = captureStatus();
      el.hold = false;
      hashChange._set(PAGE_B);
      await tick();
      releaseOld();
      await running;
      cap.stop();

      expect(runs).to.deep.equal(['/a', '/a', '/b']);
      expect(cap.events.filter((d) => d.requestId)).to.deep.equal([
        { path: '/o/s/a.html', status: 'cancelled', requestId: 'nav1' },
      ]);
      expect(el._data.path).to.equal('/b');
    } finally {
      el.remove();
    }
  });
});

describe('ew-preflight page URL', () => {
  let originalUrl;

  before(async () => {
    await import('../../../../../blocks/canvas/ew-preflight/ew-preflight.js');
  });

  beforeEach(() => { originalUrl = window.location.href; });
  afterEach(() => { window.history.replaceState(null, '', originalUrl); });

  it('evaluates the ?ref= branch instead of main', async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('ref', 'feat');
    window.history.replaceState(null, '', url);
    const el = createGateElement();
    const pageUrl = await el._resolvePageUrl();
    expect(pageUrl).to.match(/^https:\/\/feat--site--org\.[^/]+\/a$/);
  });
});
