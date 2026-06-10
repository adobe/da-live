import { expect } from '@esm-bundle/chai';

const SESSION_KEY = 'nx-canvas-editor-view';
let readInitialCanvasEditorView;

before(async () => {
  const mod = await import('../../../../../blocks/canvas/utils/view.js');
  readInitialCanvasEditorView = mod.readInitialCanvasEditorView;
});

describe('readInitialCanvasEditorView', () => {
  let savedFetch;
  let testIndex = 0;

  beforeEach(() => {
    savedFetch = window.fetch;
    sessionStorage.removeItem(SESSION_KEY);
    testIndex += 1;
  });

  afterEach(() => {
    window.fetch = savedFetch;
    sessionStorage.removeItem(SESSION_KEY);
  });

  // fetchDaConfigs caches by org/site — use a unique pair per test to avoid cache hits.
  function ctx() { return { org: `org-${testIndex}`, site: `site-${testIndex}` }; }

  function mockConfig(flags) {
    window.fetch = () => Promise.resolve(new Response(JSON.stringify({ flags }), { status: 200 }));
  }

  function mockConfigError() {
    window.fetch = () => Promise.resolve(new Response('', { status: 500 }));
  }

  it('returns persisted session storage value when present', async () => {
    sessionStorage.setItem(SESSION_KEY, 'content');
    const view = await readInitialCanvasEditorView(ctx());
    expect(view).to.equal('content');
  });

  it('session storage value wins over config flag', async () => {
    sessionStorage.setItem(SESSION_KEY, 'split');
    mockConfig({ data: [{ key: 'ew.canvasDefaultView', value: 'content' }] });
    const view = await readInitialCanvasEditorView(ctx());
    expect(view).to.equal('split');
  });

  it('returns content from config flag when session storage is empty', async () => {
    mockConfig({ data: [{ key: 'ew.canvasDefaultView', value: 'content' }] });
    const view = await readInitialCanvasEditorView(ctx());
    expect(view).to.equal('content');
  });

  it('returns split from config flag when session storage is empty', async () => {
    mockConfig({ data: [{ key: 'ew.canvasDefaultView', value: 'split' }] });
    const view = await readInitialCanvasEditorView(ctx());
    expect(view).to.equal('split');
  });

  it('returns layout when config flag has an invalid value', async () => {
    mockConfig({ data: [{ key: 'ew.canvasDefaultView', value: 'unknown' }] });
    const view = await readInitialCanvasEditorView(ctx());
    expect(view).to.equal('layout');
  });

  it('returns layout when config has no canvasDefaultView flag', async () => {
    mockConfig({ data: [{ key: 'other.flag', value: 'true' }] });
    const view = await readInitialCanvasEditorView(ctx());
    expect(view).to.equal('layout');
  });

  it('returns layout when config fetch fails', async () => {
    mockConfigError();
    const view = await readInitialCanvasEditorView(ctx());
    expect(view).to.equal('layout');
  });

  it('returns layout when config has no flags sheet', async () => {
    mockConfig(undefined);
    const view = await readInitialCanvasEditorView(ctx());
    expect(view).to.equal('layout');
  });
});
