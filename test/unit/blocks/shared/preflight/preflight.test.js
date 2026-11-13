/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { getNx, setNx } from '../../../../../scripts/utils.js';
import { createChannel } from '../../../../../blocks/shared/channel.js';
import { adaptEvaluation } from '../../../../../blocks/shared/preflight/evaluation.js';

const tick = () => new Promise((resolve) => { setTimeout(resolve, 20); });
const GATE_PAGE = { org: 'org', site: 'site', path: '/a' };

// Stands in for the page port of an editor. Like the tool panel of canvas, it replays
// the active view to new subscribers until the panel closes.
function createFakePage() {
  const activeView = createChannel({ replay: Boolean });
  return {
    activeView,
    subscribeActiveView: (listener) => activeView.subscribe(listener),
  };
}

// Stands in for the publishHook port of an editor. It parks each run request for a
// single page until a view claims it.
function createFakeHook() {
  const runRequests = createChannel();
  const statusListeners = new Set();
  let pending = null;
  return {
    get pending() {
      return pending;
    },
    requestRun(detail) {
      if (detail.requestId && detail.paths?.length === 1) {
        pending = { path: detail.paths[0], requestId: detail.requestId };
      }
      runRequests.emit(detail);
    },
    subscribeRunRequest: (handler) => runRequests.subscribe(handler),
    takePendingRunRequest(requestId) {
      if (requestId && pending?.requestId !== requestId) {
        return null;
      }

      const request = pending;
      pending = null;
      return request;
    },
    reportStatus: (detail) => statusListeners.forEach((listener) => listener(detail)),
    captureStatus() {
      const events = [];
      const listener = (detail) => { events.push(detail); };
      statusListeners.add(listener);
      return { events, stop: () => statusListeners.delete(listener) };
    },
  };
}

let page;
let evaluator;
let hook;

function useFakePorts() {
  page = createFakePage();
  // Tests that run the real evaluation set what the checks return.
  evaluator = { evaluate: async () => ({ failed: 0 }) };
  hook = createFakeHook();
}

const createPreflight = () => Object.assign(document.createElement('da-preflight'), {
  page,
  evaluator,
  publishHook: hook,
});

function createGateElement() {
  const el = createPreflight();
  el._hashState = GATE_PAGE;
  return el;
}

// These tests cover the hook wiring. The evaluator and the da-nx renderer
// (ensureRenderer) are external, so every element gets a stubbed `_evaluate` that sets
// `_data` or `_error` and resolves to the verdict of the run.
function stubEvaluate(el, { failed = 0, error = null } = {}) {
  el._evaluate = async () => {
    el._error = error;
    el._data = error ? undefined : { failed };
    return el._verdictFor({ data: el._data, error });
  };
  return el;
}

const captureStatus = () => hook.captureStatus();

describe('da-preflight publish hook', () => {
  let hashChange;

  before(async () => {
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    await import('../../../../../blocks/shared/preflight/preflight.js');
    ({ hashChange } = await import(`${getNx()}/utils/utils.js`));
  });

  beforeEach(() => {
    useFakePorts();
    hashChange._set(GATE_PAGE);
  });

  afterEach(() => {
    hashChange._set({});
  });

  it('uses the shared icon button and swaps refresh for a spinner while busy', () => {
    const el = createGateElement();
    const btn = el.getHeaderActions();
    expect(btn.matches('.nx-action-btn-icon.nx-btn-sm')).to.be.true;
    expect(btn.getAttribute('aria-label')).to.equal('Refresh evaluation');
    expect(btn.querySelector('svg use')).to.exist;
    expect(btn.disabled).to.be.false;

    el._setRefreshBusy(true);
    expect(btn.disabled).to.be.true;
    expect(btn.querySelector('.nx-loading-spinner')).to.exist;
    expect(btn.querySelector('svg')).to.be.null;

    el._setRefreshBusy(false);
    expect(btn.disabled).to.be.false;
    expect(btn.querySelector('.nx-loading-spinner')).to.be.null;
    expect(btn.querySelector('svg use')).to.exist;
    expect(el.getHeaderActions()).to.equal(btn);
  });

  it('shows shared spinners in the loading view and a header created during evaluation', async () => {
    const el = createGateElement();
    el._evaluate = async () => { el._loading = true; };
    document.body.appendChild(el);
    try {
      await el.updateComplete;
      expect(el.shadowRoot.querySelector('.ew-preflight-status .nx-loading-spinner')).to.exist;
      expect(el.shadowRoot.textContent).to.include('Evaluating page');
      const btn = el.getHeaderActions();
      expect(btn.disabled).to.be.true;
      expect(btn.querySelector('.nx-loading-spinner')).to.exist;
      expect(btn.querySelector('svg')).to.be.null;
    } finally {
      el.remove();
    }
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
    el._evaluate = async () => {
      el._data = data;
      return el._verdictFor({ data });
    };
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
    el._evaluate = async () => {
      el._data = data;
      return el._verdictFor({ data });
    };
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

  it('reports error with the cause when the evaluation errors', async () => {
    const el = stubEvaluate(createGateElement(), { error: 'boom' });
    const cap = captureStatus();
    await el._handlePreflightRun({ paths: ['/org/site/a.html'], requestId: 'g3' });
    cap.stop();
    expect(cap.events).to.deep.equal([{ path: '/org/site/a.html', status: 'error', requestId: 'g3', message: 'boom' }]);
  });

  it('a non-hook refresh reports error with the cause when the evaluation errors', async () => {
    const el = stubEvaluate(createGateElement(), { error: 'boom' });
    const cap = captureStatus();
    await el._evaluateAndReport();
    cap.stop();
    expect(cap.events).to.deep.equal([{ path: '/org/site/a.html', status: 'error', message: 'boom' }]);
  });

  it('reports cancelled when the tools panel closes before the run settles', async () => {
    const el = createGateElement();
    let release;
    el._evaluate = () => new Promise((resolve) => { release = resolve; });
    const running = el._handlePreflightRun({ paths: ['/org/site/a.html'], requestId: 'g4' });

    const cap = captureStatus();
    page.activeView.emit(null);
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
        resolve(el._verdictFor({ data: el._data }));
      };
    });
    const running = el._handlePreflightRun({ paths: ['/org/site/a.html'], requestId: 'g4b' });

    const cap = captureStatus();
    // Chat's close button: bubbles to document with no section.
    document.dispatchEvent(new CustomEvent('nx-panel-close', { bubbles: true, composed: true }));
    document.dispatchEvent(new CustomEvent('nx-panel-close', { detail: { section: 'chat' } }));
    // The tool panel re-broadcasts / switches view while still open.
    page.activeView.emit('preflight');
    page.activeView.emit('files');
    expect(cap.events).to.deep.equal([]);

    release();
    await running;
    cap.stop();
    expect(cap.events).to.deep.equal([{ path: '/org/site/a.html', status: 'success', requestId: 'g4b' }]);
  });

  it('_cancelGate emits cancelled for an in-flight hook (disconnect backstop)', () => {
    const el = createGateElement();
    el._gateRequestId = 'g5';
    el._gatePath = '/org/site/a.html';
    el._gateSettled = false;
    const cap = captureStatus();
    el._cancelGate();
    cap.stop();
    expect(cap.events).to.deep.equal([{ path: '/org/site/a.html', status: 'cancelled', requestId: 'g5' }]);
  });

  it('dedupes a repeated requestId — runs the hook once', async () => {
    const el = stubEvaluate(createGateElement(), { failed: 0 });
    const cap = captureStatus();
    await el._handlePreflightRun({ paths: ['/org/site/a.html'], requestId: 'g6' });
    await el._handlePreflightRun({ paths: ['/org/site/a.html'], requestId: 'g6' });
    cap.stop();
    expect(cap.events).to.have.lengthOf(1);
  });

  it('settles overlapping gates only with their own run result', async () => {
    const el = createGateElement();
    const finishers = [];
    // Mirrors the real _evaluate's contract: a superseded run resolves to null.
    el._evaluate = () => {
      const runId = (el._runId ?? 0) + 1;
      el._runId = runId;
      return new Promise((resolve) => {
        finishers.push((data) => {
          if (el._runId !== runId) {
            resolve(null);
            return;
          }
          el._data = data;
          resolve(el._verdictFor({ data }));
        });
      });
    };
    // A passing result from an earlier evaluation of this page.
    el._data = { failed: 0 };
    const cap = captureStatus();
    try {
      const runA = el._handlePreflightRun({ paths: ['/org/site/a.html'], requestId: 'A' });
      const runB = el._handlePreflightRun({ paths: ['/org/site/a.html'], requestId: 'B' });
      expect(cap.events).to.deep.equal([
        { path: '/org/site/a.html', status: 'cancelled', requestId: 'A' },
      ]);

      finishers[0]({ failed: 0 });
      await runA;
      expect(cap.events).to.have.lengthOf(1);

      finishers[1]({ failed: 2 });
      await runB;
      expect(cap.events).to.deep.equal([
        { path: '/org/site/a.html', status: 'cancelled', requestId: 'A' },
        { path: '/org/site/a.html', status: 'fail', requestId: 'B' },
      ]);
    } finally {
      cap.stop();
    }
  });

  it('shows the error instead of earlier results when a later run fails', async () => {
    const el = createGateElement();
    evaluator.evaluate = async () => { throw new Error('down'); };
    el._data = { failed: 0 };
    const verdict = await el._evaluate();
    expect(verdict.status).to.equal('error');
    expect(el._data).to.equal(null);
    expect(el.render().strings.join('')).to.contain('ew-preflight-retry');
  });

  it('a non-hook refresh emits a requestId-less status at the derived doc path', async () => {
    const el = stubEvaluate(createGateElement(), { failed: 0 });
    el._hashState = { org: 'o', site: 's', path: '/p' };
    const cap = captureStatus();
    await el._evaluateAndReport();
    cap.stop();
    expect(cap.events).to.deep.equal([{ path: '/o/s/p.html', status: 'success' }]);
  });

  it('runs the hook once on first open via the parked pending request', async () => {
    // A run that fires before the panel mounts is parked, not delivered live.
    hook.requestRun({ paths: ['/org/site/a.html'], requestId: 'g7' });
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
    const el = stubEvaluate(createGateElement());
    const fresh = stubEvaluate(createGateElement());
    const detail = { paths: ['/org/site/a.html'], requestId: 'g8' };
    let cap;
    try {
      document.body.appendChild(el);
      await tick();
      cap = captureStatus();

      hook.requestRun(detail);
      expect(hook.pending).to.equal(null);
      await tick();

      hook.requestRun(detail);
      expect(hook.pending).to.equal(null);
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
    }
  });

  it('cancels a mismatched live request once without evaluating or replacing an active hook', async () => {
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
      hook.requestRun(detail);
      await tick();
      hook.requestRun(detail);
      await tick();

      expect(cap.events).to.deep.equal([
        { path: '/org/site/a.html', status: 'cancelled', requestId: 'mismatch' },
      ]);
      expect(evaluations).to.equal(0);
      expect(el._gateRequestId).to.equal('active');
      expect(el._gatePath).to.equal('/org/site/b.html');
      expect(el._gateSettled).to.equal(false);
      expect(hook.pending).to.equal(null);
    } finally {
      cap?.stop();
      el.remove();
    }
  });

  it('cancels a hook without evaluating when no document context is available', async () => {
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

  it('cancels a request parked before navigation instead of evaluating the new page for that hook', async () => {
    hook.requestRun({ paths: ['/org/site/a.html'], requestId: 'parked-a' });
    hashChange._set({ ...GATE_PAGE, path: '/b' });
    page.activeView.emit('preflight');
    const el = createGateElement();
    const runs = [];
    el._evaluate = async () => {
      runs.push({ path: el._hashState.path, requestId: el._gateRequestId });
      el._data = { failed: 0 };
      return el._verdictFor({ data: el._data });
    };
    const cap = captureStatus();
    try {
      document.body.appendChild(el);
      await tick();
      expect(cap.events.filter((detail) => detail.requestId)).to.deep.equal([
        { path: '/org/site/a.html', status: 'cancelled', requestId: 'parked-a' },
      ]);
      expect(runs).to.deep.equal([{ path: '/b', requestId: undefined }]);
      expect(hook.pending).to.equal(null);
    } finally {
      cap.stop();
      el.remove();
    }
  });
});

describe('da-preflight document navigation', () => {
  let hashChange;
  const PAGE_A = { org: 'o', site: 's', path: '/a' };
  const PAGE_B = { org: 'o', site: 's', path: '/b' };

  before(async () => {
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    await import('../../../../../blocks/shared/preflight/preflight.js');
    ({ hashChange } = await import(`${getNx()}/utils/utils.js`));
  });

  beforeEach(useFakePorts);

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
          if (el._runId !== runId) {
            resolve(null);
            return;
          }
          el._loading = false;
          el._error = null;
          el._data = { failed: 0, path };
          resolve(el._verdictFor({ data: el._data }));
        };
        if (el.hold) el.release = finish;
        else finish();
      });
    };
    return runs;
  }

  async function mount(view) {
    hashChange._set(PAGE_A);
    page.activeView.emit(view);
    const el = createPreflight();
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

  it('does not evaluate again when a hook already ran while the view was hidden', async () => {
    const { el, runs } = await mount('preflight');
    try {
      page.activeView.emit('files');
      hashChange._set(PAGE_B);
      el.hold = true;
      const running = el._handlePreflightRun({ paths: ['/o/s/b.html'], requestId: 'nav2' });
      page.activeView.emit('preflight');
      await tick();
      expect(runs).to.deep.equal(['/a', '/b']);
      el.release();
      await running;
      page.activeView.emit('preflight');
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
      page.activeView.emit('files');
      hashChange._set(PAGE_B);
      await tick();
      expect(runs).to.deep.equal(['/a']);
      expect(el._data).to.equal(null);

      page.activeView.emit('preflight');
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

  it('cancels a hook for the old page and drops its late result', async () => {
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

describe('da-preflight evaluation', () => {
  before(async () => {
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    await import('../../../../../blocks/shared/preflight/preflight.js');
  });

  beforeEach(useFakePorts);

  it('checks the open page with the evaluator', async () => {
    const targets = [];
    const data = { failed: 0, sections: [] };
    evaluator.evaluate = async (target) => {
      targets.push(target);
      return data;
    };
    const el = createGateElement();
    expect(await el._evaluate()).to.deep.equal({ status: 'success' });
    expect(targets).to.deep.equal([
      { org: 'org', site: 'site', path: '/a', fullpath: '/org/site/a.html' },
    ]);
    expect(el._data).to.equal(data);
  });

  it('reports fail when a check failed', async () => {
    evaluator.evaluate = async () => ({ failed: 2 });
    expect(await createGateElement()._evaluate()).to.deep.equal({ status: 'fail' });
  });

  it('reports the reason when the checks cannot run', async () => {
    evaluator.evaluate = async () => {
      throw Object.assign(new Error('Branch not resolved'), { detail: 'No preview branch.' });
    };
    const el = createGateElement();
    expect(await el._evaluate()).to.deep.equal({ status: 'error', message: 'No preview branch.' });
    expect(el._error).to.equal('No preview branch.');
  });

  it('reports a generic reason when the error has no detail', async () => {
    evaluator.evaluate = async () => {
      throw new Error('boom');
    };
    expect(await createGateElement()._evaluate()).to.deep.equal({
      status: 'error',
      message: 'Could not evaluate the page. Try again.',
    });
  });

  it('drops the result of a run that a newer run superseded', async () => {
    const releases = [];
    evaluator.evaluate = () => new Promise((resolve) => { releases.push(resolve); });
    const el = createGateElement();
    const older = el._evaluate();
    const newer = el._evaluate();
    releases[1]({ failed: 0 });
    releases[0]({ failed: 3 });
    expect(await older).to.equal(null);
    expect(await newer).to.deep.equal({ status: 'success' });
    expect(el._data).to.deep.equal({ failed: 0 });
  });

  it('skips the evaluator when no page is open', async () => {
    let calls = 0;
    evaluator.evaluate = async () => {
      calls += 1;
      return { failed: 0 };
    };
    const el = createGateElement();
    el._hashState = {};
    expect(await el._evaluate()).to.deep.equal({ status: 'error', message: 'No page is open.' });
    expect(calls).to.equal(0);
  });
});

describe('da-preflight without a publish hook', () => {
  let hashChange;

  before(async () => {
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    await import('../../../../../blocks/shared/preflight/preflight.js');
    ({ hashChange } = await import(`${getNx()}/utils/utils.js`));
  });

  beforeEach(() => {
    useFakePorts();
    hashChange._set(GATE_PAGE);
  });

  afterEach(() => {
    hashChange._set({});
  });

  // Mounts Preflight without a publish hook. Each evaluation records its page.
  async function mountWithoutGate() {
    const el = Object.assign(document.createElement('da-preflight'), { page, evaluator });
    const runs = [];
    el._evaluate = async () => {
      runs.push(el._hashState.path);
      el._data = { failed: 0 };
      return el._verdictFor({ data: el._data });
    };
    document.body.appendChild(el);
    await tick();
    return { el, runs };
  }

  it('evaluates on first open and shows the results', async () => {
    const { el, runs } = await mountWithoutGate();
    try {
      expect(el.publishHook).to.equal(undefined);
      expect(runs).to.deep.equal(['/a']);
      expect(el.shadowRoot.querySelector('nx-page-eval')).to.exist;
    } finally {
      el.remove();
    }
  });

  it('evaluates a new page once the view is shown again', async () => {
    const { el, runs } = await mountWithoutGate();
    try {
      page.activeView.emit('files');
      hashChange._set({ ...GATE_PAGE, path: '/b' });
      await tick();
      expect(runs).to.deep.equal(['/a']);

      page.activeView.emit('preflight');
      await tick();
      expect(runs).to.deep.equal(['/a', '/b']);
    } finally {
      el.remove();
    }
  });

  it('refreshes from the header with no hook to report to', async () => {
    const { el, runs } = await mountWithoutGate();
    try {
      el.getHeaderActions().click();
      await tick();
      expect(runs).to.deep.equal(['/a', '/a']);
      // Awaited directly so a failing report would reject here.
      await el._evaluateAndReport();
      expect(runs).to.deep.equal(['/a', '/a', '/a']);
    } finally {
      el.remove();
    }
  });
});
