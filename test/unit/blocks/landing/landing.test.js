import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-nx.js';
import { getFavorites, toggleFavorite } from '../../../../blocks/browse/shared/favorites.js';
import { DaLanding } from '../../../../blocks/landing/landing.js';
import { getNx2Api, getNxEWFlags } from '../../../../scripts/utils.js';

const { source, config } = await getNx2Api();
const { setEWEnabled } = await getNxEWFlags();
const ITEMS = Array.from({ length: 24 }, (_, index) => ({ name: `Page ${index}`, path: `/org/site/page-${index}.html`, ext: 'html', lastModified: 24 - index }));

describe('landing Content section', () => {
  let el;
  let loadSite;

  const fileList = () => el.shadowRoot.querySelector('da-list');
  const fileItems = () => fileList()?.shadowRoot.querySelectorAll('da-file-item') ?? [];

  async function updateLanding() {
    await el.updateComplete;
    await fileList()?.updateComplete;
    await Promise.all([...fileItems()].map((item) => item.updateComplete));
  }

  beforeEach(async () => {
    ['da-favorites', 'da-browse-settings', 'da-sites'].forEach((key) => localStorage.removeItem(key));
    loadSite = sinon.stub(DaLanding.prototype, 'loadSite').callsFake(async function loadSiteForTest() {
      this._request?.abort();
      this._request = new AbortController();
    });
    sinon.stub(config, 'get').resolves({ ok: true, json: async () => ({ data: [] }) });
    el = document.createElement('da-landing');
    document.body.append(el);
    el.setScope({ org: 'org', site: 'site' });
    el._files = ITEMS;
    el._editor = '/canvas#';
    await updateLanding();
  });

  afterEach(() => {
    el.remove();
    sinon.restore();
    setEWEnabled(false);
    ['da-favorites', 'da-browse-settings', 'da-sites'].forEach((key) => localStorage.removeItem(key));
  });

  it('renders only Content and reuses shared file cards', () => {
    expect(el.shadowRoot.querySelector('#files-heading').textContent).to.equal('Content');
    expect(fileItems()).to.have.length(6);
    expect(el.shadowRoot.querySelector('h1, textarea, .composer, nx-nav')).to.equal(null);
    expect(el.shadowRoot.querySelector('nx-siteselector, .site-picker')).to.equal(null);
    expect(fileItems()[0].href).to.include('/canvas');
    expect(el.shadowRoot.querySelector('da-landing-file-actions')).to.equal(null);
    expect(fileList().fullpath).to.equal(undefined);
    expect(fileList().select).not.to.equal(true);
    expect(fileList().shadowRoot.querySelector('input[name="select-all"]')).to.equal(null);
    expect(fileList().shadowRoot.querySelector('da-actionbar').dataset.visible).to.equal('false');
  });

  it('keeps the panel opaque in both views and color schemes', async () => {
    const sheet = new CSSStyleSheet();
    await sheet.replace(await (await fetch('/blocks/landing/landing-content.css')).text());
    el.shadowRoot.adoptedStyleSheets = [...el.shadowRoot.adoptedStyleSheets, sheet];
    el.style.setProperty('--s2-gray-25', 'light-dark(rgb(255 255 255), rgb(17 17 17))');
    for (const [theme, background] of [['light', 'rgb(255, 255, 255)'], ['dark', 'rgb(17, 17, 17)']]) {
      el.style.colorScheme = theme;
      for (const view of ['card', 'list']) {
        el.changeView({ detail: { value: view } });
        await updateLanding();
        expect(getComputedStyle(el.shadowRoot.querySelector('.files-panel')).backgroundColor)
          .to.equal(background);
      }
    }
  });

  it('keeps fixed cards, whole columns and 16px panel insets at narrower widths', async () => {
    const sheet = new CSSStyleSheet();
    await sheet.replace(await (await fetch('/blocks/landing/landing-content.css')).text());
    el.shadowRoot.adoptedStyleSheets = [...el.shadowRoot.adoptedStyleSheets, sheet];
    el.style.setProperty('--s2-spacing-200', '12px');
    el.style.setProperty('--s2-spacing-300', '16px');
    el.style.setProperty('--s2-spacing-400', '24px');
    const listSheet = new CSSStyleSheet();
    const listStyles = await fetch('/blocks/browse/v2/da-list/da-list.css');
    await listSheet.replace(await listStyles.text());
    const list = fileList();
    list.shadowRoot.adoptedStyleSheets = [...list.shadowRoot.adoptedStyleSheets, listSheet];
    const grid = list.shadowRoot.querySelector('.da-card-grid');
    for (const [width, columns] of [[500, '151px 151px 151px'], [320, '151px 151px'], [150, '150px']]) {
      grid.style.width = `${width}px`;
      expect(getComputedStyle(grid).gridTemplateColumns).to.equal(columns);
    }
    grid.style.removeProperty('width');
    for (const width of [1360, 960, 560]) {
      el.style.width = `${width}px`;
      const panel = el.shadowRoot.querySelector('.files-panel').getBoundingClientRect();
      const row = grid.getBoundingClientRect();
      const columns = getComputedStyle(grid).gridTemplateColumns.split(' ');
      expect(row.left - panel.left).to.equal(16);
      expect(panel.right - row.right).to.equal(16);
      expect(row.width).to.equal(columns.length * 151 + (columns.length - 1) * 12);
    }
  });

  it('expands Recent directly from six to eighteen and then hides Show more', async () => {
    el.shadowRoot.querySelector('.show-more').click();
    await updateLanding();
    expect(fileItems()).to.have.length(18);
    expect(el.shadowRoot.querySelector('.show-more')).to.equal(null);
  });

  it('matches panel widths across views and loading, empty and error states', async () => {
    const sheet = new CSSStyleSheet();
    await sheet.replace(await (await fetch('/blocks/landing/landing-content.css')).text());
    el.shadowRoot.adoptedStyleSheets = [...el.shadowRoot.adoptedStyleSheets, sheet];
    el.style.setProperty('--s2-spacing-200', '12px');
    el.style.setProperty('--s2-spacing-300', '16px');
    el.style.setProperty('--s2-spacing-400', '24px');
    el.style.setProperty('--s2-spacing-800', '64px');
    const states = [
      { files: undefined, error: undefined },
      { files: [], error: undefined },
      { files: undefined, error: 'Permission denied' },
    ];
    for (const width of [1360, 960, 560]) {
      el.style.width = `${width}px`;
      const widths = {};
      for (const view of ['card', 'list']) {
        el.changeView({ detail: { value: view } });
        el._files = ITEMS;
        el._error = undefined;
        await updateLanding();
        const panel = el.shadowRoot.querySelector('.files-panel');
        widths[view] = panel.getBoundingClientRect().width;
        for (const { files, error } of states) {
          el._files = files;
          el._error = error;
          await updateLanding();
          expect(panel.getBoundingClientRect().width).to.equal(widths[view]);
        }
      }
      expect(widths.list).to.equal(widths.card);
    }
  });

  it('aligns shared headers and rows and scrolls only when readable columns do not fit', async () => {
    const sheet = new CSSStyleSheet();
    await sheet.replace(await (await fetch('/blocks/landing/landing-content.css')).text());
    el.shadowRoot.adoptedStyleSheets = [...el.shadowRoot.adoptedStyleSheets, sheet];
    el.style.setProperty('--s2-spacing-200', '12px');
    el.style.setProperty('--s2-spacing-300', '16px');
    el.style.setProperty('--s2-spacing-400', '24px');
    el.changeView({ detail: { value: 'list' } });
    await updateLanding();
    const listSheet = new CSSStyleSheet();
    await listSheet.replace(await (await fetch('/blocks/browse/v2/da-list/da-list.css')).text());
    fileList().shadowRoot.adoptedStyleSheets = [
      ...fileList().shadowRoot.adoptedStyleSheets,
      listSheet,
    ];
    const itemSheet = new CSSStyleSheet();
    await itemSheet.replace(await (await fetch('/blocks/shared/da-file-item/da-file-item.css')).text());
    fileItems()[0].shadowRoot.adoptedStyleSheets = [
      ...fileItems()[0].shadowRoot.adoptedStyleSheets,
      itemSheet,
    ];
    for (const size of [14, 16]) {
      el.style.setProperty('--nx-ui-text-content', `${size}px`);
      for (const width of [1200, 900, 360]) {
        el.style.width = `${width}px`;
        const scroll = el.shadowRoot.querySelector('.file-list');
        if (width > 360) expect(scroll.scrollWidth).to.equal(scroll.clientWidth);
        else expect(scroll.scrollWidth).to.be.greaterThan(scroll.clientWidth);
        expect(scroll.tabIndex).to.equal(0);
        for (const column of ['name', 'folder', 'modified', 'actions']) {
          expect(fileList().shadowRoot.querySelector(`[data-column="${column}"]`)
            .getBoundingClientRect().left)
            .to.equal(fileItems()[0].shadowRoot.querySelector(`[data-column="${column}"]`)
              .getBoundingClientRect().left);
        }
      }
    }
  });

  it('stops at the available files when fewer than eighteen exist', async () => {
    el._files = ITEMS.slice(0, 9);
    await updateLanding();
    el.shadowRoot.querySelector('.show-more').click();
    await updateLanding();
    expect(fileItems()).to.have.length(9);
    expect(el.shadowRoot.querySelector('.show-more')).to.equal(null);
  });

  ['card', 'list'].forEach((initialView) => {
    it(`preserves six/eighteen files across shared toggle changes starting in ${initialView} view`, async () => {
      el.changeView({ detail: { value: initialView } });
      await updateLanding();
      expect(fileItems()).to.have.length(6);
      el.shadowRoot.querySelector('.show-more').click();
      await updateLanding();
      expect(fileItems()).to.have.length(18);
      const switcher = el.shadowRoot.querySelector('nx-segmented-btn');
      for (const view of [initialView === 'card' ? 'list' : 'card', initialView]) {
        switcher.dispatchEvent(new CustomEvent('change', { detail: { value: view } }));
        await updateLanding();
        expect(el._view).to.equal(view);
        expect([...fileItems()].map((item) => item.path))
          .to.deep.equal(ITEMS.slice(0, 18).map((item) => item.path));
        expect(el.shadowRoot.querySelector('.show-more')).to.equal(null);
        expect(JSON.parse(localStorage.getItem('da-browse-settings')).view).to.equal(view);
      }
      el.changeView({ detail: { value: 'list' } });
      await updateLanding();
      expect([...fileList().shadowRoot.querySelectorAll('[role="columnheader"]')].map((cell) => cell.textContent.trim()))
        .to.deep.equal(['Name', 'Folder', 'Modified']);
      expect(fileList().shadowRoot.querySelector('.da-browse-table-header button')).to.equal(null);
    });
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

  it('updates favorites through the shared card event and another tab', async () => {
    const item = fileItems()[0];
    item.dispatchEvent(new CustomEvent('favoritechange', { bubbles: true, composed: true }));
    await updateLanding();
    expect(item.isFavorited).to.equal(true);
    expect(getFavorites('/org/site')).to.deep.equal([ITEMS[0].path]);
    toggleFavorite('/org/site', ITEMS[1].path);
    window.dispatchEvent(new StorageEvent('storage', { key: 'da-favorites' }));
    el.changeTab('starred');
    await updateLanding();
    expect(fileItems()).to.have.length(2);
  });

  ['focus', 'pageshow'].forEach((type) => {
    it(`refreshes Browse favorites on ${type} without confusing same-named files or removing Recent entries`, async () => {
      const root = { name: 'coffee', path: '/org/site/coffee.html', ext: 'html' };
      const nested = { name: 'coffee', path: '/org/site/de/coffee.html', ext: 'html' };
      el._files = [root, nested];
      toggleFavorite('/org/site', root.path);
      toggleFavorite('/org/site/de', nested.path);
      el.refreshFavorites();
      el.changeView({ detail: { value: 'list' } });
      el.changeTab('starred');
      await updateLanding();
      expect(fileItems()).to.have.length(2);
      toggleFavorite('/org/site/de', nested.path);
      window.dispatchEvent(new Event(type));
      await updateLanding();
      expect([...fileItems()].map((item) => item.path)).to.deep.equal([root.path]);
      expect(el._tab).to.equal('starred');
      expect(el._view).to.equal('list');
      el.changeTab('recent');
      await updateLanding();
      expect([...fileItems()].map((item) => item.path)).to.deep.equal([root.path, nested.path]);
      expect(fileItems()[0].isFavorited).to.equal(true);
      expect(fileItems()[1].shadowRoot.querySelector('button[aria-label="Mark as Favorite"]')).not.to.equal(null);
    });
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
    sinon.stub(source, 'list').callsFake(async (path) => ({
      ok: true,
      items: path === '/org/site'
        ? [{ name: 'de', path: '/org/site/de' }, ITEMS[0]] : [coffee],
    }));
    toggleFavorite('/org/site/de', coffee.path);
    await el.loadSite();
    el.refreshFavorites();
    el.changeTab('starred');
    for (const view of ['card', 'list']) {
      localStorage.setItem('da-favorites', JSON.stringify({
        '/org/site': [coffee.path],
        '/org/site/de': [coffee.path],
      }));
      el.refreshFavorites();
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

  ['site-select', 'site-added'].forEach((type) => {
    it(`updates Content from the external nav ${type} event without changing the route`, async () => {
      const { href } = window.location;
      document.dispatchEvent(new CustomEvent(type, { detail: { value: 'another/site' } }));
      await updateLanding();
      expect(el.path).to.equal('/another/site');
      expect(window.location.href).to.equal(href);
      expect(loadSite.callCount).to.equal(2);
    });
  });

  it('resets filters, expansion and favorites on a site change', async () => {
    toggleFavorite('/org/site', ITEMS[0].path);
    el.refreshFavorites();
    el.changeTab('starred');
    el._limit = 18;
    const request = el._request;
    el.setScope({ org: 'other', site: 'site' });
    await updateLanding();
    expect(request.signal.aborted).to.equal(true);
    expect(el._tab).to.equal('recent');
    expect(el._limit).to.equal(6);
    expect(el._favorites.size).to.equal(0);
    expect(loadSite.callCount).to.equal(2);
  });

  it('offers a shared blue Add site button with a plus only when no sites are saved', async () => {
    el.setScope(undefined);
    await updateLanding();
    expect(el.shadowRoot.querySelector('.empty-state h3').textContent).to.equal('Add a site to get started');
    expect(el.shadowRoot.querySelector('.empty-state p')).to.equal(null);
    const button = el.shadowRoot.querySelector('.add-site');
    expect(button.classList.contains('nx-btn-accent')).to.equal(true);
    expect(button.querySelector('use').getAttribute('href')).to.include('s2-icon-add-20-n.svg');
    expect(el.shadowRoot.querySelector('.empty-state a, nx-siteselector')).to.equal(null);
    const sheet = new CSSStyleSheet();
    await sheet.replace(await (await fetch('/blocks/landing/landing-content.css')).text());
    el.shadowRoot.adoptedStyleSheets = [...el.shadowRoot.adoptedStyleSheets, sheet];
    el.style.setProperty('--s2-spacing-100', '8px');
    el.style.setProperty('--s2-spacing-200', '12px');
    expect(button.getBoundingClientRect().top
      - el.shadowRoot.querySelector('.empty-state h3').getBoundingClientRect().bottom).to.equal(20);
  });

  it('opens the shared Add dialog once and restores focus on cancel', async () => {
    el.setScope(undefined);
    await updateLanding();
    await Promise.all([el._onAddSite(), el._onAddSite()]);
    expect(document.querySelectorAll('nx-add-site')).to.have.length(1);
    document.querySelector('nx-add-site').dispatchEvent(new Event('close'));
    expect(document.querySelector('nx-add-site')).to.equal(null);
    expect(el.shadowRoot.activeElement).to.equal(el.shadowRoot.querySelector('.add-site'));
  });

  it('selects a successfully added site without navigating or retaining its dialog', async () => {
    const { href } = window.location;
    el.setScope(undefined);
    await updateLanding();
    await el._onAddSite();
    localStorage.setItem('da-sites', JSON.stringify(['org/site']));
    document.querySelector('nx-add-site').dispatchEvent(new CustomEvent('site-added', { bubbles: true, composed: true, detail: { value: 'org/site' } }));
    await updateLanding();
    expect(el.path).to.equal('/org/site');
    expect(window.location.href).to.equal(href);
    expect(document.querySelector('nx-add-site')).to.equal(null);
    expect(el.shadowRoot.activeElement).to.equal(el.shadowRoot.querySelector('.filter'));
  });

  it('does not open Add after removal and removes an open dialog on disconnect', async () => {
    el.setScope(undefined);
    await updateLanding();
    const pending = el._onAddSite();
    el.remove();
    await pending;
    expect(document.querySelector('nx-add-site')).to.equal(null);
    document.body.append(el);
    await updateLanding();
    await el._onAddSite();
    expect(document.querySelector('nx-add-site')).not.to.equal(null);
    el.remove();
    expect(document.querySelector('nx-add-site')).to.equal(null);
  });

  it('reports an Add dialog failure rather than navigating elsewhere', async () => {
    el.setScope(undefined);
    await updateLanding();
    sinon.stub(document.body, 'append').throws(new Error('Could not create dialog'));
    await el._onAddSite();
    await updateLanding();
    expect(el.shadowRoot.querySelector('[role="alert"]').textContent).to.include('Could not open Add site');
    expect(document.querySelector('nx-add-site')).to.equal(null);
    expect(el.shadowRoot.querySelector('.add-site').disabled).to.equal(false);
  });

  it('asks users with saved sites but no selection to Choose without a button', async () => {
    localStorage.setItem('da-sites', JSON.stringify(['org/site']));
    el.remove();
    el.setScope(undefined);
    document.body.append(el);
    await updateLanding();
    expect(el.path).to.equal('');
    expect(el.shadowRoot.querySelector('.empty-state h3').textContent).to.equal('Choose a site to get started');
    expect(el.shadowRoot.querySelector('.empty-state p').textContent).to.equal('Select a site from "Your recent sites" to see its content.');
    expect(el.shadowRoot.querySelector('.empty-state button, .empty-state a, nx-siteselector')).to.equal(null);
  });

  it('updates the unselected copy when saved sites change or are cleared in another tab', async () => {
    el.setScope(undefined);
    localStorage.setItem('da-sites', JSON.stringify(['org/site']));
    window.dispatchEvent(new StorageEvent('storage', { key: 'da-sites' }));
    await updateLanding();
    expect(el.shadowRoot.querySelector('.empty-state h3').textContent).to.equal('Choose a site to get started');
    localStorage.removeItem('da-sites');
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    await updateLanding();
    expect(el.shadowRoot.querySelector('.empty-state h3').textContent).to.equal('Add a site to get started');
  });

  it('handles malformed or unavailable site history without breaking the empty state', async () => {
    el.setScope(undefined);
    for (const value of ['invalid JSON', '{}', '[null, "", "org", "org/"]']) {
      localStorage.setItem('da-sites', value);
      el.refreshSites();
      await updateLanding();
      expect(el.shadowRoot.querySelector('.empty-state h3').textContent).to.equal('Add a site to get started');
    }
    sinon.stub(Storage.prototype, 'getItem').throws(new DOMException('SecurityError'));
    el.refreshSites();
    await updateLanding();
    expect(el.shadowRoot.querySelector('.empty-state h3').textContent).to.equal('Add a site to get started');
  });

  it('stops reacting to nav selection and site-history changes after removal', () => {
    el.remove();
    const refresh = sinon.spy(el, 'refreshSites');
    const favorites = sinon.spy(el, 'refreshFavorites');
    document.dispatchEvent(new CustomEvent('site-select', { detail: { value: 'other/site' } }));
    document.dispatchEvent(new CustomEvent('site-added', { detail: { value: 'other/site' } }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'da-sites' }));
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('pageshow'));
    expect(el.path).to.equal('/org/site');
    expect(refresh.called).to.equal(false);
    expect(favorites.called).to.equal(false);
  });

  it('shows loading, empty and retry states distinctly', async () => {
    el._files = undefined;
    await updateLanding();
    expect(el.shadowRoot.querySelector('[aria-busy="true"]')).not.to.equal(null);
    expect(el.shadowRoot.querySelector('[role="status"]').textContent).to.equal('Loading files...');
    const spinner = el.shadowRoot.querySelector('[role="status"] .nx-loading-spinner');
    expect(spinner.getAttribute('aria-hidden')).to.equal('true');
    const sheet = new CSSStyleSheet();
    await sheet.replace(await (await fetch('/blocks/landing/landing-content.css')).text());
    el.shadowRoot.adoptedStyleSheets = [...el.shadowRoot.adoptedStyleSheets, sheet];
    el.style.setProperty('--s2-blue-900', 'rgb(59 99 251)');
    expect(getComputedStyle(spinner).width).to.equal('14px');
    expect(getComputedStyle(spinner).animationName).to.equal('da-spin');
    expect(getComputedStyle(spinner).borderTopColor).to.equal('rgb(59, 99, 251)');
    el.setAttribute('data-ui-size', 'm');
    expect(getComputedStyle(spinner).width).to.equal('16px');
    el._files = [];
    await updateLanding();
    expect(el.shadowRoot.querySelector('.empty-state h3').textContent).to.equal('No files here yet');
    expect(el.shadowRoot.querySelector('.nx-loading-spinner')).to.equal(null);
    el._error = 'Permission denied';
    await updateLanding();
    expect(el.shadowRoot.querySelector('[role="alert"]').textContent).to.equal('Permission denied');
    el.shadowRoot.querySelector('.empty-state button').click();
    expect(loadSite.callCount).to.equal(2);
  });

  it('uses shared image icons without fetching list thumbnails and omits folder detail controls', async () => {
    const get = sinon.spy(source, 'get');
    el._files = [
      { name: 'Image', path: '/org/site/image.png', ext: 'png' },
      { name: 'Folder', path: '/org/site/folder' },
    ];
    el.changeView({ detail: { value: 'list' } });
    await updateLanding();
    expect(fileItems()[0].shadowRoot.querySelector('.da-item-list-item-type svg use').getAttribute('href'))
      .to.include('s2-icon-image-20-n.svg');
    expect(fileItems()[0].shadowRoot.querySelector('img')).to.equal(null);
    expect(get.called).to.equal(false);
    expect(fileItems()[0].shadowRoot.querySelector('[aria-label="More info"]')).not.to.equal(null);
    expect(fileItems()[1].shadowRoot.querySelector('[aria-label="More info"]')).to.equal(null);
    expect(fileItems()[1].folder.label).to.equal('/');
    expect(fileItems()[1].shadowRoot.querySelector('.file-folder').title).to.equal('/org/site');
  });

  it('uses the shared image icon in Content cards without fetching a white image preview', async () => {
    const get = sinon.spy(source, 'get');
    el._files = [{ name: 'bigger-text', path: '/org/site/bigger-text.png', ext: 'png' }];
    el.changeView({ detail: { value: 'card' } });
    await updateLanding();
    expect(fileItems()[0].shadowRoot.querySelector('.card-preview svg use').getAttribute('href'))
      .to.include('s2-icon-image-20-n.svg');
    expect(fileItems()[0].shadowRoot.querySelector('img')).to.equal(null);
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

  it('preserves Recent order and persists favorites once through the shared list in both views', async () => {
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
  });

  it('loads the selected site with main APIs and selects the classic editor when EW is off', async () => {
    loadSite.restore();
    const list = sinon.stub(source, 'list').resolves({ ok: true, items: ITEMS, permissions: ['read'] });
    await el.loadSite();
    await updateLanding();
    expect(list.firstCall.args[0]).to.equal('/org/site');
    expect(list.firstCall.args[1].opts.signal).to.equal(el._request.signal);
    expect(el._editor).to.equal('/edit#');
    expect(fileItems()[0].href).to.include('/edit');
  });

  it('ignores a stale site response and aborts the active request on disconnect', async () => {
    loadSite.restore();
    let finish;
    const list = sinon.stub(source, 'list');
    list.onFirstCall().returns(new Promise((resolve) => { finish = resolve; }));
    const currentItem = { ...ITEMS[1], path: '/other/site/page-1.html' };
    list.onSecondCall().resolves({ ok: true, items: [currentItem] });
    const pending = el.loadSite();
    await Promise.resolve();
    el._scope = 'other/site';
    await el.loadSite();
    finish({ ok: true, items: [ITEMS[0]] });
    await pending;
    expect(el._files).to.deep.equal([currentItem]);
    const request = el._request;
    el.remove();
    expect(request.signal.aborted).to.equal(true);
    window.dispatchEvent(new StorageEvent('storage', { key: 'da-favorites' }));
    expect(el._files).to.deep.equal([currentItem]);
  });

  it('selects Canvas when EW is enabled', async () => {
    loadSite.restore();
    sinon.stub(source, 'list').callsFake(async (path) => ({
      ok: true,
      items: ITEMS.map((item) => ({ ...item, path: item.path.replace('/org/site', path) })),
    }));
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
    sinon.stub(source, 'list').resolves({
      ok: true,
      items: [
        { name: 'Form', path: '/configured/site/forms/a.html', ext: 'html', lastModified: 3 },
        { name: 'Page', path: '/configured/site/b.html', ext: 'html', lastModified: 2 },
        { name: 'Sheet', path: '/configured/site/forms/data.json', ext: 'json', lastModified: 1 },
      ],
    });
    setEWEnabled(true);
    await el.loadSite();
    for (const view of ['card', 'list']) {
      el.changeView({ detail: { value: view } });
      await updateLanding();
      expect(new URL(fileItems()[0].href).pathname).to.equal('/form');
      expect(fileItems()[0].editor).to.equal('/form#');
      expect(fileItems()[1].href).to.equal('https://experience.adobe.com/editor/b');
      expect(new URL(fileItems()[2].href).pathname).to.equal('/sheet');
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
    sinon.stub(source, 'list').callsFake(async (path) => ({
      ok: true,
      items: ITEMS.map((item) => ({ ...item, path: item.path.replace('/org/site', path) })),
    }));
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
    sinon.stub(source, 'list').resolves({ ok: true, items: ITEMS });
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
    sinon.stub(source, 'list').resolves({ ok: true, items: ITEMS });
    setEWEnabled(Promise.reject(new Error('Flag unavailable')));
    await el.loadSite();
    expect(el._editor).to.equal('/edit#');
    expect(el._files).to.have.length(24);
  });
});
