import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-nx.js';
import { getFavorites, toggleFavorite } from '../../../../blocks/browse/shared/favorites.js';
import { DaLanding } from '../../../../blocks/landing/landing.js';
import { getNx, getNx2Api, getNxEWFlags } from '../../../../scripts/utils.js';
import { axAll, axTree } from '../../helpers/ax-tree.js';

const { hashChange } = await import(`${getNx()}/utils/utils.js`);
const { source } = await getNx2Api();
const { setEWEnabled } = await getNxEWFlags();
const ITEMS = Array.from({ length: 24 }, (_, index) => ({ name: `Page ${index}`, path: `/org/site/page-${index}.html`, ext: 'html', lastModified: 24 - index }));

describe('landing Content section', () => {
  let el;
  let loadSite;

  beforeEach(async () => {
    sinon.stub(window, 'IntersectionObserver').callsFake(() => ({ observe: sinon.spy(), disconnect: sinon.spy() }));
    ['da-favorites', 'da-browse-settings'].forEach((key) => localStorage.removeItem(key));
    hashChange._set({ org: 'org', site: 'site', fullpath: '/org/site' });
    loadSite = sinon.stub(DaLanding.prototype, 'loadSite').callsFake(async function loadSiteForTest() {
      this._request?.abort();
      this._request = new AbortController();
    });
    el = document.createElement('da-landing');
    document.body.append(el);
    el._files = ITEMS;
    el._editor = '/canvas#';
    await el.updateComplete;
  });

  afterEach(() => {
    el.remove();
    sinon.restore();
    setEWEnabled(false);
    ['da-favorites', 'da-browse-settings'].forEach((key) => localStorage.removeItem(key));
  });

  it('renders only Content and reuses shared file cards', () => {
    expect(el.shadowRoot.querySelector('#files-heading').textContent).to.equal('Content');
    expect(el.shadowRoot.querySelectorAll('da-file-item')).to.have.length(6);
    expect(el.shadowRoot.querySelector('h1, textarea, .composer, nx-nav, nx-siteselector')).to.equal(null);
    expect(el.shadowRoot.querySelector('da-file-item').href).to.include('/canvas');
    expect(el.shadowRoot.querySelector('da-landing-file-actions')).to.equal(null);
  });

  it('keeps fixed cards, whole columns and 16px panel insets at narrower widths', async () => {
    const sheet = new CSSStyleSheet();
    await sheet.replace(await (await fetch('/blocks/landing/landing.css')).text());
    el.shadowRoot.adoptedStyleSheets = [...el.shadowRoot.adoptedStyleSheets, sheet];
    el.style.setProperty('--s2-spacing-200', '12px');
    el.style.setProperty('--s2-spacing-300', '16px');
    el.style.setProperty('--s2-spacing-400', '24px');
    const grid = el.shadowRoot.querySelector('.files');
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
    await el.updateComplete;
    expect(el.shadowRoot.querySelectorAll('da-file-item')).to.have.length(18);
    expect(el.shadowRoot.querySelector('.show-more')).to.equal(null);
  });

  it('keeps each view panel width stable across loading, empty and error states', async () => {
    const sheet = new CSSStyleSheet();
    await sheet.replace(await (await fetch('/blocks/landing/landing.css')).text());
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
        await el.updateComplete;
        const panel = el.shadowRoot.querySelector('.files-panel');
        widths[view] = panel.getBoundingClientRect().width;
        for (const { files, error } of states) {
          el._files = files;
          el._error = error;
          await el.updateComplete;
          expect(panel.getBoundingClientRect().width).to.equal(widths[view]);
        }
      }
      expect(widths.list).to.equal(widths.card);
    }
  });

  it('stops at the available files when fewer than eighteen exist', async () => {
    el._files = ITEMS.slice(0, 9);
    await el.updateComplete;
    el.shadowRoot.querySelector('.show-more').click();
    await el.updateComplete;
    expect(el.shadowRoot.querySelectorAll('da-file-item')).to.have.length(9);
    expect(el.shadowRoot.querySelector('.show-more')).to.equal(null);
  });

  ['card', 'list'].forEach((initialView) => it(`preserves the visible files when switching from ${initialView} and back`, async () => {
    const switchView = async (value) => {
      const switcher = el.shadowRoot.querySelector('nx-segmented-btn');
      switcher.dispatchEvent(new CustomEvent('change', { detail: { value } }));
      await el.updateComplete;
      expect(switcher.value).to.equal(value);
    };
    const otherView = initialView === 'card' ? 'list' : 'card';
    await switchView(initialView);
    expect(el.shadowRoot.querySelectorAll('da-file-item')).to.have.length(6);
    await switchView(otherView);
    expect(el.shadowRoot.querySelectorAll('da-file-item')).to.have.length(6);
    await switchView(initialView);
    el.shadowRoot.querySelector('.show-more').click();
    await el.updateComplete;
    const paths = () => [...el.shadowRoot.querySelectorAll('da-file-item')].map((item) => item.path);
    const expandedPaths = ITEMS.slice(0, 18).map((item) => item.path);
    expect(paths()).to.deep.equal(expandedPaths);
    for (const view of [otherView, initialView]) {
      await switchView(view);
      expect(paths()).to.deep.equal(expandedPaths);
      expect(el.shadowRoot.querySelector('.show-more')).to.equal(null);
    }
    expect(JSON.parse(localStorage.getItem('da-browse-settings')).view).to.equal(initialView);
  }));

  it('resets expansion when changing filters or sites, not when switching views', async () => {
    el.shadowRoot.querySelector('.show-more').click();
    await el.updateComplete;
    el.changeTab('starred');
    el.changeTab('recent');
    await el.updateComplete;
    expect(el.shadowRoot.querySelectorAll('da-file-item')).to.have.length(6);
    el.shadowRoot.querySelector('.show-more').click();
    await el.updateComplete;
    expect(el.shadowRoot.querySelectorAll('da-file-item')).to.have.length(18);
    hashChange._set({ org: 'other', site: 'site', fullpath: '/other/site' });
    await el.updateComplete;
    expect(el.shadowRoot.querySelectorAll('da-file-item')).to.have.length(6);
  });

  it('caps Favorite at six cards or rows without deleting saved entries', async () => {
    ITEMS.forEach((item) => toggleFavorite('/org/site', item.path));
    el.refreshFavorites();
    el.changeTab('starred');
    await el.updateComplete;
    expect(el.shadowRoot.querySelectorAll('da-file-item')).to.have.length(6);
    expect(el.shadowRoot.querySelector('.show-more')).to.equal(null);
    el.changeView({ detail: { value: 'list' } });
    await el.updateComplete;
    expect(el.shadowRoot.querySelectorAll('.file-row')).to.have.length(6);
    expect(el.shadowRoot.querySelector('.show-more')).to.equal(null);
    expect(getFavorites('/org/site')).to.have.length(24);
  });

  it('updates favorites through the shared card event and another tab', async () => {
    const item = el.shadowRoot.querySelector('da-file-item');
    item.dispatchEvent(new CustomEvent('favoritechange', { bubbles: true, composed: true }));
    await el.updateComplete;
    expect(item.isFavorited).to.equal(true);
    expect(getFavorites('/org/site')).to.deep.equal([ITEMS[0].path]);
    toggleFavorite('/org/site', ITEMS[1].path);
    window.dispatchEvent(new StorageEvent('storage', { key: 'da-favorites' }));
    el.changeTab('starred');
    await el.updateComplete;
    expect(el.shadowRoot.querySelectorAll('da-file-item')).to.have.length(2);
  });

  it('reports failed favorite storage without pretending the item was saved', async () => {
    sinon.stub(Storage.prototype, 'setItem').throws(new DOMException('QuotaExceededError'));
    el.starFile(ITEMS[0]);
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('[role="alert"]').textContent).to.include('Could not save your favorites');
    expect(el.shadowRoot.querySelector('da-file-item').isFavorited).to.equal(false);
  });

  it('resets filters and favorites on a site change', async () => {
    toggleFavorite('/org/site', ITEMS[0].path);
    el.refreshFavorites();
    el.changeTab('starred');
    const request = el._request;
    hashChange._set({ org: 'other', site: 'site', fullpath: '/other/site' });
    await el.updateComplete;
    expect(request.signal.aborted).to.equal(true);
    expect(el._tab).to.equal('recent');
    expect(el._favorites.size).to.equal(0);
    expect(loadSite.callCount).to.equal(2);
  });

  it('offers existing Browse site selection rather than depending on the LP site-picker dialog', async () => {
    hashChange._set(undefined);
    await el.updateComplete;
    const link = el.shadowRoot.querySelector('.empty-state a');
    expect(link.textContent).to.equal('Browse sites');
    expect(new URL(link.href).hash).to.equal('');
    expect(new URL(link.href).searchParams.get('landing')).to.equal('home');
  });

  it('shows loading, empty and retry states distinctly', async () => {
    el._files = undefined;
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('[aria-busy="true"]')).not.to.equal(null);
    expect(el.shadowRoot.querySelector('[role="status"]').textContent).to.equal('Loading files...');
    el._files = [];
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.empty-state h3').textContent).to.equal('No files here yet');
    el._error = 'Permission denied';
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('[role="alert"]').textContent).to.equal('Permission denied');
    el.shadowRoot.querySelector('.empty-state button').click();
    expect(loadSite.callCount).to.equal(2);
  });

  it('uses shared rows and standard image icons without a second landing renderer', async () => {
    el._files = [
      { name: 'Image', path: '/org/site/image.png', ext: 'png' },
      { name: 'Folder', path: '/org/site/folder' },
    ];
    el.changeView({ detail: { value: 'list' } });
    await el.updateComplete;
    const rows = [...el.shadowRoot.querySelectorAll('da-file-item')];
    await Promise.all(rows.map((row) => row.updateComplete));
    expect(rows).to.have.length(2);
    expect(rows[0].shadowRoot.querySelector('.da-item-list-item-type svg use').getAttribute('href')).to.include('s2-icon-image');
    expect(rows[1].shadowRoot.querySelector('button[aria-label="More info"]')).to.equal(null);
    expect(el.shadowRoot.querySelector('da-landing-preview, da-landing-file-actions')).to.equal(null);
  });

  it('retains the Favorite filter and shared row favorites when switching views', async () => {
    toggleFavorite('/org/site', ITEMS[0].path);
    toggleFavorite('/org/site', ITEMS[1].path);
    el.refreshFavorites();
    el.changeTab('starred');
    el.changeView({ detail: { value: 'list' } });
    await el.updateComplete;
    const rows = [...el.shadowRoot.querySelectorAll('da-file-item')];
    await Promise.all(rows.map((row) => row.updateComplete));
    expect(rows).to.have.length(2);
    rows[0].shadowRoot.querySelector('button[aria-label="Remove as Favorite"]').click();
    await el.updateComplete;
    expect(el.shadowRoot.querySelectorAll('da-file-item')).to.have.length(1);
    el.changeView({ detail: { value: 'card' } });
    await el.updateComplete;
    expect(el._tab).to.equal('starred');
    expect(el.shadowRoot.querySelectorAll('da-file-item')).to.have.length(1);
    expect(el.shadowRoot.querySelector('da-file-item').path).to.equal(ITEMS[1].path);
  });

  it('keeps shared row destinations and folder context independent of information and star controls', async () => {
    el._files = [{ ...ITEMS[0], path: '/org/site/articles/page.html' }];
    el.changeView({ detail: { value: 'list' } });
    await el.updateComplete;
    const row = el.shadowRoot.querySelector('da-file-item');
    await row.updateComplete;
    expect(new URL(row.href).pathname).to.equal('/canvas');
    expect(new URL(row.href).hash).to.equal('#/org/site/articles/page');
    const folder = row.shadowRoot.querySelector('[data-column="folder"] a');
    expect(folder.textContent).to.equal('/articles');
    expect(new URL(folder.href).hash).to.equal('#/org/site/articles');
    expect(new URL(folder.href).searchParams.get('landing')).to.equal('home');
    sinon.stub(row, 'updateAEMStatus');
    sinon.stub(row, 'updateDAStatus');
    const { href } = window.location;
    const info = row.shadowRoot.querySelector('button[aria-label="More info"]');
    info.focus();
    info.click();
    await row.updateComplete;
    expect(info.getAttribute('aria-expanded')).to.equal('true');
    expect(row.shadowRoot.querySelector('[role="dialog"]')).to.exist;
    expect(window.location.href).to.equal(href);
    row.shadowRoot.querySelector('button[aria-label="Mark as Favorite"]').click();
    await el.updateComplete;
    expect(row.isFavorited).to.equal(true);
    expect(window.location.href).to.equal(href);
    expect(row.shadowRoot.activeElement).to.equal(info);
  });

  it('exposes matching accessible headers and cells across the shared shadow boundary', async () => {
    el._files = [ITEMS[0]];
    el.changeView({ detail: { value: 'list' } });
    await el.updateComplete;
    const row = el.shadowRoot.querySelector('da-file-item');
    row.modifiedBy = 'Alex';
    await row.updateComplete;
    const tree = await axTree('da-landing >>> [role="table"]');
    const table = axAll(tree, 'table')[0];
    expect(table.name).to.equal('Recently modified files');
    expect(axAll(table, 'columnheader').map((header) => header.name)).to.deep.equal([
      'Name', 'Folder', 'Modified at', 'Modified by', 'File information and Favorite',
    ]);
    expect(axAll(table, 'row')).to.have.length(2);
    expect(axAll(table, 'cell')).to.have.length(5);
    expect(axAll(table, 'cell')[3].name).to.equal('Alex');
    expect(axAll(table, 'link').map((link) => link.name)).to.include.members(['Page 0', '/']);
  });

  it('keeps all columns aligned and horizontally scrollable at narrow widths in both text sizes', async () => {
    const sheet = new CSSStyleSheet();
    await sheet.replace(await (await fetch('/blocks/landing/landing.css')).text());
    el.shadowRoot.adoptedStyleSheets = [...el.shadowRoot.adoptedStyleSheets, sheet];
    el.style.setProperty('--s2-spacing-100', '8px');
    el.style.setProperty('--s2-spacing-200', '12px');
    el.style.setProperty('--s2-spacing-300', '16px');
    el.style.setProperty('--s2-spacing-400', '24px');
    el._files = [ITEMS[0]];
    el.changeView({ detail: { value: 'list' } });
    await el.updateComplete;
    const row = el.shadowRoot.querySelector('da-file-item');
    const rowSheet = new CSSStyleSheet();
    await rowSheet.replace(await (await fetch('/blocks/shared/da-file-item/da-file-item.css')).text());
    row.shadowRoot.adoptedStyleSheets = [...row.shadowRoot.adoptedStyleSheets, rowSheet];
    for (const width of [1200, 900, 360]) {
      el.style.width = `${width}px`;
      for (const size of ['s', 'm']) {
        el.setAttribute('data-ui-size', size);
        el.style.setProperty('--nx-ui-text-content', size === 'm' ? '16px' : '14px');
        el.requestUpdate();
        await el.updateComplete;
        await row.updateComplete;
        const header = el.shadowRoot.querySelector('.file-table-header');
        const cells = [...row.shadowRoot.querySelector('.da-item-list-item-inner').children];
        expect(cells).to.have.length(5);
        cells.forEach((cell, index) => {
          const offset = cell.getBoundingClientRect().left
            - header.children[index].getBoundingClientRect().left;
          expect(Math.abs(offset)).to.be.lessThan(1);
        });
        expect(row.size).to.equal(size);
        expect(getComputedStyle(row.shadowRoot.querySelector('[data-column="modified"]')).fontSize)
          .to.equal(size === 'm' ? '16px' : '14px');
        expect(cells[2].scrollWidth).to.be.at.most(cells[2].clientWidth + 1);
        expect(row.shadowRoot.querySelector('button[aria-label="More info"]').classList.contains('nx-btn-lg')).to.equal(size === 'm');
        if (width === 360) {
          const scroll = el.shadowRoot.querySelector('.file-table-scroll');
          expect(scroll.scrollWidth).to.be.greaterThan(scroll.clientWidth);
          expect(getComputedStyle(scroll).overflowX).to.equal('auto');
        } else {
          const scroll = el.shadowRoot.querySelector('.file-table-scroll');
          expect(scroll.scrollWidth).to.equal(scroll.clientWidth);
        }
      }
    }
  });

  it('removes old shared rows and their active details when changing sites', async () => {
    el.changeView({ detail: { value: 'list' } });
    await el.updateComplete;
    const row = el.shadowRoot.querySelector('da-file-item');
    await row.updateComplete;
    sinon.stub(row, 'updateAEMStatus');
    sinon.stub(row, 'updateDAStatus');
    row.shadowRoot.querySelector('button[aria-label="More info"]').click();
    await row.updateComplete;
    loadSite.callsFake(async function resetSiteForTest() {
      this._request?.abort();
      this._request = new AbortController();
      this._files = undefined;
    });
    el.setScope({ org: 'other', site: 'site' });
    await el.updateComplete;
    expect(row.isConnected).to.equal(false);
    expect(el.shadowRoot.querySelector('da-file-item')).to.equal(null);
    expect(el._view).to.equal('list');
  });

  it('loads the root listing with main APIs and selects the classic editor when EW is off', async () => {
    loadSite.restore();
    const list = sinon.stub(source, 'list').resolves({ ok: true, items: ITEMS, permissions: ['read'] });
    await el.loadSite();
    await el.updateComplete;
    expect(list.firstCall.args[0]).to.equal('/org/site');
    expect(list.firstCall.args[1].opts.signal).to.equal(el._request.signal);
    expect(el._editor).to.equal('/edit#');
    expect(el.shadowRoot.querySelector('da-file-item').href).to.include('/edit');
  });

  it('ignores a stale site response and aborts the active request on disconnect', async () => {
    loadSite.restore();
    let finish;
    const list = sinon.stub(source, 'list');
    list.onFirstCall().returns(new Promise((resolve) => { finish = resolve; }));
    list.onSecondCall().resolves({ ok: true, items: [ITEMS[1]] });
    const pending = el.loadSite();
    await Promise.resolve();
    el._scope = 'other/site';
    await el.loadSite();
    finish({ ok: true, items: [ITEMS[0]] });
    await pending;
    expect(el._files).to.deep.equal([ITEMS[1]]);
    const request = el._request;
    el.remove();
    expect(request.signal.aborted).to.equal(true);
    window.dispatchEvent(new StorageEvent('storage', { key: 'da-favorites' }));
    expect(el._files).to.deep.equal([ITEMS[1]]);
  });

  it('selects Canvas when EW is enabled', async () => {
    loadSite.restore();
    sinon.stub(source, 'list').resolves({ ok: true, items: ITEMS });
    setEWEnabled(true);
    await el.loadSite();
    await el.updateComplete;
    expect(el._editor).to.equal('/canvas#');
    expect(el.shadowRoot.querySelector('da-file-item').href).to.include('/canvas');
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
