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
