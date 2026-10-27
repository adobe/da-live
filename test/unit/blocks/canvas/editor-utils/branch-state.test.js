import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setNx, getNx2Api } from '../../../../../scripts/utils.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let resolveCanvasBranch;
let fetchWysiwygBranch;
let initBranchBridge;
let config;
let seq = 0;

before(async () => {
  ({ resolveCanvasBranch } = await import('../../../../../blocks/canvas/editor-utils/branch-state.js'));
  ({ fetchWysiwygBranch } = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js'));
  ({ initBranchBridge } = await import('../../../../../blocks/canvas/editor-utils/branch-bridge.js'));
  ({ config } = await getNx2Api());
});

describe('authoritative canvas branch', () => {
  let ctx;
  let get;
  let unsubscribe;
  let originalHref;
  const sheet = (data) => new Response(JSON.stringify({ data }));
  const request = (path) => document.dispatchEvent(new CustomEvent('nx-branch-request', { detail: { path } }));

  beforeEach(() => {
    seq += 1;
    ctx = { org: `branch-org-${seq}`, repo: 'site', path: `branch-org-${seq}/site/docs/page` };
    originalHref = window.location.href;
    window.history.replaceState(null, '', window.location.pathname);
    get = sinon.stub(config, 'get').callsFake(async () => sheet([]));
    sinon.stub(console, 'warn');
    resolveCanvasBranch();
  });

  afterEach(() => {
    unsubscribe?.();
    resolveCanvasBranch();
    window.history.replaceState(null, '', originalHref);
    sinon.restore();
  });

  const input = (context) => ({ org: context.org, site: context.repo, path: context.path });
  const row = (prefix, branch) => ({ key: 'ew.wysiwygBranch', value: `${prefix}=${branch}` });

  it('resolves query precedence once and shares the result with the bus', async () => {
    window.history.replaceState(null, '', `${window.location.pathname}?ref=feature`);
    const states = [];
    unsubscribe = canvasBus.branchState.subscribe((state) => states.push(state));
    const branchPromise = resolveCanvasBranch(ctx);
    expect(await branchPromise).to.equal('feature');
    expect(states.at(-1)).to.deep.equal({
      org: ctx.org,
      site: ctx.repo,
      path: `/${ctx.path}`,
      status: 'ready',
      branch: 'feature',
    });
    expect(get.called).to.be.false;
  });

  it('keeps the configured Layout branch when ref selects local extension development', async () => {
    window.history.replaceState(null, '', `${window.location.pathname}?ref=local`);
    get.callsFake(async () => sheet([row(`/${ctx.org}/site`, 'Configured/Branch')]));
    expect(await resolveCanvasBranch(ctx)).to.equal('configured-branch');
  });

  it('normalizes query and config branches before publishing them to every consumer', async () => {
    window.history.replaceState(null, '', `${window.location.pathname}?ref=Feat/My_Branch`);
    expect(await resolveCanvasBranch(ctx)).to.equal('feat-my-branch');
    expect(get.called).to.be.false;
  });

  it('uses longest segment prefixes and site precedence without matching sibling paths', async () => {
    const root = `/${ctx.org}/${ctx.repo}`;
    get.callsFake(async ({ site }) => sheet(site ? [
      row(root, 'site-branch'), row(`${root}/docs/`, ' develop '), row('/', 'root'),
    ] : [row(root, 'org-branch')]));
    expect(await fetchWysiwygBranch(input(ctx))).to.equal('develop');
    expect(await fetchWysiwygBranch({ ...input(ctx), path: `${ctx.org}/site/docs` })).to.equal('develop');
    expect(await fetchWysiwygBranch({ ...input(ctx), path: `${ctx.org}/site/docs-archive/a` })).to.equal('site-branch');
    expect(await fetchWysiwygBranch({ ...input(ctx), path: `${ctx.org}/site-archive/a` })).to.equal('root');
    expect(get.callCount).to.equal(2);
  });

  it('reads multi-sheet configs by declared names, not metadata or object-key order', async () => {
    get.callsFake(async () => new Response(JSON.stringify({
      ':type': 'multi-sheet',
      ':names': ['config', 'flags'],
      flags: { data: [] },
      config: { data: [row(`/${ctx.org}/site`, 'configured')] },
    })));
    expect(await fetchWysiwygBranch(input(ctx))).to.equal('configured');
  });

  [403, 404].forEach((status) => {
    it(`uses org config when site config returns HTTP ${status}`, async () => {
      get.callsFake(async ({ site }) => (site
        ? new Response('', { status }) : sheet([row(`/${ctx.org}/site`, 'org-branch')])));
      expect(await fetchWysiwygBranch(input(ctx))).to.equal('org-branch');
      expect(console.warn.calledWith(`Error loading /${ctx.org}/site`, status)).to.be.true;
    });
  });

  it('propagates JSON errors to the bus and evicts failed requests for retry', async () => {
    get.callsFake(async ({ site }) => (site ? new Response('{invalid') : sheet([])));
    const states = [];
    unsubscribe = canvasBus.branchState.subscribe((state) => states.push(state));
    expect(await resolveCanvasBranch(ctx).catch((error) => error)).to.be.instanceOf(SyntaxError);
    expect(states.at(-1).status).to.equal('error');
    expect(states.at(-1).path).to.equal(`/${ctx.path}`);
    get.callsFake(async () => sheet([row(`/${ctx.org}/site`, 'retried')]));
    expect(await resolveCanvasBranch(ctx)).to.equal('retried');
    expect(states.at(-1).branch).to.equal('retried');
  });

  it('does not hide network TypeErrors by choosing main', async () => {
    get.rejects(new TypeError('Network failed'));
    const networkError = await fetchWysiwygBranch(input(ctx)).catch((error) => error);
    expect(networkError).to.be.instanceOf(TypeError);
  });

  it('skips malformed rows and still selects valid sibling configuration', async () => {
    get.callsFake(async () => sheet([
      null,
      { key: 'ew.wysiwygBranch', value: null },
      { key: 'ew.wysiwygBranch', value: 42 },
      { key: 'ew.wysiwygBranch', value: {} },
      { key: 'ew.wysiwygBranch', value: 'missing-separator' },
      row(`/${ctx.org}/site`, 'valid'),
    ]));
    expect(await resolveCanvasBranch(ctx)).to.equal('valid');
  });

  it('does not publish a stale success after navigation', async () => {
    let finish;
    get.callsFake(({ org }) => (org === ctx.org
      ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve(sheet([]))));
    // Only the site fetch waits, avoiding separate deferred org/site responses.
    get.withArgs({ org: ctx.org, site: undefined }).resolves(sheet([]));
    const states = [];
    unsubscribe = canvasBus.branchState.subscribe((state) => states.push(state));
    const stale = resolveCanvasBranch(ctx);
    await Promise.resolve();
    const current = { org: 'new-org', repo: 'site', path: 'new-org/site/page' };
    await resolveCanvasBranch(current);
    finish(sheet([row(`/${ctx.org}/site`, 'stale')]));
    await stale;
    expect(states.at(-1).path).to.equal('/new-org/site/page');
    expect(states.at(-1).branch).to.equal('main');
  });

  it('bridges state once and replays it only for the requested document', async () => {
    initBranchBridge();
    initBranchBridge();
    const onState = sinon.spy();
    document.addEventListener('nx-branch-state', onState);
    try {
      await resolveCanvasBranch(ctx);
      expect(onState.callCount).to.equal(2); // pending, ready — not duplicated by init
      onState.resetHistory();
      request('/other/site/page');
      expect(onState.called).to.be.false;
      request(`/${ctx.path}`);
      expect(onState.calledOnce).to.be.true;
      expect(onState.firstCall.args[0].detail.branch).to.equal('main');
      resolveCanvasBranch();
      onState.resetHistory();
      request(`/${ctx.path}`);
      expect(onState.called).to.be.false;
    } finally {
      document.removeEventListener('nx-branch-state', onState);
    }
  });

  it('drops a stale rejection after leaving a document', async () => {
    let fail;
    get.callsFake(({ site }) => (site
      ? new Promise((resolve, reject) => { fail = reject; }) : Promise.resolve(sheet([]))));
    const states = [];
    unsubscribe = canvasBus.branchState.subscribe((state) => states.push(state));
    const stale = resolveCanvasBranch(ctx).catch((error) => error);
    // Let the config API import settle before completing the deferred request.
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    resolveCanvasBranch();
    fail(new Error('Old request failed'));
    await stale;
    expect(states.at(-1)).to.deep.equal({ path: null, status: 'pending' });
  });
});
