/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { getNx, setNx } from '../../../../../scripts/utils.js';
import { adaptEvaluation } from '../../../../../blocks/shared/preflight/evaluation.js';

const tick = () => new Promise((resolve) => { setTimeout(resolve, 20); });
const GATE_PAGE = { org: 'org', site: 'site', path: '/a' };

const RUN = 'nx-preflight-run';
const STATUS = 'nx-preflight-status';

// The da-nx panel registry fixture and the shared publish hook, as Preflight loads them.
let panel;
let publishHook;
let stopPublishHook;
let checkPage;

before(async () => {
  setNx('/test/fixtures/nx', { hostname: 'example.com' });
  panel = await import(`${getNx()}/utils/panel.js`);
  ({ publishHook } = await import('../../../../../blocks/shared/preflight/publish-hook.js'));
});

// Each test starts with the tools panel closed. An editor that publishes starts the hook.
function setUpPage({ publishing = true } = {}) {
  panel.setVisiblePanelSections([]);
  stopPublishHook = publishing ? publishHook.start() : null;
  // Stands in for the checks of the open page. Tests that evaluate set what they return.
  checkPage = async () => ({ failed: 0 });
}

afterEach(() => {
  stopPublishHook?.();
  stopPublishHook = null;
  panel.setVisiblePanelSections([]);
});

const openToolsPanel = () => panel.setVisiblePanelSections(['tools']);
const closeToolsPanel = () => panel.setVisiblePanelSections([]);
const requestRun = (detail) => document.dispatchEvent(new CustomEvent(RUN, { detail }));
const takeParkedRequest = () => publishHook.takePendingRunRequest();

function createPreflight() {
  const el = document.createElement('da-preflight');
  el._checkPage = (target) => checkPage(target);
  return el;
}

function createGateElement() {
  const el = createPreflight();
  el._hashState = GATE_PAGE;
  return el;
}

// These tests cover the hook wiring. The checks and the da-nx renderer
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

// Records each verdict Preflight reports to the publish dialog.
function captureStatus() {
  const events = [];
  const listener = (event) => { events.push(event.detail); };
  document.addEventListener(STATUS, listener);
  return { events, stop: () => document.removeEventListener(STATUS, listener) };
}

describe('da-preflight publish hook', () => {
  let hashChange;

  before(async () => {
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    await import('../../../../../blocks/shared/preflight/preflight.js');
    ({ hashChange } = await import(`${getNx()}/utils/utils.js`));
  });

  beforeEach(() => {
    setUpPage();
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
    openToolsPanel();
    const el = stubEvaluate(createGateElement());
    document.body.appendChild(el);
    try {
      await tick();
      let release;
      el._evaluate = () => new Promise((resolve) => { release = resolve; });
      const running = el._handlePreflightRun({ paths: ['/org/site/a.html'], requestId: 'g4' });

      const cap = captureStatus();
      closeToolsPanel();
      cap.stop();
      expect(cap.events).to.deep.equal([{ path: '/org/site/a.html', status: 'cancelled', requestId: 'g4' }]);

      // The late-settling evaluate must not emit a second (success) status.
      const cap2 = captureStatus();
      release();
      await running;
      cap2.stop();
      expect(cap2.events).to.deep.equal([]);
    } finally {
      el.remove();
    }
  });

  it('keeps the run going when another panel closes or the tool view switches', async () => {
    panel.setVisiblePanelSections(['chat', 'tools']);
    const el = stubEvaluate(createGateElement());
    document.body.appendChild(el);
    try {
      await tick();
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
      // Chat closes while the tools panel stays open, then the author switches views.
      panel.setVisiblePanelSections(['tools']);
      el.hidden = true;
      await el.updateComplete;
      expect(cap.events).to.deep.equal([]);

      release();
      await running;
      cap.stop();
      expect(cap.events).to.deep.equal([{ path: '/org/site/a.html', status: 'success', requestId: 'g4b' }]);
    } finally {
      el.remove();
    }
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
    checkPage = async () => { throw new Error('down'); };
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
    requestRun({ paths: ['/org/site/a.html'], requestId: 'g7' });
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

      requestRun(detail);
      expect(takeParkedRequest()).to.equal(null);
      await tick();

      requestRun(detail);
      expect(takeParkedRequest()).to.equal(null);
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
      requestRun(detail);
      await tick();
      requestRun(detail);
      await tick();

      expect(cap.events).to.deep.equal([
        { path: '/org/site/a.html', status: 'cancelled', requestId: 'mismatch' },
      ]);
      expect(evaluations).to.equal(0);
      expect(el._gateRequestId).to.equal('active');
      expect(el._gatePath).to.equal('/org/site/b.html');
      expect(el._gateSettled).to.equal(false);
      expect(takeParkedRequest()).to.equal(null);
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
    requestRun({ paths: ['/org/site/a.html'], requestId: 'parked-a' });
    hashChange._set({ ...GATE_PAGE, path: '/b' });
    openToolsPanel();
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
      expect(takeParkedRequest()).to.equal(null);
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

  beforeEach(() => setUpPage());

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

  async function mount() {
    hashChange._set(PAGE_A);
    openToolsPanel();
    const el = createPreflight();
    const runs = trackEvaluate(el);
    document.body.appendChild(el);
    await tick();
    return { el, runs };
  }

  it('evaluates exactly once on first mount with the view active', async () => {
    const { el, runs } = await mount();
    try {
      expect(runs).to.deep.equal(['/a']);
    } finally {
      el.remove();
    }
  });

  it('does not evaluate again when a hook already ran while the view was hidden', async () => {
    const { el, runs } = await mount();
    try {
      el.hidden = true;
      hashChange._set(PAGE_B);
      el.hold = true;
      const running = el._handlePreflightRun({ paths: ['/o/s/b.html'], requestId: 'nav2' });
      el.hidden = false;
      await tick();
      expect(runs).to.deep.equal(['/a', '/b']);
      el.release();
      await running;
      el.hidden = false;
      await tick();
      expect(runs).to.deep.equal(['/a', '/b']);
    } finally {
      el.remove();
    }
  });

  it('re-evaluates the new page when navigating while the view is active', async () => {
    const { el, runs } = await mount();
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
    const { el, runs } = await mount();
    try {
      el.hidden = true;
      hashChange._set(PAGE_B);
      await tick();
      expect(runs).to.deep.equal(['/a']);
      expect(el._data).to.equal(null);

      el.hidden = false;
      await tick();
      expect(runs).to.deep.equal(['/a', '/b']);
    } finally {
      el.remove();
    }
  });

  it('defers re-evaluation until the tools panel opens again', async () => {
    const { el, runs } = await mount();
    try {
      closeToolsPanel();
      hashChange._set(PAGE_B);
      await tick();
      expect(runs).to.deep.equal(['/a']);

      openToolsPanel();
      await tick();
      expect(runs).to.deep.equal(['/a', '/b']);
    } finally {
      el.remove();
    }
  });

  it('ignores hash changes that keep the same page', async () => {
    const { el, runs } = await mount();
    try {
      hashChange._set({ ...PAGE_A });
      await tick();
      expect(runs).to.deep.equal(['/a']);
    } finally {
      el.remove();
    }
  });

  it('cancels a hook for the old page and drops its late result', async () => {
    const { el, runs } = await mount();
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

  beforeEach(() => setUpPage());

  it('checks the open page', async () => {
    const targets = [];
    const data = { failed: 0, sections: [] };
    checkPage = async (target) => {
      targets.push(target);
      return data;
    };
    const el = createGateElement();
    expect(await el._evaluate()).to.deep.equal({ status: 'success' });
    expect(targets).to.deep.equal([{ org: 'org', site: 'site', path: '/a' }]);
    expect(el._data).to.equal(data);
  });

  it('reports fail when a check failed', async () => {
    checkPage = async () => ({ failed: 2 });
    expect(await createGateElement()._evaluate()).to.deep.equal({ status: 'fail' });
  });

  it('reports the reason when the checks cannot run', async () => {
    checkPage = async () => {
      throw Object.assign(new Error('Branch not resolved'), { detail: 'No preview branch.' });
    };
    const el = createGateElement();
    expect(await el._evaluate()).to.deep.equal({ status: 'error', message: 'No preview branch.' });
    expect(el._error).to.equal('No preview branch.');
  });

  it('reports a generic reason when the error has no detail', async () => {
    checkPage = async () => {
      throw new Error('boom');
    };
    expect(await createGateElement()._evaluate()).to.deep.equal({
      status: 'error',
      message: 'Could not evaluate the page. Try again.',
    });
  });

  it('drops the result of a run that a newer run superseded', async () => {
    const releases = [];
    checkPage = () => new Promise((resolve) => { releases.push(resolve); });
    const el = createGateElement();
    const older = el._evaluate();
    const newer = el._evaluate();
    releases[1]({ failed: 0 });
    releases[0]({ failed: 3 });
    expect(await older).to.equal(null);
    expect(await newer).to.deep.equal({ status: 'success' });
    expect(el._data).to.deep.equal({ failed: 0 });
  });

  it('skips the checks when no page is open', async () => {
    let calls = 0;
    checkPage = async () => {
      calls += 1;
      return { failed: 0 };
    };
    const el = createGateElement();
    el._hashState = {};
    expect(await el._evaluate()).to.deep.equal({ status: 'error', message: 'No page is open.' });
    expect(calls).to.equal(0);
  });
});

describe('da-preflight page checks', () => {
  const PAGE = { org: 'org', site: 'site', path: '/a' };
  let saved;
  let checkedUrls;
  let respond;
  let respondToConfig;

  before(async () => {
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    await import('../../../../../blocks/shared/preflight/preflight.js');
  });

  // An author opens a branch with `?ref`.
  function setSearch(search) {
    const url = new URL(window.location.href);
    url.search = search;
    window.history.replaceState(null, '', url);
  }

  beforeEach(() => {
    saved = {
      fetch: window.fetch,
      ims: window.adobeIMS,
      nxIms: localStorage.getItem('nx-ims'),
      search: window.location.search,
    };
    localStorage.setItem('nx-ims', 'true');
    window.adobeIMS = { getAccessToken: () => ({ token: 'tok' }) };
    checkedUrls = [];
    respond = () => new Response('{}', { status: 200 });
    // The site configures no preview branch unless a test says otherwise.
    respondToConfig = () => new Response(JSON.stringify({ data: [] }), { status: 200 });
    window.fetch = async (url, init) => {
      if (!String(url).endsWith('/api/v0/evaluate/page')) {
        return respondToConfig();
      }

      checkedUrls.push(JSON.parse(init.body).url);
      return respond();
    };
  });

  afterEach(() => {
    window.fetch = saved.fetch;
    window.adobeIMS = saved.ims;
    if (saved.nxIms === null) {
      localStorage.removeItem('nx-ims');
    } else {
      localStorage.setItem('nx-ims', saved.nxIms);
    }
    setSearch(saved.search);
  });

  const createChecked = () => document.createElement('da-preflight');

  it('checks the preview of the page on the branch the author opened', async () => {
    setSearch('?ref=Feat/One');
    await createChecked()._checkPage(PAGE);
    expect(checkedUrls).to.have.lengthOf(1);
    expect(checkedUrls[0]).to.match(/^https:\/\/feat-one--site--org\.[^/]+\/a$/);
  });

  it('checks the preview on the branch the site configures for the page', async () => {
    // A site of its own, because a loaded config stays cached.
    const data = [{ key: 'ew.wysiwygBranch', value: '/cfg-org/cfg-site/a=feature' }];
    respondToConfig = () => new Response(JSON.stringify({ data }), { status: 200 });
    await createChecked()._checkPage({ org: 'cfg-org', site: 'cfg-site', path: '/a' });
    expect(checkedUrls[0]).to.match(/^https:\/\/feature--cfg-site--cfg-org\.[^/]+\/a$/);
  });

  it('checks the site root when no page path is open', async () => {
    await createChecked()._checkPage({ org: 'org', site: 'site' });
    expect(checkedUrls[0]).to.match(/^https:\/\/main--site--org\.[^/]+$/);
  });

  it('resolves to the renderer data of the response', async () => {
    const response = {
      site_code_evaluation: {
        evaluations: [{
          check_title: 'Page has exactly one H1',
          alignment: 'NO',
          reasoning: 'No H1 heading found.',
          suggestions: null,
          category: null,
        }],
      },
    };
    respond = () => new Response(JSON.stringify(response), { status: 200 });
    const data = await createChecked()._checkPage(PAGE);
    expect(data).to.deep.equal(adaptEvaluation(response));
    expect(data.failed).to.equal(1);
  });

  it('rejects with the reason instead of guessing a branch', async () => {
    // A site of its own, because a failed lookup stays cached.
    respondToConfig = () => Promise.reject(new TypeError('Failed to fetch'));
    const offline = { org: 'offline-org', site: 'site', path: '/a' };
    const error = await createChecked()._checkPage(offline).catch((e) => e);
    expect(error).to.be.instanceOf(Error);
    expect(error.detail).to.contain('preview branch');
    expect(checkedUrls).to.deep.equal([]);
  });

  it('rejects with the reason of the API when the checks cannot run', async () => {
    respond = () => new Response(JSON.stringify({ detail: 'Page not found' }), { status: 404 });
    const error = await createChecked()._checkPage(PAGE).catch((e) => e);
    expect(error.detail).to.equal('Page not found (404)');
  });
});

describe('da-preflight without publishing', () => {
  let hashChange;

  before(async () => {
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    await import('../../../../../blocks/shared/preflight/preflight.js');
    ({ hashChange } = await import(`${getNx()}/utils/utils.js`));
  });

  beforeEach(() => {
    setUpPage({ publishing: false });
    hashChange._set(GATE_PAGE);
    openToolsPanel();
  });

  afterEach(() => {
    hashChange._set({});
  });

  // Mounts Preflight in an editor that never starts the publish hook. Each evaluation
  // records its page.
  async function mountWithoutGate() {
    const el = document.createElement('da-preflight');
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
      expect(runs).to.deep.equal(['/a']);
      expect(el.shadowRoot.querySelector('nx-page-eval')).to.exist;
    } finally {
      el.remove();
    }
  });

  it('evaluates a new page once the view is shown again', async () => {
    const { el, runs } = await mountWithoutGate();
    try {
      el.hidden = true;
      hashChange._set({ ...GATE_PAGE, path: '/b' });
      await tick();
      expect(runs).to.deep.equal(['/a']);

      el.hidden = false;
      await tick();
      expect(runs).to.deep.equal(['/a', '/b']);
    } finally {
      el.remove();
    }
  });

  it('refreshes from the header when nothing publishes', async () => {
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
