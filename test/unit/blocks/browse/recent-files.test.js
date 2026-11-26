import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-nx.js';
import { DaRecentFiles } from '../../../../blocks/browse/recent-files/recent-files.js';
import '../../../../blocks/browse/da-sites/da-sites.js';
import { getNx2Api, getNxEWFlags } from '../../../../scripts/utils.js';
import { getSiteFavorites, toggleFavorite } from '../../../../blocks/browse/shared/favorites.js';
import { addRecentFile } from '../../../../blocks/shared/recent-files.js';

const { source, config } = await getNx2Api();
const { setEWEnabled } = await getNxEWFlags();
const paths = (scope, count) => Array.from({ length: count }, (_, i) => `/${scope}/page-${i}.html`);
const entries = (scope, count, timestamp = 1000) => paths(scope, count)
  .map((path, i) => ({ path, timestamp: timestamp - i }));
const response = () => new Response(null, { headers: { 'last-modified': 'Mon, 09 Nov 2026 12:00:00 GMT' } });
const storageKeys = ['da-sites', 'da-recent-files', 'da-favorites', 'da-browse-settings'];

describe('Browse recent files', () => {
  let el;
  let loadSite;
  let metadata;
  let storageDescriptor;

  const list = () => el.shadowRoot.querySelector('da-list');
  const setRecent = (value) => localStorage.setItem('da-recent-files', JSON.stringify(value));
  const pills = () => el.shadowRoot.querySelector('nx-pills');
  const chips = () => pills().items.map(({ label }) => label);
  const picker = () => el.shadowRoot.querySelector('nx-picker');
  const selected = (scope) => picker().values.includes(scope);

  function changeSites(values) {
    const control = picker();
    control.values = values;
    control.dispatchEvent(new CustomEvent('change', { detail: { values } }));
  }

  async function update(target = el) {
    await target.updateComplete;
    await target.shadowRoot.querySelector('da-list')?.updateComplete;
  }

  async function choose(scope) {
    changeSites(selected(scope)
      ? picker().values.filter((site) => site !== scope) : [...picker().values, scope]);
    await update();
    await loadSite.lastCall.returnValue;
    await update();
  }

  async function remount(scopes = ['org/site', 'org/other']) {
    el.remove();
    el = document.createElement('da-recent-files');
    el.scopes = scopes;
    document.body.append(el);
    await update();
    await loadSite.lastCall.returnValue;
    await update();
  }

  beforeEach(async () => {
    storageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { configurable: true, value: sessionStorage });
    storageKeys.forEach((key) => localStorage.removeItem(key));
    const fetch = window.fetch.bind(window);
    sinon.stub(window, 'fetch').callsFake((url, options) => (
      String(url).startsWith('https://admin.hlx.page/ping/')
        ? Promise.resolve(new Response(null, { status: 404 })) : fetch(url, options)
    ));
    setRecent({
      '/org/site': entries('org/site', 12),
      '/org/other': entries('org/other', 12, 2000),
    });
    setEWEnabled(true);
    sinon.stub(config, 'get').callsFake(async ({ site }) => ({
      ok: true,
      json: async () => ({
        data: site === 'other'
          ? [{ key: 'editor.path', value: '/org/other=/edit#' }] : [],
      }),
    }));
    metadata = sinon.stub(source, 'getMetadata').callsFake(async () => response());
    loadSite = sinon.spy(DaRecentFiles.prototype, 'loadSite');
    el = document.createElement('da-recent-files');
    el.scopes = ['org/site', 'org/other'];
    document.body.append(el);
    await update();
    await loadSite.lastCall.returnValue;
    await update();
  });

  afterEach(() => {
    el.remove();
    sinon.restore();
    setEWEnabled(false);
    storageKeys.forEach((key) => localStorage.removeItem(key));
    Object.defineProperty(window, 'localStorage', storageDescriptor);
  });

  it('defaults to the most recent site and bounds requests to that site', () => {
    expect(list().view).to.equal('list');
    expect(list().sort).to.equal(false);
    expect(list().listItems.map(({ path }) => path)).to.deep.equal(paths('org/site', 4));
    expect(metadata.getCalls().map(({ args }) => args[0])).to.deep.equal(paths('org/site', 10));
    expect(selected('org/site')).to.equal(true);
    expect(selected('org/other')).to.equal(false);
    expect(chips()).to.deep.equal(['org/site']);
    expect(pills().items[0].removable).to.equal(false);
  });

  it('supplies multi-selection and a stable Add sites label to the shared picker', () => {
    expect(picker().hasAttribute('multiple')).to.equal(true);
    expect(picker().values).to.deep.equal(['org/site']);
    expect(picker().items.map(({ value }) => value)).to.deep.equal(['org/site', 'org/other']);
    expect(picker().labelOverride).to.equal('Add sites');
  });

  it('uses a sole available site implicitly and shows controls when another becomes available', async () => {
    await remount(['org/site']);
    expect(pills()).to.equal(null);
    expect(picker()).to.equal(null);
    expect(list().listItems.map(({ path }) => path)).to.deep.equal(paths('org/site', 4));
    el.scopes = ['org/site', 'org/other'];
    await update();
    expect(chips()).to.deep.equal(['org/site']);
    expect(picker().items.map(({ value }) => value)).to.deep.equal(['org/site', 'org/other']);
    await choose('org/other');
    expect(list().listItems.map(({ path }) => path)).to.deep.equal(paths('org/other', 4));
  });

  it('persists multiple selections without overwriting other browser settings', async () => {
    localStorage.setItem('da-browse-settings', JSON.stringify({ view: 'card', groupByType: true }));
    await choose('org/other');
    expect(selected('org/site')).to.equal(true);
    expect(selected('org/other')).to.equal(true);
    expect(chips()).to.deep.equal(['org/site', 'org/other']);
    expect(JSON.parse(localStorage.getItem('da-browse-settings')))
      .to.deep.equal({ view: 'card', groupByType: true, recentSites: ['org/site', 'org/other'] });
    await remount();
    expect(selected('org/site')).to.equal(true);
    expect(selected('org/other')).to.equal(true);
    expect(list().listItems.map(({ path }) => path)).to.deep.equal(paths('org/other', 4));
  });

  it('requires one selection but lets the initial site be replaced', async () => {
    metadata.resetHistory();
    changeSites([]);
    await update();
    expect(picker().values).to.deep.equal(['org/site']);
    expect(metadata.called).to.equal(false);
    await choose('org/other');
    await choose('org/site');
    expect(selected('org/site')).to.equal(false);
    expect(selected('org/other')).to.equal(true);
    changeSites([]);
    await update();
    expect(picker().values).to.deep.equal(['org/other']);
    expect(list().listItems.map(({ path }) => path)).to.deep.equal(paths('org/other', 4));
    expect(JSON.parse(localStorage.getItem('da-browse-settings')).recentSites)
      .to.deep.equal(['org/other']);
    expect(el.shadowRoot.querySelector('.all-files')).to.equal(null);
  });

  it('removes a site through its chip, preserves Favorite scope, and saves the selection', async () => {
    paths('org/site', 1).forEach((path) => toggleFavorite('/org/site', path));
    paths('org/other', 1).forEach((path) => toggleFavorite('/org/other', path));
    await choose('org/other');
    await el.changeTab('starred');
    await update();
    const focus = sinon.spy(picker(), 'focus');
    expect(pills().items.every(({ removable }) => removable)).to.equal(true);
    pills().dispatchEvent(new CustomEvent('nx-pill-remove', { detail: { id: 'org/site' } }));
    await update();
    await loadSite.lastCall.returnValue;
    await update();
    expect(chips()).to.deep.equal(['org/other']);
    expect(selected('org/site')).to.equal(false);
    expect(list().listItems.map(({ path }) => path)).to.deep.equal(paths('org/other', 1));
    expect(pills().items[0].removable).to.equal(false);
    pills().dispatchEvent(new CustomEvent('nx-pill-remove', { detail: { id: 'org/other' } }));
    await update();
    expect(chips()).to.deep.equal(['org/other']);
    expect(focus.calledOnce).to.equal(true);
    expect(JSON.parse(localStorage.getItem('da-browse-settings')).recentSites)
      .to.deep.equal(['org/other']);
    await remount();
    expect(chips()).to.deep.equal(['org/other']);
  });

  it('collapses extra selected sites into an overflow control that opens the picker', async () => {
    el.scopes = ['org/site', 'org/other', 'org/third', 'org/fourth'];
    await update();
    for (const scope of ['org/other', 'org/third', 'org/fourth']) await choose(scope);
    expect(chips()).to.deep.equal(['org/site', 'org/other', 'org/third']);
    const overflow = el.shadowRoot.querySelector('.site-picker-overflow');
    expect(overflow.textContent).to.equal('+1 more');
    const show = sinon.spy();
    picker().show = show;
    overflow.click();
    expect(show.calledOnce).to.equal(true);
    expect(selected('org/fourth')).to.equal(true);
  });

  it('restores valid saved sites and falls back when selected sites disappear', async () => {
    localStorage.setItem('da-browse-settings', JSON.stringify({ recentSites: ['missing/site', 'org/other'] }));
    await remount();
    expect(selected('org/site')).to.equal(false);
    expect(selected('org/other')).to.equal(true);
    el.scopes = ['org/site'];
    await update();
    await loadSite.lastCall.returnValue;
    await update();
    expect(el.scope).to.equal('org/site');
    expect(pills()).to.equal(null);
    expect(picker()).to.equal(null);
    expect(list().listItems.map(({ path }) => path)).to.deep.equal(paths('org/site', 4));
    expect(JSON.parse(localStorage.getItem('da-browse-settings')).recentSites)
      .to.deep.equal(['org/site']);
  });

  it('ignores malformed or empty saved selections', async () => {
    for (const recentSites of ['org/other', [], [null, 'missing/site']]) {
      localStorage.setItem('da-browse-settings', JSON.stringify({ recentSites }));
      await remount();
      expect(selected('org/site')).to.equal(true);
      expect(selected('org/other')).to.equal(false);
    }
  });

  it('switches list/card views without changing Browse settings or visible files', async () => {
    const settings = JSON.stringify({ view: 'card', groupByType: false });
    localStorage.setItem('da-browse-settings', settings);
    const switcher = el.shadowRoot.querySelector('nx-segmented-btn');
    for (const view of ['card', 'list']) {
      switcher.dispatchEvent(new CustomEvent('change', { detail: { value: view } }));
      await update();
      expect(list().view).to.equal(view);
      expect(list().listItems.map(({ path }) => path)).to.deep.equal(paths('org/site', 4));
      expect(localStorage.getItem('da-browse-settings')).to.equal(settings);
    }
  });

  it('renders empty recent and favorite states without requesting site configuration', async () => {
    setRecent({});
    config.get.resetHistory();
    metadata.resetHistory();
    await el.loadSite();
    await update();
    expect(el.shadowRoot.querySelector('.empty-state h3').textContent).to.equal('No recent files yet');
    await el.changeTab('starred');
    await update();
    expect(el.shadowRoot.querySelector('.empty-state h3').textContent).to.equal('No favorites yet');
    expect(config.get.called).to.equal(false);
    expect(metadata.called).to.equal(false);
  });

  it('resets independent tab expansions when the ordered sites change', async () => {
    for (const scope of ['org/site', 'org/other']) {
      paths(scope, 10).forEach((path) => toggleFavorite(`/${scope}`, path));
    }
    for (const tab of ['recent', 'starred']) {
      await el.changeTab(tab);
      await update();
      el.shadowRoot.querySelector('.show-more').click();
      await update();
      expect(list().listItems).to.have.length(10);
    }
    await el.changeTab('recent');
    await update();
    expect(list().listItems).to.have.length(10);
    el.scopes = ['org/other'];
    await update();
    await loadSite.lastCall.returnValue;
    await update();
    expect(list().listItems).to.have.length(4);
    await el.changeTab('starred');
    await update();
    expect(list().listItems).to.have.length(4);
  });

  it('merges selected sites with their own editor and folder destinations', async () => {
    setRecent({
      '/org/site': entries('org/site', 2, 3000),
      '/org/other': entries('org/other', 12),
    });
    metadata.resetHistory();
    await choose('org/other');
    el.shadowRoot.querySelector('.show-more').click();
    await update();
    expect(list().listItems.map(({ path }) => path))
      .to.deep.equal([...paths('org/site', 2), ...paths('org/other', 8)]);
    expect(new URL(list().listItems[0].href).pathname).to.equal('/canvas');
    expect(new URL(list().listItems[2].href).pathname).to.equal('/edit');
    expect(list().listItems[2].folderHref).to.include('#/org/other');
    expect(list().shadowRoot.querySelectorAll('da-file-item')[2].folder.label).to.equal('/org/other');
    expect(metadata.getCalls().map(({ args }) => args[0]))
      .to.deep.equal([...paths('org/site', 2), ...paths('org/other', 8)]);
    el.shadowRoot.querySelector('.show-more').click();
    await update();
    expect(list().listItems).to.have.length(4);
    expect(el.shadowRoot.querySelector('.show-more').getAttribute('aria-expanded')).to.equal('false');
  });

  it('ranks all selected files before capping, deduplicates, and skips missing files', async () => {
    const primary = entries('org/site', 12).map((entry, i) => ({ ...entry, timestamp: 1000 - 10 * i }));
    const other = entries('org/other', 12).map((entry, i) => ({ ...entry, timestamp: 1005 - 10 * i }));
    setRecent({
      '/org/site': [primary[0], ...primary],
      '/org/other': other,
      '/org/unselected': entries('org/unselected', 12, 100000),
    });
    el.scopes = ['org/site', 'org/other', 'org/unselected'];
    await update();
    metadata.withArgs(other[0].path).resolves(new Response(null, { status: 404 }));
    metadata.resetHistory();
    await choose('org/other');
    el.shadowRoot.querySelector('.show-more').click();
    await update();
    const ranked = [primary[0].path, ...primary.slice(1, 5)
      .flatMap((entry, i) => [other[i + 1].path, entry.path]), other[5].path];
    expect(list().listItems.map(({ path }) => path)).to.deep.equal(ranked);
    expect(metadata.getCalls().map(({ args }) => args[0]))
      .to.deep.equal([other[0].path, ...ranked]);
    expect(el.shadowRoot.querySelector('.all-files')).to.equal(null);
  });

  it('excludes untimestamped entries without rewriting them until reopened', async () => {
    const legacy = '/org/site/legacy.html';
    const recent = '/org/site/recent.html';
    const stored = JSON.stringify({ '/org/site': [legacy, { path: recent, timestamp: 1000 }, { path: '/org/site/unknown.html' }] });
    localStorage.setItem('da-recent-files', stored);
    metadata.resetHistory();
    await el.loadSite();
    await update();
    expect(list().listItems.map(({ path }) => path)).to.deep.equal([recent]);
    expect(metadata.getCalls().map(({ args }) => args[0])).to.deep.equal([recent]);
    expect(localStorage.getItem('da-recent-files')).to.equal(stored);
    sinon.stub(Date, 'now').returns(2000);
    addRecentFile(legacy);
    await el.loadSite();
    await update();
    expect(list().listItems.map(({ path }) => path)).to.deep.equal([legacy, recent]);
  });

  it('fills Favorite independently and replaces an unfavorited item from remaining sites', async () => {
    paths('org/site', 2).forEach((path) => toggleFavorite('/org/site', path));
    paths('org/other', 12).forEach((path) => toggleFavorite('/org/other', path));
    await choose('org/other');
    await el.changeTab('starred');
    await update();
    expect(list().listItems.map(({ path }) => path))
      .to.deep.equal([...paths('org/site', 2), ...paths('org/other', 2)]);
    const item = list().listItems[2];
    const favorites = sinon.spy(el, 'loadFavorites');
    list().dispatchEvent(new CustomEvent('favoritechange', { detail: { item } }));
    await favorites.lastCall.returnValue;
    await update();
    el.shadowRoot.querySelector('.show-more').click();
    await update();
    expect(getSiteFavorites('/org/other')).not.to.include(item.path);
    expect(list().listItems.map(({ path }) => path))
      .to.deep.equal([...paths('org/site', 2), ...paths('org/other', 9).slice(1)]);
  });

  it('uses the picker scope for Favorite while retaining the active tab', async () => {
    paths('org/site', 2).forEach((path) => toggleFavorite('/org/site', path));
    paths('org/other', 2).forEach((path) => toggleFavorite('/org/other', path));
    await el.changeTab('starred');
    await update();
    expect(list().listItems.map(({ path }) => path)).to.deep.equal(paths('org/site', 2));
    await choose('org/other');
    expect(list().listItems.map(({ path }) => path))
      .to.deep.equal([...paths('org/site', 2), ...paths('org/other', 2)]);
    await choose('org/site');
    expect(list().listItems.map(({ path }) => path)).to.deep.equal(paths('org/other', 2));
    expect(el.shadowRoot.querySelector('.filter[aria-pressed="true"]').textContent).to.equal('Favorite');
  });

  it('reports failed favorite persistence and keeps the original favorite state', async () => {
    sinon.stub(Storage.prototype, 'setItem').throws(new Error('Storage unavailable'));
    const item = list().listItems[0];
    list().dispatchEvent(new CustomEvent('favoritechange', { detail: { item } }));
    await update();
    expect(el.shadowRoot.querySelector('[role="alert"]').textContent).to.include('Could not save');
    expect(list().listItems[0].isFavorited).to.equal(false);
    expect(getSiteFavorites('/org/site')).not.to.include(item.path);
  });

  it('discards an in-flight Favorite preview after changing favorites in Recent', async () => {
    setRecent({
      '/org/site': entries('org/site', 12),
      '/org/other': entries('org/other', 12, 100),
    });
    await choose('org/other');
    paths('org/site', 2).forEach((path) => toggleFavorite('/org/site', path));
    paths('org/other', 12).forEach((path) => toggleFavorite('/org/other', path));
    let started;
    let release;
    const requested = new Promise((resolve) => { started = resolve; });
    const pending = new Promise((resolve) => { release = resolve; });
    metadata.callsFake(async (path) => {
      if (path.startsWith('/org/other/')) {
        started();
        await pending;
      }
      return response();
    });
    const stale = el.changeTab('starred');
    await requested;
    try {
      await el.changeTab('recent');
      await update();
      list().dispatchEvent(new CustomEvent('favoritechange', { detail: { item: list().listItems[0] } }));
    } finally {
      release();
      await stale;
    }
    await el.changeTab('starred');
    await update();
    el.shadowRoot.querySelector('.show-more').click();
    await update();
    expect(list().listItems.map(({ path }) => path))
      .to.deep.equal([paths('org/site', 2)[1], ...paths('org/other', 9)]);
  });

  it('skips missing files before spilling over to another site', async () => {
    metadata.withArgs('/org/site/page-0.html').resolves(new Response(null, { status: 404 }));
    metadata.resetHistory();
    await el.loadSite();
    await update();
    el.shadowRoot.querySelector('.show-more').click();
    await update();
    expect(list().listItems.map(({ path }) => path)).to.deep.equal(paths('org/site', 11).slice(1));
    expect(metadata.getCalls().some(({ args }) => args[0].startsWith('/org/other/'))).to.equal(false);
  });

  it('shows a loading error and retries the preview', async () => {
    const preview = el.loadPreview.bind(el);
    sinon.stub(el, 'loadPreview').onFirstCall().rejects(new Error('Could not load files'));
    el.loadPreview.callThrough();
    await el.loadSite();
    await update();
    expect(el.shadowRoot.querySelector('[role="alert"]').textContent).to.equal('Could not load files');
    el.loadPreview.callsFake(preview);
    el.shadowRoot.querySelector('.empty-state button').click();
    await loadSite.lastCall.returnValue;
    await update();
    expect(el.shadowRoot.querySelector('[role="alert"]')).to.equal(null);
    expect(list().listItems.map(({ path }) => path)).to.deep.equal(paths('org/site', 4));
  });

  it('ignores stale responses when sites change and aborts work on disconnect', async () => {
    let started;
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    const requested = new Promise((resolve) => { started = resolve; });
    metadata.callsFake(async (path) => {
      if (path.startsWith('/org/other/')) {
        started();
        return pending;
      }
      return response();
    });
    changeSites(['org/site', 'org/other']);
    await requested;
    const stale = loadSite.lastCall.returnValue;
    try {
      expect(el.shadowRoot.querySelector('[role="status"]').textContent).to.include('Loading files');
      changeSites(['org/site']);
      await update();
      await loadSite.lastCall.returnValue;
      await update();
    } finally {
      release(response());
      await stale;
    }
    expect(list().listItems.every(({ path }) => path.startsWith('/org/site/'))).to.equal(true);
    metadata.resetHistory();
    el.remove();
    await el.loadSite();
    expect(metadata.called).to.equal(false);
  });

  it('mounts below recent-site cards and reloads only when their order changes', async () => {
    localStorage.setItem('da-sites', JSON.stringify(['org/site', 'org/other']));
    const sites = document.createElement('da-sites');
    document.body.append(sites);
    try {
      await new Promise((resolve) => { setTimeout(resolve, 0); });
      await sites.updateComplete;
      const preview = sites.shadowRoot.querySelector('da-recent-files');
      await update(preview);
      await loadSite.lastCall.returnValue;
      await update(preview);
      expect(preview.previousElementSibling.className).to.equal('da-sites-list');
      expect(preview.nextElementSibling.querySelector('h2').textContent).to.equal('Sites');
      expect(preview.scopes).to.deep.equal(['org/site', 'org/other']);
      const count = loadSite.callCount;
      sites.handleFlip(new Event('click'), sites._recents[0]);
      await sites.updateComplete;
      await update(preview);
      expect(loadSite.callCount).to.equal(count);
      sites.handleRemove(sites._recents[0]);
      await sites.updateComplete;
      await update(preview);
      await loadSite.lastCall.returnValue;
      expect(preview.scopes).to.deep.equal(['org/other']);
      sites.handleRemove(sites._recents[0]);
      await sites.updateComplete;
      expect(sites.shadowRoot.querySelector('da-recent-files')).to.equal(null);
      expect(sites.shadowRoot.querySelector('form')).to.exist;
    } finally {
      sites.remove();
    }
  });
});
