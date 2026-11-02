import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-nx.js';
import { getFavorites, toggleFavorite } from '../../../../blocks/browse/shared/favorites.js';
import { DaLanding } from '../../../../blocks/landing/landing.js';
import { getNx, getNx2Api, getNxEWFlags } from '../../../../scripts/utils.js';

const { hashChange } = await import(`${getNx()}/utils/utils.js`);
const { source } = await getNx2Api();
const { setEWEnabled } = await getNxEWFlags();
const ITEMS = Array.from({ length: 24 }, (_, index) => ({ name: `Page ${index}`, path: `/org/site/page-${index}.html`, ext: 'html', lastModified: 24 - index }));

describe('landing Content section', () => {
  let el;
  let loadSite;

  beforeEach(async () => {
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

  it('stops at the available files when fewer than eighteen exist', async () => {
    el._files = ITEMS.slice(0, 9);
    await el.updateComplete;
    el.shadowRoot.querySelector('.show-more').click();
    await el.updateComplete;
    expect(el.shadowRoot.querySelectorAll('da-file-item')).to.have.length(9);
    expect(el.shadowRoot.querySelector('.show-more')).to.equal(null);
  });

  it('preserves independent ten-row list pagination and its existing columns', async () => {
    el.shadowRoot.querySelector('.show-more').click();
    el.changeView({ detail: { value: 'list' } });
    await el.updateComplete;
    expect([...el.shadowRoot.querySelectorAll('th')].map((cell) => cell.textContent))
      .to.deep.equal(['Name', 'Folder', 'Modified at', 'File information and Favorite']);
    expect(el.shadowRoot.querySelectorAll('.file-row')).to.have.length(10);
    el.shadowRoot.querySelector('.show-more').click();
    await el.updateComplete;
    expect(el.shadowRoot.querySelectorAll('.file-row')).to.have.length(20);
    el.changeView({ detail: { value: 'card' } });
    await el.updateComplete;
    expect(el.shadowRoot.querySelectorAll('da-file-item')).to.have.length(18);
    expect(JSON.parse(localStorage.getItem('da-browse-settings')).view).to.equal('card');
  });

  it('caps Favorite at six cards or ten rows without deleting saved entries', async () => {
    ITEMS.forEach((item) => toggleFavorite('/org/site', item.path));
    el.refreshFavorites();
    el.changeTab('starred');
    await el.updateComplete;
    expect(el.shadowRoot.querySelectorAll('da-file-item')).to.have.length(6);
    expect(el.shadowRoot.querySelector('.show-more')).to.equal(null);
    el.changeView({ detail: { value: 'list' } });
    await el.updateComplete;
    expect(el.shadowRoot.querySelectorAll('.file-row')).to.have.length(10);
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

  it('resets filters, expansion and favorites on a site change', async () => {
    el._cardLimit = 18;
    toggleFavorite('/org/site', ITEMS[0].path);
    el.refreshFavorites();
    el.changeTab('starred');
    const request = el._request;
    hashChange._set({ org: 'other', site: 'site', fullpath: '/other/site' });
    await el.updateComplete;
    expect(request.signal.aborted).to.equal(true);
    expect(el._tab).to.equal('recent');
    expect(el._cardLimit).to.equal(6);
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

  it('keeps lazy list image previews and omits unsupported folder detail controls', async () => {
    el._files = [
      { name: 'Image', path: '/org/site/image.png', ext: 'png' },
      { name: 'Folder', path: '/org/site/folder' },
    ];
    el.changeView({ detail: { value: 'list' } });
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('da-landing-preview').path).to.equal('/org/site/image.png');
    expect(el.shadowRoot.querySelectorAll('da-landing-file-actions')).to.have.length(1);
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
