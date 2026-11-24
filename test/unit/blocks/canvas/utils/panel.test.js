import { expect } from '@esm-bundle/chai';
import { stub } from 'sinon';
import {
  readPinnedToolPanelViews,
  persistPinnedToolPanelViews,
  TOOL_PANEL_PINNED_VIEWS_KEY,
} from '../../../../../blocks/canvas/utils/panel.js';

const SESSION_KEY = 'nx-tool-panel-active-view';
let persistToolPanelView;
let readConfiguredToolPanelView;
let readPersistedToolPanelView;
let resolveInitialToolPanelView;
let shouldAutoOpenAfterPanel;

const IDS = new Set(['outline', 'files', 'blocks']);

const flagsLoader = (sheet) => {
  const map = {};
  for (const { key, value } of sheet?.data ?? []) map[key] = value;
  return async () => map;
};

const ctx = () => ({ org: 'org', site: 'site' });

before(async () => {
  const mod = await import('../../../../../blocks/canvas/utils/panel.js');
  persistToolPanelView = mod.persistToolPanelView;
  readConfiguredToolPanelView = mod.readConfiguredToolPanelView;
  readPersistedToolPanelView = mod.readPersistedToolPanelView;
  resolveInitialToolPanelView = mod.resolveInitialToolPanelView;
  shouldAutoOpenAfterPanel = mod.shouldAutoOpenAfterPanel;
});

describe('persistToolPanelView', () => {
  afterEach(() => { sessionStorage.removeItem(SESSION_KEY); });

  it('writes the view id to session storage', () => {
    persistToolPanelView('blocks');
    expect(sessionStorage.getItem(SESSION_KEY)).to.equal('blocks');
  });
});

describe('pinned tool panel preferences', () => {
  afterEach(() => {
    sessionStorage.removeItem(TOOL_PANEL_PINNED_VIEWS_KEY);
  });

  it('restores pins in order and removes invalid or duplicate ids', () => {
    persistPinnedToolPanelViews(['blocks', null, 'files', 'blocks', '', 3]);
    expect(readPinnedToolPanelViews()).to.deep.equal(['blocks', 'files']);
  });

  it('defaults to Files and Outline for a new session', () => {
    sessionStorage.removeItem(TOOL_PANEL_PINNED_VIEWS_KEY);
    expect(readPinnedToolPanelViews()).to.deep.equal(['files', 'outline']);
  });

  it('defaults to Files and Outline for malformed or empty stored preferences', () => {
    for (const value of ['invalid json', '{}', 'null', '[]', '[null, ""]']) {
      sessionStorage.setItem(TOOL_PANEL_PINNED_VIEWS_KEY, value);
      expect(readPinnedToolPanelViews()).to.deep.equal(['files', 'outline']);
    }
  });

  it('restores all unique valid pins without a tab limit', () => {
    sessionStorage.setItem(TOOL_PANEL_PINNED_VIEWS_KEY, JSON.stringify([
      'blocks', null, 'blocks', 'files', '', 'assets', 'outline', 'versions',
    ]));
    expect(readPinnedToolPanelViews())
      .to.deep.equal(['blocks', 'files', 'assets', 'outline', 'versions']);
  });

  it('continues working when session storage is blocked', () => {
    const get = stub(Storage.prototype, 'getItem').throws(new Error('blocked'));
    const set = stub(Storage.prototype, 'setItem').throws(new Error('blocked'));
    try {
      expect(readPinnedToolPanelViews()).to.deep.equal(['files', 'outline']);
      expect(() => persistPinnedToolPanelViews(['blocks'])).not.to.throw();
    } finally {
      get.restore();
      set.restore();
    }
  });
});

describe('readConfiguredToolPanelView', () => {
  it('returns the configured panel id from site flags', async () => {
    const panel = await readConfiguredToolPanelView(
      ctx(),
      flagsLoader({ data: [{ key: 'ew.canvasDefaultPanel', value: 'blocks' }] }),
    );
    expect(panel).to.equal('blocks');
  });

  it('returns undefined when flag is missing', async () => {
    const panel = await readConfiguredToolPanelView(
      ctx(),
      flagsLoader({ data: [{ key: 'other.flag', value: 'true' }] }),
    );
    expect(panel).to.equal(undefined);
  });

  it('returns undefined when org or site is missing', async () => {
    const flags = flagsLoader({ data: [{ key: 'ew.canvasDefaultPanel', value: 'blocks' }] });
    expect(await readConfiguredToolPanelView({ org: 'org' }, flags)).to.equal(undefined);
    expect(await readConfiguredToolPanelView({ site: 'site' }, flags)).to.equal(undefined);
  });
});

describe('resolveInitialToolPanelView', () => {
  afterEach(() => { sessionStorage.removeItem(SESSION_KEY); });

  it('returns persisted session storage value when present and valid', async () => {
    sessionStorage.setItem(SESSION_KEY, 'files');
    const panel = await resolveInitialToolPanelView(
      { ...ctx(), availableIds: IDS },
      flagsLoader({ data: [{ key: 'ew.canvasDefaultPanel', value: 'blocks' }] }),
    );
    expect(panel).to.equal('files');
  });

  it('session storage wins over config flag', async () => {
    sessionStorage.setItem(SESSION_KEY, 'outline');
    const panel = await resolveInitialToolPanelView(
      { ...ctx(), availableIds: IDS },
      flagsLoader({ data: [{ key: 'ew.canvasDefaultPanel', value: 'blocks' }] }),
    );
    expect(panel).to.equal('outline');
  });

  it('returns config flag when session storage is empty', async () => {
    const panel = await resolveInitialToolPanelView(
      { ...ctx(), availableIds: IDS },
      flagsLoader({ data: [{ key: 'ew.canvasDefaultPanel', value: 'blocks' }] }),
    );
    expect(panel).to.equal('blocks');
  });

  it('returns undefined when neither session nor config match available ids', async () => {
    sessionStorage.setItem(SESSION_KEY, 'missing');
    const panel = await resolveInitialToolPanelView(
      { ...ctx(), availableIds: IDS },
      flagsLoader({ data: [{ key: 'ew.canvasDefaultPanel', value: 'also-missing' }] }),
    );
    expect(panel).to.equal(undefined);
  });

  it('falls back to config when persisted id is not available', async () => {
    sessionStorage.setItem(SESSION_KEY, 'missing');
    const panel = await resolveInitialToolPanelView(
      { ...ctx(), availableIds: IDS },
      flagsLoader({ data: [{ key: 'ew.canvasDefaultPanel', value: 'files' }] }),
    );
    expect(panel).to.equal('files');
  });

  it('readPersistedToolPanelView returns session value', () => {
    sessionStorage.setItem(SESSION_KEY, 'outline');
    expect(readPersistedToolPanelView()).to.equal('outline');
  });
});

describe('shouldAutoOpenAfterPanel', () => {
  afterEach(() => { sessionStorage.removeItem(SESSION_KEY); });

  it('returns false when no config default is set', async () => {
    const open = await shouldAutoOpenAfterPanel(ctx(), flagsLoader({ data: [] }));
    expect(open).to.equal(false);
  });

  it('returns true when config is set and no tab preference exists yet', async () => {
    const open = await shouldAutoOpenAfterPanel(
      ctx(),
      flagsLoader({ data: [{ key: 'ew.canvasDefaultPanel', value: 'blocks' }] }),
    );
    expect(open).to.equal(true);
  });

  it('returns false when config is set but a tab preference already exists', async () => {
    sessionStorage.setItem(SESSION_KEY, 'outline');
    const open = await shouldAutoOpenAfterPanel(
      ctx(),
      flagsLoader({ data: [{ key: 'ew.canvasDefaultPanel', value: 'blocks' }] }),
    );
    expect(open).to.equal(false);
  });
});

describe('Canvas panel deep links', () => {
  let originalUrl;
  let panel;
  const views = new Set([...IDS, 'proposed-changes']);
  const linkTo = (id) => {
    const url = new URL(window.location.href);
    url.searchParams.set('panel', id);
    url.hash = '/org/site/campaigns/demo';
    history.replaceState(null, '', url);
  };

  before(async () => {
    const { setNx } = await import('../../../../../scripts/utils.js');
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    await import('../../../../../blocks/shared/tool-panel/tool-panel.js');
  });

  beforeEach(() => {
    originalUrl = window.location.href;
    sessionStorage.setItem(SESSION_KEY, 'files');
  });

  afterEach(() => {
    panel?.remove();
    panel = undefined;
    history.replaceState(null, '', originalUrl);
    sessionStorage.removeItem(SESSION_KEY);
  });

  it('opens the requested panel ahead of session and site defaults without loading flags', async () => {
    linkTo('proposed-changes');
    const flags = stub().rejects(new Error('Flags should not be needed'));
    expect(await shouldAutoOpenAfterPanel(ctx(), flags)).to.equal(true);
    expect(await resolveInitialToolPanelView({ ...ctx(), availableIds: views }, flags))
      .to.equal('proposed-changes');
    expect(flags.called).to.equal(false);
    expect(window.location.hash).to.equal('#/org/site/campaigns/demo');
  });

  it('falls back to the saved panel for an unregistered ID or URL', async () => {
    for (const id of ['unconfigured', 'https://example.com/extension.html']) {
      linkTo(id);
      // eslint-disable-next-line no-await-in-loop
      expect(await resolveInitialToolPanelView({ ...ctx(), availableIds: views }))
        .to.equal('files');
    }
  });

  it('does not open for an empty parameter or a missing site context', async () => {
    linkTo('  ');
    expect(await shouldAutoOpenAfterPanel(ctx(), flagsLoader({ data: [] }))).to.equal(false);
    linkTo('proposed-changes');
    expect(await shouldAutoOpenAfterPanel({})).to.equal(false);
  });

  it('waits for registered views, loads the requested extension, and permits subsequent tab changes', async () => {
    linkTo('proposed-changes');
    const loaded = [];
    panel = document.createElement('da-tool-panel');
    panel.host = {
      getViews: async () => {
        await Promise.resolve();
        return ['files', 'proposed-changes'].map((id) => ({
          id,
          label: id,
          load: async () => {
            loaded.push(id);
            return Object.assign(document.createElement('div'), { textContent: id });
          },
        }));
      },
      resolveInitialView: resolveInitialToolPanelView,
      persistView: persistToolPanelView,
    };
    document.body.append(panel);
    await panel.setContext(ctx());
    await panel.updateComplete;
    expect(panel.activeId).to.equal('proposed-changes');
    expect(loaded).to.deep.equal(['proposed-changes']);
    await panel.showPanel('files');
    await panel.setContext({ ...ctx(), path: 'another-page' });
    expect(panel.activeId).to.equal('files');
  });
});
