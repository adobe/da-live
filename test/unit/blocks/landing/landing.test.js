import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-nx.js';
import { getFavorites, toggleFavorite } from '../../../../blocks/browse/shared/favorites.js';
import init, { DaLanding } from '../../../../blocks/landing/landing.js';
import { getNx, getNx2, getNx2Api, getNxEWFlags } from '../../../../scripts/utils.js';

const { source, config } = await getNx2Api();
const { setEWEnabled, setChatAvailability } = await getNxEWFlags();
const { hashChange } = await import(`${getNx()}/utils/utils.js`);
const { CHAT_EVENT, setAoChat } = await import(`${getNx()}/utils/chat.js`);
const { PANEL_EVENT, setPanelMocks } = await import(`${getNx()}/utils/panel.js`);
const { getSiteOptions } = await import(`${getNx2()}/blocks/siteselector/site-utils.js`);
const { loadIms, handleSignIn } = await import(`${getNx2()}/utils/ims.js`);
const ITEMS = Array.from({ length: 24 }, (_, index) => ({ name: `Page ${index}`, path: `/org/site/page-${index}.html`, ext: 'html', lastModified: 24 - index }));

const setRecent = (recent) => localStorage.setItem('da-recent-files', JSON.stringify(recent));

describe('landing Content section', () => {
  let el;
  let loadSite;
  let metadata;
  let initialize;

  const fileList = () => el.shadowRoot.querySelector('da-list');
  const fileItems = () => fileList()?.shadowRoot.querySelectorAll('da-file-item') ?? [];

  async function updateLanding() {
    await el.updateComplete;
    await fileList()?.updateComplete;
    await Promise.all([...fileItems()].map((item) => item.updateComplete));
  }

  beforeEach(async () => {
    loadIms.reset();
    loadIms.resolves({ accessToken: { token: 'test-token' } });
    handleSignIn.resetHistory();
    initialize = sinon.spy(DaLanding.prototype, 'initialize');
    getSiteOptions.reset();
    getSiteOptions.returns([{ value: 'org/site', label: 'org/site' }]);
    ['da-favorites', 'da-browse-settings', 'da-sites', 'da-recent-files'].forEach((key) => localStorage.removeItem(key));
    localStorage.setItem('da-sites', JSON.stringify(['org/site']));
    loadSite = sinon.stub(DaLanding.prototype, 'loadSite').callsFake(async function loadSiteForTest() {
      this._request?.abort();
      this._request = new AbortController();
    });
    sinon.stub(config, 'get').resolves({ ok: true, json: async () => ({ data: [] }) });
    metadata = sinon.stub(source, 'getMetadata').callsFake(async () => new Response(
      null,
      { headers: { 'last-modified': 'Mon, 09 Nov 2026 12:00:00 GMT' } },
    ));
    el = document.createElement('da-landing');
    document.body.append(el);
    await initialize.lastCall.returnValue;
    el._files = ITEMS;
    el._favoriteFiles = [];
    el._editor = '/canvas#';
    await updateLanding();
  });

  afterEach(() => {
    el.remove();
    sinon.restore();
    loadIms.reset();
    loadIms.resolves({ accessToken: { token: 'test-token' } });
    handleSignIn.resetHistory();
    setEWEnabled(false);
    ['da-favorites', 'da-browse-settings', 'da-sites', 'da-recent-files'].forEach((key) => localStorage.removeItem(key));
  });

  it('renders only Content and reuses shared file cards', () => {
    expect(el.shadowRoot.querySelector('#files-heading').textContent).to.equal('Content');
    expect(fileItems()).to.have.length(6);
    expect(el.shadowRoot.querySelector('h1, textarea, .composer, nx-nav')).to.equal(null);
    expect(el.shadowRoot.querySelector('nx-siteselector, .site-picker')).to.equal(null);
    expect(fileItems()[0].href).to.include('/canvas');
    expect(fileList().fullpath).to.equal(undefined);
    expect(fileList().select).not.to.equal(true);
    expect(fileList().showFolder).to.equal(true);
    expect(fileList().sort).to.equal(false);
  });

  it('stops at the available files when fewer than eighteen exist', async () => {
    el._files = ITEMS.slice(0, 9);
    await updateLanding();
    el.shadowRoot.querySelector('.show-more').click();
    await updateLanding();
    expect(fileItems()).to.have.length(9);
    expect(el.shadowRoot.querySelector('.show-more')).to.equal(null);
  });

  it('expands Recent from six to eighteen and preserves files and preference across view changes', async () => {
    expect(fileItems()).to.have.length(6);
    el.shadowRoot.querySelector('.show-more').click();
    await updateLanding();
    expect(fileItems()).to.have.length(18);
    expect(el.shadowRoot.querySelector('.show-more')).to.equal(null);
    const switcher = el.shadowRoot.querySelector('nx-segmented-btn');
    for (const view of ['list', 'card']) {
      switcher.dispatchEvent(new CustomEvent('change', { detail: { value: view } }));
      await updateLanding();
      expect(el._view).to.equal(view);
      expect(el.shadowRoot.querySelector('.file-list').tabIndex).to.equal(view === 'list' ? 0 : -1);
      expect([...fileItems()].map((item) => item.path))
        .to.deep.equal(ITEMS.slice(0, 18).map((item) => item.path));
      expect(el.shadowRoot.querySelector('.show-more')).to.equal(null);
      expect(JSON.parse(localStorage.getItem('da-browse-settings')).view).to.equal(view);
    }
  });

  it('caps Favorite at six files in both views without deleting saved entries', async () => {
    el.shadowRoot.querySelector('.show-more').click();
    ITEMS.forEach((item) => toggleFavorite('/org/site', item.path));
    el.refreshFavorites();
    el.changeTab('starred');
    await updateLanding();
    expect(fileItems()).to.have.length(6);
    expect(el.shadowRoot.querySelector('.show-more')).to.equal(null);
    el.changeView({ detail: { value: 'list' } });
    await updateLanding();
    expect(fileItems()).to.have.length(6);
    expect(el.shadowRoot.querySelector('.show-more')).to.equal(null);
    expect(getFavorites('/org/site')).to.have.length(24);
    el.changeTab('recent');
    await updateLanding();
    expect(fileItems()).to.have.length(6);
  });

  it('keeps same-named favorites consistent when an older file falls outside initial Recent', async () => {
    const root = { name: 'coffee', path: '/org/site/coffee.html', ext: 'html' };
    const nested = { name: 'coffee', path: '/org/site/de/coffee.html', ext: 'html' };
    el._files = [root, ...ITEMS.slice(0, 5), nested];
    toggleFavorite('/org/site', root.path);
    toggleFavorite('/org/site/de', nested.path);
    el.refreshFavorites();
    for (const view of ['card', 'list']) {
      el.changeView({ detail: { value: view } });
      el.changeTab('recent');
      await updateLanding();
      expect([...fileItems()].filter((item) => item.name === 'coffee').map((item) => item.path))
        .to.deep.equal([root.path]);
      expect(fileItems()[0].shadowRoot.querySelector('button[aria-pressed="true"]')).not.to.equal(null);
      el.changeTab('starred');
      await updateLanding();
      expect([...fileItems()].map((item) => item.path)).to.deep.equal([root.path, nested.path]);
      expect([...fileItems()].every((item) => item.shadowRoot.querySelector('button[aria-pressed="true"]'))).to.equal(true);
      el.changeTab('recent');
      await updateLanding();
      el.shadowRoot.querySelector('.show-more').click();
      await updateLanding();
      const coffees = [...fileItems()].filter((item) => item.name === 'coffee');
      expect(coffees.map((item) => item.path)).to.deep.equal([root.path, nested.path]);
      expect(coffees.every((item) => item.shadowRoot.querySelector('button[aria-pressed="true"]'))).to.equal(true);
    }
  });

  it('reports failed favorite storage without pretending the item was saved', async () => {
    sinon.stub(Storage.prototype, 'setItem').throws(new DOMException('QuotaExceededError'));
    el.starFile(ITEMS[0]);
    await updateLanding();
    expect(el.shadowRoot.querySelector('[role="alert"]').textContent).to.include('Could not save your favorites');
    expect(fileItems()[0].isFavorited).not.to.equal(true);
  });

  it('shows nested Browse favorites with their folder and persists unstar in the same folder in both views', async () => {
    loadSite.restore();
    const coffee = { name: 'coffee', path: '/org/site/de/coffee.html', ext: 'html' };
    toggleFavorite('/org/site/de', coffee.path);
    await el.loadSite();
    el.refreshFavorites();
    await el.changeTab('starred');
    for (const view of ['card', 'list']) {
      el.changeView({ detail: { value: view } });
      await updateLanding();
      expect(fileItems()).to.have.length(1);
      expect(fileItems()[0].path).to.equal(coffee.path);
      expect(fileItems()[0].folder.label).to.equal('/de');
      expect(new URL(fileItems()[0].folder.href).hash).to.equal('#/org/site/de');
      fileItems()[0].requestFavorite();
      await updateLanding();
      expect(getFavorites('/org/site/de')).to.deep.equal([]);
      expect(getFavorites('/org/site')).to.deep.equal([]);
      expect(fileItems()).to.have.length(0);
      el.starFile(coffee);
      await updateLanding();
      expect(getFavorites('/org/site/de')).to.deep.equal([coffee.path]);
    }
  });

  it('keeps folder favorites without file metadata in both views', async () => {
    loadSite.restore();
    const folder = '/org/site/docs';
    const file = ITEMS[0].path;
    toggleFavorite('/org/site', file);
    toggleFavorite('/org/site', folder);
    metadata.withArgs(folder).resolves(new Response(null, { status: 404 }));
    await el.loadSite();
    el.refreshFavorites();
    await el.changeTab('starred');
    for (const view of ['card', 'list']) {
      el.changeView({ detail: { value: view } });
      await updateLanding();
      expect([...fileItems()].map((item) => item.path)).to.have.members([file, folder]);
      const item = [...fileItems()].find((entry) => entry.path === folder);
      expect(item.name).to.equal('docs');
      expect(new URL(item.href).hash).to.equal('#/org/site/docs');
    }
    [...fileItems()].find((item) => item.path === folder).requestFavorite();
    await updateLanding();
    expect([...fileItems()].map((item) => item.path)).to.deep.equal([file]);
    expect(getFavorites('/org/site')).to.deep.equal([file]);
    expect(metadata.calledOnceWithExactly(file)).to.equal(true);
  });

  it('unstars a favorite saved in an ancestor folder without re-saving it elsewhere', async () => {
    const misplaced = { name: 'a', path: '/org/site/de/a.html', ext: 'html' };
    const sameName = { name: 'a', path: '/org/site/a.html', ext: 'html' };
    const otherSite = '/other/site/de/a.html';
    localStorage.setItem('da-favorites', JSON.stringify({
      '/org/site': [misplaced.path, sameName.path],
      '/other/site/de': [otherSite],
    }));
    el._files = [sameName, misplaced];
    el.refreshFavorites();
    el.changeTab('starred');
    await updateLanding();
    [...fileItems()].find((item) => item.path === misplaced.path).requestFavorite();
    await updateLanding();
    expect([...fileItems()].map((item) => item.path)).to.deep.equal([sameName.path]);
    expect(JSON.parse(localStorage.getItem('da-favorites'))).to.deep.equal({
      '/org/site': [sameName.path],
      '/other/site/de': [otherSite],
    });
    expect(el.shadowRoot.querySelector('[role="alert"]')).to.equal(null);
  });

  it('uses the first shared saved-site option after authentication without changing the route', async () => {
    el.remove();
    loadSite.restore();
    loadSite = sinon.spy(DaLanding.prototype, 'loadSite');
    const { href } = window.location;
    const path = '/selected/site/page.html';
    const recentSites = ['invalid', 'selected/site', 'history/site'];
    localStorage.setItem('da-sites', JSON.stringify(recentSites));
    getSiteOptions.withArgs({ recentSites }).returns([
      { value: 'selected/site', label: 'selected/site' },
      { value: 'history/site', label: 'history/site' },
    ]);
    setRecent({ '/selected/site': [path] });
    let resolveMetadata;
    metadata.returns(new Promise((resolve) => { resolveMetadata = resolve; }));
    el = document.createElement('da-landing');
    document.body.append(el);
    await initialize.lastCall.returnValue;
    expect(el.path).to.equal('/selected/site');
    expect(loadSite.calledOnce).to.equal(true);
    await updateLanding();
    expect(el.shadowRoot.querySelector('.welcome')).to.equal(null);
    expect(el.shadowRoot.querySelector('[role="status"]').textContent).to.equal('Loading files...');
    resolveMetadata(new Response());
    await loadSite.firstCall.returnValue;
    await updateLanding();
    expect([...fileItems()].map((item) => item.path)).to.deep.equal([path]);
    expect(metadata.calledOnceWithExactly(path)).to.equal(true);
    expect(getSiteOptions.calledWithExactly({ recentSites })).to.equal(true);
    expect(window.location.href).to.equal(href);
  });

  it('redirects missing, invalid and unreadable site history before authentication or file loading', async () => {
    const redirect = sinon.stub(DaLanding.prototype, 'redirectToStart');
    getSiteOptions.returns([]);
    loadIms.resetHistory();
    loadSite.resetHistory();
    for (const history of [null, '["invalid"]', '{']) {
      el.remove();
      if (history === null) localStorage.removeItem('da-sites');
      else localStorage.setItem('da-sites', history);
      el = document.createElement('da-landing');
      document.body.append(el);
      await initialize.lastCall.returnValue;
      await updateLanding();
      expect(el.shadowRoot.querySelector('.files-panel, form')).to.equal(null);
    }
    expect(redirect.callCount).to.equal(3);
    expect(loadIms.called).to.equal(false);
    expect(handleSignIn.called).to.equal(false);
    expect(loadSite.called).to.equal(false);
  });

  it('waits for IMS and starts sign-in only once for a returning signed-out user', async () => {
    el.remove();
    loadSite.resetHistory();
    let resolveIms;
    loadIms.returns(new Promise((resolve) => { resolveIms = resolve; }));
    el = document.createElement('da-landing');
    document.body.append(el);
    await updateLanding();
    expect(el.shadowRoot.querySelector('.files-panel, form')).to.equal(null);
    expect(loadSite.called).to.equal(false);
    expect(handleSignIn.called).to.equal(false);
    resolveIms({ anonymous: true });
    await initialize.lastCall.returnValue;
    el.requestUpdate();
    await updateLanding();
    expect(handleSignIn.calledOnce).to.equal(true);
    expect(loadSite.called).to.equal(false);
    expect(el.shadowRoot.querySelector('.files-panel, form')).to.equal(null);
  });

  it('reloads after a cached IMS failure instead of retrying the rejected initialization', async () => {
    el.remove();
    loadSite.resetHistory();
    loadIms.resetHistory();
    loadIms.returns(Promise.reject(new Error('IMS unavailable')));
    const reload = sinon.stub(DaLanding.prototype, 'reloadPage');
    el = document.createElement('da-landing');
    document.body.append(el);
    await initialize.lastCall.returnValue;
    await updateLanding();
    expect(el.shadowRoot.querySelector('[role="alert"]').textContent).to.contain('Could not sign in');
    expect(loadSite.called).to.equal(false);
    expect(handleSignIn.called).to.equal(false);
    expect(loadIms.calledOnce).to.equal(true);
    el.shadowRoot.querySelector('button').click();
    await updateLanding();
    expect(reload.calledOnce).to.equal(true);
    expect(loadIms.calledOnce).to.equal(true);
    expect(loadSite.called).to.equal(false);
    expect(el.shadowRoot.querySelector('.files-panel')).to.equal(null);
    expect(handleSignIn.called).to.equal(false);
  });

  it('does not start sign-in or load files after leaving while IMS is pending', async () => {
    el.remove();
    loadSite.resetHistory();
    let resolveIms;
    loadIms.returns(new Promise((resolve) => { resolveIms = resolve; }));
    el = document.createElement('da-landing');
    document.body.append(el);
    el.remove();
    resolveIms({ anonymous: true });
    await initialize.lastCall.returnValue;
    expect(handleSignIn.called).to.equal(false);
    expect(loadSite.called).to.equal(false);
  });

  it('updates Content from the external nav selection without changing the route', async () => {
    const { href } = window.location;
    document.dispatchEvent(new CustomEvent('site-select', { detail: { value: 'another/site' } }));
    await updateLanding();
    expect(el.path).to.equal('/another/site');
    expect(window.location.href).to.equal(href);
    expect(loadSite.callCount).to.equal(2);
  });

  it('resets filters, expansion and favorites on a site change', async () => {
    toggleFavorite('/org/site', ITEMS[0].path);
    el.refreshFavorites();
    el.changeTab('starred');
    el._limit = 18;
    el.setScope({ org: 'other', site: 'site' });
    await updateLanding();
    expect(el._tab).to.equal('recent');
    expect(el._limit).to.equal(6);
    expect(el._favorites.size).to.equal(0);
    expect(loadSite.callCount).to.equal(2);
  });

  it('stops reacting to nav selection and cached restore after removal', () => {
    el.remove();
    const favorites = sinon.spy(el, 'refreshFavorites');
    document.dispatchEvent(new CustomEvent('site-select', { detail: { value: 'other/site' } }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    expect(el.path).to.equal('/org/site');
    expect(favorites.called).to.equal(false);
  });

  it('shows loading, empty and retry states distinctly', async () => {
    el._files = undefined;
    await updateLanding();
    expect(el.shadowRoot.querySelector('[aria-busy="true"]')).not.to.equal(null);
    expect(el.shadowRoot.querySelector('[role="status"]').textContent).to.equal('Loading files...');
    const spinner = el.shadowRoot.querySelector('[role="status"] .nx-loading-spinner');
    expect(spinner.getAttribute('aria-hidden')).to.equal('true');
    el._files = [];
    await updateLanding();
    expect(el.shadowRoot.querySelector('.empty-state h3').textContent).to.equal('No recent files yet');
    expect(el.shadowRoot.querySelector('.nx-loading-spinner')).to.equal(null);
    el._error = 'Permission denied';
    await updateLanding();
    expect(el.shadowRoot.querySelector('[role="alert"]').textContent).to.equal('Permission denied');
    el.shadowRoot.querySelector('.empty-state button').click();
    expect(loadSite.callCount).to.equal(2);
  });

  it('disables image previews for Content cards', async () => {
    const get = sinon.spy(source, 'get');
    el._files = [{ name: 'image', path: '/org/site/image.png', ext: 'png' }];
    await updateLanding();
    expect(fileItems()[0].imagePreview).to.equal(false);
    expect(get.called).to.equal(false);
  });

  ['card', 'list'].forEach((view) => {
    it(`opens link shortcuts at their saved destination in ${view} view`, async () => {
      const path = '/org/site/reference.link';
      const externalUrl = 'https://example.com/destination?view=full#section';
      const get = sinon.stub(source, 'get').resolves({ ok: true, json: async () => ({ externalUrl }) });
      el._files = [{ name: 'reference', path, ext: 'link' }];
      el.changeView({ detail: { value: view } });
      await updateLanding();
      const item = fileItems()[0];
      await item.href;
      await item.updateComplete;
      const links = [...item.shadowRoot.querySelectorAll(
        view === 'card' ? '.card-preview, [slot="heading"]' : '.da-item-list-item-title',
      )];
      expect(links).to.have.length(view === 'card' ? 2 : 1);
      expect(links.every((link) => link.getAttribute('href') === externalUrl)).to.equal(true);
      expect(get.calledOnceWithExactly(path)).to.equal(true);
    });
  });

  it('preserves Recent order and persists favorites once without reloading in both views', async () => {
    toggleFavorite('/org/site', ITEMS[2].path);
    el.refreshFavorites();
    await updateLanding();
    const toggle = sinon.spy(el, 'starFile');
    for (const view of ['card', 'list']) {
      el.changeView({ detail: { value: view } });
      await updateLanding();
      expect([...fileItems()].slice(0, 3).map((item) => item.path))
        .to.deep.equal(ITEMS.slice(0, 3).map((item) => item.path));
      expect(fileItems()[2].isFavorited).to.equal(true);
      fileItems()[0].requestFavorite();
      await updateLanding();
      expect(fileItems()[0].isFavorited).to.equal(view === 'card');
    }
    expect(toggle.callCount).to.equal(2);
    expect(getFavorites('/org/site')).to.deep.equal([ITEMS[2].path]);
    expect(loadSite.callCount).to.equal(1);
  });

  it('loads the selected site with main APIs and selects the classic editor when EW is off', async () => {
    loadSite.restore();
    setRecent({ '/org/site': ITEMS.map(({ path }) => path) });
    await el.loadSite();
    await updateLanding();
    expect(metadata.getCalls().map(({ args: [path] }) => path))
      .to.deep.equal(ITEMS.map(({ path }) => path));
    expect(el._editor).to.equal('/edit#');
    expect(fileItems()[0].href).to.include('/edit');
  });

  it('reloads Recent and favorites only on cached Back/Forward restores, preserving view state', async () => {
    loadSite.restore();
    loadSite = sinon.spy(DaLanding.prototype, 'loadSite');
    setRecent({ '/org/site': [ITEMS[0].path] });
    toggleFavorite('/org/site', ITEMS[0].path);
    el.refreshFavorites();
    await el.loadSite();
    el.changeView({ detail: { value: 'list' } });
    await el.changeTab('starred');
    el._limit = 18;
    await updateLanding();
    setRecent({ '/org/site': [ITEMS[2].path, ITEMS[0].path] });
    toggleFavorite('/org/site', ITEMS[0].path);
    toggleFavorite('/org/site', ITEMS[1].path);
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new StorageEvent('storage', { key: 'da-recent-files' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'da-favorites' }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
    expect(loadSite.callCount).to.equal(1);
    expect(el._files.map(({ path }) => path)).to.deep.equal([ITEMS[0].path]);
    expect([...fileItems()].map((item) => item.path)).to.deep.equal([ITEMS[0].path]);
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    expect(loadSite.callCount).to.equal(2);
    await loadSite.secondCall.returnValue;
    await updateLanding();
    expect(el._files.map(({ path }) => path)).to.deep.equal([ITEMS[2].path, ITEMS[0].path]);
    expect([...fileItems()].map((item) => item.path)).to.deep.equal([ITEMS[1].path]);
    expect(el._tab).to.equal('starred');
    expect(el._view).to.equal('list');
    expect(el._limit).to.equal(18);
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    expect(loadSite.callCount).to.equal(3);
    await loadSite.thirdCall.returnValue;
  });

  it('ignores a stale site response and aborts the active request on disconnect', async () => {
    loadSite.restore();
    let finish;
    metadata.onFirstCall().returns(new Promise((resolve) => { finish = resolve; }));
    const currentItem = { ...ITEMS[1], path: '/other/site/page-1.html' };
    setRecent({ '/org/site': [ITEMS[0].path], '/other/site': [currentItem.path] });
    const pending = el.loadSite();
    await Promise.resolve();
    el._scope = 'other/site';
    await el.loadSite();
    finish(new Response(null));
    await pending;
    expect(el._files.map(({ path }) => path)).to.deep.equal([currentItem.path]);
    const request = el._request;
    el.remove();
    expect(request.signal.aborted).to.equal(true);
  });

  it('selects Canvas when EW is enabled', async () => {
    loadSite.restore();
    setRecent({ '/org/site': [ITEMS[0].path] });
    setEWEnabled(true);
    await el.loadSite();
    await updateLanding();
    expect(el._editor).to.equal('/canvas#');
    expect(fileItems()[0].href).to.include('/canvas');
  });

  it('uses org and site editor settings for each file in both views, even with EW enabled', async () => {
    loadSite.restore();
    el._scope = 'configured/site';
    config.get.callsFake(async ({ site }) => ({
      ok: true,
      json: async () => ({
        data: site ? [
          { key: 'editor.path', value: '/configured/site/forms=/form#' },
        ] : [
          { key: 'editor.path', value: '/configured/site=https://experience.adobe.com/editor' },
          { key: 'editor.path', value: '/configured/site/forms=/edit#' },
        ],
      }),
    }));
    setRecent({ '/configured/site': ['/configured/site/forms/a.html', '/configured/site/b.html', '/configured/site/forms/data.json'] });
    setEWEnabled(true);
    await el.loadSite();
    for (const view of ['card', 'list']) {
      el.changeView({ detail: { value: view } });
      await updateLanding();
      expect(new URL(fileItems()[0].href).pathname).to.equal('/form');
      expect(fileItems()[1].href).to.equal('https://experience.adobe.com/editor/b');
      expect(new URL(fileItems()[2].href).pathname).to.equal('/sheet');
      for (const item of fileItems()) {
        expect(item.shadowRoot.querySelector('a[href]').href).to.equal(item.href);
      }
    }
    expect(config.get.calledWith({ org: 'configured', site: undefined })).to.equal(true);
    expect(config.get.calledWith({ org: 'configured', site: 'site' })).to.equal(true);
  });

  it('waits for editor settings and ignores settings from a previous site', async () => {
    loadSite.restore();
    el._scope = 'pending-config/site';
    let finish;
    config.get.callsFake(async ({ org, site }) => {
      if (org === 'pending-config' && site) {
        return new Promise((resolve) => { finish = resolve; });
      }
      return { ok: true, json: async () => ({ data: [] }) };
    });
    setRecent({ '/other/site': ['/other/site/page-0.html'] });
    const pending = el.loadSite();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(el._files).to.equal(undefined);
    el._scope = 'other/site';
    await el.loadSite();
    finish({
      ok: true,
      json: async () => ({ data: [{ key: 'editor.path', value: '/pending-config/site=/form#' }] }),
    });
    await pending;
    await updateLanding();
    expect(el._editorConfs).to.deep.equal([]);
    expect(new URL(fileItems()[0].href).pathname).to.equal('/edit');
  });

  it('does not expose files with an unresolved or stale editor flag', async () => {
    loadSite.restore();
    let finish;
    setEWEnabled(new Promise((resolve) => { finish = resolve; }));
    const pending = el.loadSite();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(el._files).to.equal(undefined);
    setEWEnabled(false);
    el._scope = 'other/site';
    await el.loadSite();
    finish(true);
    await pending;
    expect(el._editor).to.equal('/edit#');
  });

  it('falls back to the classic editor when the EW flag fails', async () => {
    loadSite.restore();
    setRecent({ '/org/site': ITEMS.slice(0, 18).map(({ path }) => path) });
    setEWEnabled(Promise.reject(new Error('Flag unavailable')));
    await el.loadSite();
    expect(el._editor).to.equal('/edit#');
    expect(el._files).to.have.length(18);
  });

  it('loads Recent first and caches missing Favorite metadata only after opening the tab', async () => {
    loadSite.restore();
    const coffee = '/org/site/de/coffee.html';
    setRecent({ '/org/site': [ITEMS[3].path, ITEMS[1].path] });
    toggleFavorite('/org/site', ITEMS[1].path);
    toggleFavorite('/org/site/de', coffee);
    let finish;
    const pending = new Promise((resolve) => { finish = resolve; });
    metadata.withArgs(coffee).returns(pending);
    await el.loadSite();
    await updateLanding();
    expect(metadata.getCalls().map(({ args: [path] }) => path))
      .to.deep.equal([ITEMS[3].path, ITEMS[1].path]);
    expect([...fileItems()].map(({ path }) => path)).to.deep.equal([ITEMS[3].path, ITEMS[1].path]);
    const favorites = el.changeTab('starred');
    await updateLanding();
    expect(el.shadowRoot.querySelector('[aria-busy="true"]')).not.to.equal(null);
    expect(el.shadowRoot.querySelector('.nx-loading-spinner')).not.to.equal(null);
    await el.changeTab('starred');
    expect(metadata.withArgs(coffee).calledOnce).to.equal(true);
    el.changeTab('recent');
    await updateLanding();
    expect([...fileItems()].map(({ path }) => path)).to.deep.equal([ITEMS[3].path, ITEMS[1].path]);
    finish(new Response(null));
    await favorites;
    await el.changeTab('starred');
    await updateLanding();
    expect([...fileItems()].map(({ path }) => path)).to.have.members([ITEMS[1].path, coffee]);
    expect(el.shadowRoot.querySelector('[aria-busy="true"]')).to.equal(null);
    expect(metadata.callCount).to.equal(3);
    el.changeTab('recent');
    await el.loadSite();
    expect(metadata.withArgs(coffee).calledOnce).to.equal(true);
    await el.changeTab('starred');
    expect(metadata.withArgs(coffee).calledTwice).to.equal(true);
  });

  it('loads Favorite when selected before Recent finishes', async () => {
    loadSite.restore();
    setRecent({ '/org/site': [ITEMS[0].path] });
    toggleFavorite('/org/site', ITEMS[1].path);
    let finish;
    metadata.withArgs(ITEMS[0].path).returns(new Promise((resolve) => { finish = resolve; }));
    const pending = el.loadSite();
    await el.changeTab('starred');
    expect(metadata.withArgs(ITEMS[1].path).called).to.equal(false);
    finish(new Response(null));
    await pending;
    await updateLanding();
    expect([...fileItems()].map(({ path }) => path)).to.deep.equal([ITEMS[1].path]);
  });

  it('discards pending Favorite metadata when switching sites', async () => {
    loadSite.restore();
    toggleFavorite('/org/site', ITEMS[0].path);
    await el.loadSite();
    let finish;
    metadata.withArgs(ITEMS[0].path).returns(new Promise((resolve) => { finish = resolve; }));
    const pending = el.changeTab('starred');
    await updateLanding();
    await el.setScope({ org: 'other', site: 'site' });
    await el.changeTab('starred');
    finish(new Response(null));
    await pending;
    await updateLanding();
    expect(el._favoriteFiles).to.deep.equal([]);
    expect(fileItems()).to.have.length(0);
    expect(el.shadowRoot.querySelector('[role="alert"]')).to.equal(null);
  });
});

describe('landing chat', () => {
  let el;
  let initialize;
  let loadSite;
  let registered;
  let panelEvents;
  const onPanel = ({ type, detail }) => panelEvents.push([type, detail.section]);

  const waitFor = async (check) => {
    for (let i = 0; i < 50; i += 1) {
      if (check()) return;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => { setTimeout(resolve, 10); });
    }
    throw new Error('Timed out waiting for the landing');
  };

  const mount = async () => {
    const landing = init(el);
    await initialize.lastCall.returnValue;
    await landing.updateComplete;
    return landing;
  };

  beforeEach(() => {
    loadIms.reset();
    loadIms.resolves({ accessToken: { token: 'test-token' } });
    getSiteOptions.returns([{ value: 'org/site' }]);
    localStorage.setItem('da-sites', JSON.stringify(['org/site']));
    initialize = sinon.spy(DaLanding.prototype, 'initialize');
    loadSite = sinon.stub(DaLanding.prototype, 'loadSite').resolves();
    registered = [];
    panelEvents = [];
    setPanelMocks({ register: (...args) => registered.push(args) });
    document.addEventListener(PANEL_EVENT.OPEN, onPanel);
    document.addEventListener(PANEL_EVENT.CLOSE, onPanel);
    el = document.createElement('div');
    document.body.append(el);
  });

  afterEach(() => {
    el.remove();
    document.removeEventListener(PANEL_EVENT.OPEN, onPanel);
    document.removeEventListener(PANEL_EVENT.CLOSE, onPanel);
    setPanelMocks();
    setAoChat(async () => false);
    setChatAvailability(async () => false);
    hashChange._set({});
    initialize.restore();
    loadSite.restore();
    getSiteOptions.returns([]);
    localStorage.removeItem('da-sites');
  });

  it('shows no greeting or chat without a site context', async () => {
    hashChange._set({ org: 'org' });
    const landing = await mount();
    await waitFor(() => panelEvents.length);
    await landing.updateComplete;
    expect(landing.shadowRoot.querySelector('h1')).to.equal(null);
    expect(landing.shadowRoot.querySelector('nx-ao-input')).to.equal(null);
    expect(registered).to.deep.equal([]);
    expect(panelEvents).to.deep.equal([[PANEL_EVENT.CLOSE, 'chat']]);
  });

  it('registers the chat panel and renders the shared compact input when AO chat is enabled', async () => {
    setChatAvailability(async () => true);
    setAoChat(async () => true);
    hashChange._set({ org: 'org', site: 'enabled' });
    const landing = await mount();
    await waitFor(() => landing.shadowRoot.querySelector('nx-ao-input'));
    const input = landing.shadowRoot.querySelector('nx-ao-input');
    expect(landing.shadowRoot.querySelector('.files-panel')).not.to.equal(null);
    expect(landing.shadowRoot.querySelector('h1')).to.equal(null);
    expect(input.hasAttribute('org')).to.equal(false);
    expect(input.onSubmit).to.equal(undefined);
    expect(input.getAttribute('placeholder')).to.equal('Ask a question, share an idea, or add a task.');
    expect(registered).to.have.length(1);
    expect(registered[0][0]).to.equal('chat');
    expect(registered[0][1]).to.include({ position: 'before', width: '400px' });

    input.dispatchEvent(new CustomEvent(CHAT_EVENT.MESSAGE_SENT, { bubbles: true, composed: true, detail: { org: 'org', site: 'enabled' } }));
    expect(panelEvents).to.deep.equal([[PANEL_EVENT.OPEN, 'chat']]);
  });

  it('keeps the sidebar chat but no compact input for the legacy chat', async () => {
    setChatAvailability(async () => true);
    hashChange._set({ org: 'org', site: 'legacy' });
    const landing = await mount();
    await waitFor(() => registered.length);
    await landing.updateComplete;
    expect(landing.shadowRoot.querySelector('nx-ao-input')).to.equal(null);
  });

  it('removes the input when chat becomes unavailable and stops listening on disconnect', async () => {
    setChatAvailability(async ({ site }) => site === 'enabled');
    setAoChat(async () => true);
    hashChange._set({ org: 'org', site: 'enabled' });
    const landing = await mount();
    await waitFor(() => landing.shadowRoot.querySelector('nx-ao-input'));
    hashChange._set({ org: 'org', site: 'disabled' });
    await waitFor(() => !landing.shadowRoot.querySelector('nx-ao-input') && panelEvents.length);
    expect(panelEvents).to.deep.equal([[PANEL_EVENT.CLOSE, 'chat']]);

    el.replaceChildren();
    landing.dispatchEvent(new CustomEvent(CHAT_EVENT.MESSAGE_SENT));
    expect(panelEvents).to.deep.equal([[PANEL_EVENT.CLOSE, 'chat']]);
  });
});
