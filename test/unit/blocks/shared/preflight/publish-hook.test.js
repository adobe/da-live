/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { getNx, setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const tick = () => new Promise((resolve) => { setTimeout(resolve, 20); });

const RUN = 'nx-preflight-run';
const STATUS = 'nx-preflight-status';
const PANEL_OPEN = 'nx-panel-open';
const PAGE_PATH = '/org/site/a.html';

const requestRun = (detail) => document.dispatchEvent(new CustomEvent(RUN, { detail }));

// Records the detail of each event of one type that reaches the document.
function captureEvents(type) {
  const events = [];
  const listener = (event) => { events.push(event.detail); };
  document.addEventListener(type, listener);
  return { events, stop: () => document.removeEventListener(type, listener) };
}

describe('createPublishHook', () => {
  let createPublishHook;
  let hook;
  let stop;

  before(async () => {
    ({ default: createPublishHook } = await import('../../../../../blocks/shared/preflight/publish-hook.js'));
  });

  beforeEach(() => {
    hook = createPublishHook();
    stop = hook.start();
  });

  afterEach(() => stop());

  it('parks a request and opens Preflight while the view is closed', () => {
    const opened = captureEvents(PANEL_OPEN);
    requestRun({ paths: [PAGE_PATH], requestId: 'run-1' });
    opened.stop();
    expect(opened.events).to.deep.equal([{ section: 'tools', id: 'preflight' }]);
    expect(hook.takePendingRunRequest('run-1')).to.deep.equal({ path: PAGE_PATH, requestId: 'run-1' });
  });

  it('hands the parked request out once', () => {
    requestRun({ paths: [PAGE_PATH], requestId: 'run-2' });
    expect(hook.takePendingRunRequest()).to.deep.equal({ path: PAGE_PATH, requestId: 'run-2' });
    expect(hook.takePendingRunRequest()).to.equal(null);
  });

  it('claims only the matching requestId without discarding a newer request', () => {
    requestRun({ paths: [PAGE_PATH], requestId: 'older' });
    requestRun({ paths: ['/org/site/b.html'], requestId: 'newer' });
    expect(hook.takePendingRunRequest('older')).to.equal(null);
    expect(hook.takePendingRunRequest('newer')).to.deep.equal({ path: '/org/site/b.html', requestId: 'newer' });
    expect(hook.takePendingRunRequest()).to.equal(null);
  });

  it('ignores runs without a requestId or for several pages', () => {
    const opened = captureEvents(PANEL_OPEN);
    requestRun({ paths: [PAGE_PATH] });
    requestRun({ paths: ['/org/site/a.html', '/org/site/b.html'], requestId: 'run-3' });
    requestRun();
    opened.stop();
    expect(opened.events).to.deep.equal([]);
    expect(hook.takePendingRunRequest()).to.equal(null);
  });

  it('passes each run request on to subscribers until they unsubscribe', () => {
    const received = [];
    const unsubscribe = hook.subscribeRunRequest((detail) => received.push(detail));
    const first = { paths: [PAGE_PATH], requestId: 'run-4' };
    requestRun(first);
    unsubscribe();
    requestRun({ paths: [PAGE_PATH], requestId: 'run-5' });
    expect(received).to.deep.equal([first]);
  });

  it('parks a request before subscribers hear it', () => {
    const claimed = [];
    hook.subscribeRunRequest(({ requestId }) => {
      claimed.push(hook.takePendingRunRequest(requestId));
    });
    requestRun({ paths: [PAGE_PATH], requestId: 'run-6' });
    expect(claimed).to.deep.equal([{ path: PAGE_PATH, requestId: 'run-6' }]);
  });

  it('reports a verdict on the document', () => {
    const reported = captureEvents(STATUS);
    hook.reportStatus({ path: PAGE_PATH, status: 'cancelled', requestId: 'run-7' });
    reported.stop();
    expect(reported.events).to.deep.equal([{ path: PAGE_PATH, status: 'cancelled', requestId: 'run-7' }]);
  });

  it('listens once even when started twice', () => {
    const stopAgain = hook.start();
    const opened = captureEvents(PANEL_OPEN);
    requestRun({ paths: [PAGE_PATH], requestId: 'run-8' });
    opened.stop();
    stopAgain();
    expect(opened.events).to.have.lengthOf(1);
  });

  it('stops listening once stopped', () => {
    stop();
    const opened = captureEvents(PANEL_OPEN);
    requestRun({ paths: [PAGE_PATH], requestId: 'run-9' });
    opened.stop();
    expect(opened.events).to.deep.equal([]);
    expect(hook.takePendingRunRequest()).to.equal(null);
  });
});

describe('createPublishHook with Preflight', () => {
  let createPublishHook;
  let hashChange;
  let hook;
  let stop;

  before(async () => {
    ({ default: createPublishHook } = await import('../../../../../blocks/shared/preflight/publish-hook.js'));
    await import('../../../../../blocks/shared/preflight/preflight.js');
    ({ hashChange } = await import(`${getNx()}/utils/utils.js`));
  });

  beforeEach(() => {
    hook = createPublishHook();
    stop = hook.start();
    hashChange._set({ org: 'org', site: 'site', path: '/a' });
  });

  afterEach(() => {
    stop();
    hashChange._set({});
  });

  // Preflight wired to the hook the way a tool panel loads it.
  function createPreflight(evaluate) {
    return Object.assign(document.createElement('da-preflight'), {
      page: { subscribeActiveView: () => () => {} },
      evaluator: { evaluate },
      publishHook: hook,
    });
  }

  it('lets Preflight claim a request parked before it mounts', async () => {
    let evaluations = 0;
    const el = createPreflight(async () => {
      evaluations += 1;
      return { failed: 0 };
    });
    const reported = captureEvents(STATUS);
    try {
      requestRun({ paths: [PAGE_PATH], requestId: 'h1' });
      document.body.append(el);
      await tick();
      expect(hook.takePendingRunRequest()).to.equal(null);
      expect(evaluations).to.equal(1);
      expect(reported.events).to.deep.equal([{ path: PAGE_PATH, status: 'success', requestId: 'h1' }]);
    } finally {
      reported.stop();
      el.remove();
    }
  });

  it('lets a mounted Preflight claim a live request', async () => {
    const el = createPreflight(async () => ({ failed: 2 }));
    let reported;
    try {
      document.body.append(el);
      await tick();
      reported = captureEvents(STATUS);
      requestRun({ paths: [PAGE_PATH], requestId: 'h2' });
      expect(hook.takePendingRunRequest()).to.equal(null);
      await tick();
      expect(reported.events).to.deep.equal([{ path: PAGE_PATH, status: 'fail', requestId: 'h2' }]);
    } finally {
      reported?.stop();
      el.remove();
    }
  });
});
