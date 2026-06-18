import { expect } from '@esm-bundle/chai';

const SESSION_KEY = 'nx-tool-panel-active-view';
let persistToolPanelView;
let readConfiguredToolPanelView;
let readPersistedToolPanelView;
let resolveInitialToolPanelView;
let shouldAutoOpenAfterPanel;

const IDS = new Set(['outline', 'files', 'blocks']);

before(async () => {
  const mod = await import('../../../../../blocks/canvas/utils/panel.js');
  persistToolPanelView = mod.persistToolPanelView;
  readConfiguredToolPanelView = mod.readConfiguredToolPanelView;
  readPersistedToolPanelView = mod.readPersistedToolPanelView;
  resolveInitialToolPanelView = mod.resolveInitialToolPanelView;
  shouldAutoOpenAfterPanel = mod.shouldAutoOpenAfterPanel;
});

describe('persistToolPanelView', () => {
  afterEach(() => {
    sessionStorage.removeItem(SESSION_KEY);
  });

  it('writes the view id to session storage', () => {
    persistToolPanelView('blocks');
    expect(sessionStorage.getItem(SESSION_KEY)).to.equal('blocks');
  });
});

describe('readConfiguredToolPanelView', () => {
  let savedFetch;
  let testIndex = 0;

  beforeEach(() => {
    savedFetch = window.fetch;
    testIndex += 1;
  });

  afterEach(() => {
    window.fetch = savedFetch;
  });

  function ctx() { return { org: `org-${testIndex}`, site: `site-${testIndex}` }; }

  function mockConfig(flags) {
    window.fetch = () => Promise.resolve(new Response(JSON.stringify({ flags }), { status: 200 }));
  }

  it('returns the configured panel id from site flags', async () => {
    mockConfig({ data: [{ key: 'ew.canvasDefaultPanel', value: 'blocks' }] });
    const panel = await readConfiguredToolPanelView(ctx());
    expect(panel).to.equal('blocks');
  });

  it('returns undefined when flag is missing', async () => {
    mockConfig({ data: [{ key: 'other.flag', value: 'true' }] });
    const panel = await readConfiguredToolPanelView(ctx());
    expect(panel).to.equal(undefined);
  });

  it('returns undefined when org or site is missing', async () => {
    mockConfig({ data: [{ key: 'ew.canvasDefaultPanel', value: 'blocks' }] });
    expect(await readConfiguredToolPanelView({ org: 'org' })).to.equal(undefined);
    expect(await readConfiguredToolPanelView({ site: 'site' })).to.equal(undefined);
  });
});

describe('resolveInitialToolPanelView', () => {
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

  function ctx() { return { org: `org-${testIndex}`, site: `site-${testIndex}` }; }

  function mockConfig(flags) {
    window.fetch = () => Promise.resolve(new Response(JSON.stringify({ flags }), { status: 200 }));
  }

  it('returns persisted session storage value when present and valid', async () => {
    sessionStorage.setItem(SESSION_KEY, 'files');
    mockConfig({ data: [{ key: 'ew.canvasDefaultPanel', value: 'blocks' }] });
    const panel = await resolveInitialToolPanelView({ ...ctx(), availableIds: IDS });
    expect(panel).to.equal('files');
  });

  it('session storage wins over config flag', async () => {
    sessionStorage.setItem(SESSION_KEY, 'outline');
    mockConfig({ data: [{ key: 'ew.canvasDefaultPanel', value: 'blocks' }] });
    const panel = await resolveInitialToolPanelView({ ...ctx(), availableIds: IDS });
    expect(panel).to.equal('outline');
  });

  it('returns config flag when session storage is empty', async () => {
    mockConfig({ data: [{ key: 'ew.canvasDefaultPanel', value: 'blocks' }] });
    const panel = await resolveInitialToolPanelView({ ...ctx(), availableIds: IDS });
    expect(panel).to.equal('blocks');
  });

  it('returns undefined when neither session nor config match available ids', async () => {
    sessionStorage.setItem(SESSION_KEY, 'missing');
    mockConfig({ data: [{ key: 'ew.canvasDefaultPanel', value: 'also-missing' }] });
    const panel = await resolveInitialToolPanelView({ ...ctx(), availableIds: IDS });
    expect(panel).to.equal(undefined);
  });

  it('falls back to config when persisted id is not available', async () => {
    sessionStorage.setItem(SESSION_KEY, 'missing');
    mockConfig({ data: [{ key: 'ew.canvasDefaultPanel', value: 'files' }] });
    const panel = await resolveInitialToolPanelView({ ...ctx(), availableIds: IDS });
    expect(panel).to.equal('files');
  });

  it('readPersistedToolPanelView returns session value', () => {
    sessionStorage.setItem(SESSION_KEY, 'outline');
    expect(readPersistedToolPanelView()).to.equal('outline');
  });
});

describe('shouldAutoOpenAfterPanel', () => {
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

  function ctx() { return { org: `auto-open-org-${testIndex}`, site: `auto-open-site-${testIndex}` }; }

  function mockConfig(flags) {
    window.fetch = () => Promise.resolve(new Response(JSON.stringify({ flags }), { status: 200 }));
  }

  it('returns false when no config default is set', async () => {
    mockConfig({ data: [] });
    const open = await shouldAutoOpenAfterPanel(ctx());
    expect(open).to.equal(false);
  });

  it('returns true when config is set and no tab preference exists yet', async () => {
    mockConfig({ data: [{ key: 'ew.canvasDefaultPanel', value: 'blocks' }] });
    const open = await shouldAutoOpenAfterPanel(ctx());
    expect(open).to.equal(true);
  });

  it('returns false when config is set but a tab preference already exists', async () => {
    mockConfig({ data: [{ key: 'ew.canvasDefaultPanel', value: 'blocks' }] });
    sessionStorage.setItem(SESSION_KEY, 'outline');
    const open = await shouldAutoOpenAfterPanel(ctx());
    expect(open).to.equal(false);
  });
});
