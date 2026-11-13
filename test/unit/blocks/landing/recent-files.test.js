import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-nx.js';
import { DaRecentFiles } from '../../../../blocks/landing/recent-files/recent-files.js';
import '../../../../blocks/browse/da-sites/da-sites.js';
import { getNx2Api, getNxEWFlags } from '../../../../scripts/utils.js';
import { getSiteFavorites, toggleFavorite } from '../../../../blocks/browse/shared/favorites.js';

const { source, config } = await getNx2Api();
const { setEWEnabled } = await getNxEWFlags();
const paths = (scope, count) => Array.from({ length: count }, (_, i) => `/${scope}/page-${i}.html`);
const response = () => new Response(null, { headers: { 'last-modified': 'Mon, 09 Nov 2026 12:00:00 GMT' } });

describe('Landing file preview', () => {
  let el;
  let loadSite;
  let metadata;

  const list = () => el.shadowRoot.querySelector('da-list');
  const setRecent = (value) => localStorage.setItem('da-recent-files', JSON.stringify(value));

  async function update(target = el) {
    await target.updateComplete;
    await target.shadowRoot.querySelector('da-list')?.updateComplete;
  }

  beforeEach(async () => {
    ['da-sites', 'da-recent-files', 'da-favorites', 'da-browse-settings']
      .forEach((key) => localStorage.removeItem(key));
    setRecent({
      '/org/site': paths('org/site', 12),
      '/org/other': paths('org/other', 12),
      '/org/last': paths('org/last', 1),
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
    el.scopes = ['org/site', 'org/other', 'org/last'];
    document.body.append(el);
    await update();
    await loadSite.lastCall.returnValue;
    await update();
  });

  afterEach(() => {
    el.remove();
    sinon.restore();
    setEWEnabled(false);
    ['da-sites', 'da-recent-files', 'da-favorites', 'da-browse-settings']
      .forEach((key) => localStorage.removeItem(key));
  });

  it('starts in small-row list view and stops loading once the primary site fills the cap', () => {
    expect(list().view).to.equal('list');
    expect(list().getAttribute('size')).to.equal('s');
    expect(list().showFolder).to.equal(true);
    expect(list().sort).to.equal(false);
    expect(list().listItems.map(({ path }) => path)).to.deep.equal(paths('org/site', 4));
    expect(metadata.getCalls().map(({ args }) => args[0])).to.deep.equal(paths('org/site', 10));
    expect(el.shadowRoot.querySelector('.file-count').textContent).to.equal('4 of 10 files');
  });

  it('fills only unused slots from other sites and preserves their editor and folder links', async () => {
    setRecent({ '/org/site': paths('org/site', 2), '/org/other': paths('org/other', 12) });
    metadata.resetHistory();
    await el.loadSite();
    await update();
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
    for (const view of ['card', 'list']) {
      el.changeView({ detail: { value: view } });
      await update();
      expect(list().getAttribute('size')).to.equal('s');
      expect(list().listItems).to.have.length(10);
    }
    el.shadowRoot.querySelector('.show-more').click();
    await update();
    expect(list().listItems).to.have.length(4);
    expect(el.shadowRoot.querySelector('.show-more').getAttribute('aria-expanded')).to.equal('false');
  });

  it('fills Favorite independently and replaces an unfavorited item from the remaining sites', async () => {
    paths('org/site', 2).forEach((path) => toggleFavorite('/org/site', path));
    paths('org/other', 12).forEach((path) => toggleFavorite('/org/other', path));
    await el.changeTab('starred');
    await update();
    expect(list().listItems.map(({ path }) => path))
      .to.deep.equal([...paths('org/site', 2), ...paths('org/other', 2)]);
    expect(el.shadowRoot.querySelector('.file-count').textContent).to.equal('4 of 10 files');
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

  it('skips missing files before spilling over to a different site', async () => {
    metadata.withArgs('/org/site/page-0.html').resolves(new Response(null, { status: 404 }));
    metadata.resetHistory();
    await el.loadSite();
    await update();
    el.shadowRoot.querySelector('.show-more').click();
    await update();
    expect(list().listItems.map(({ path }) => path)).to.deep.equal(paths('org/site', 11).slice(1));
    expect(metadata.getCalls().some(({ args }) => args[0].startsWith('/org/other/'))).to.equal(false);
  });

  it('ignores a stale response when the ordered sites change', async () => {
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
    el.scopes = ['org/other'];
    await requested;
    const stale = loadSite.lastCall.returnValue;
    try {
      el.scopes = ['org/site'];
      await update();
      await loadSite.lastCall.returnValue;
      await update();
    } finally {
      release(response());
      await stale;
    }
    expect(el.scope).to.equal('org/site');
    expect(list().listItems.every(({ path }) => path.startsWith('/org/site/'))).to.equal(true);
  });

  it('sits below recent-site cards and updates only when their order changes', async () => {
    localStorage.setItem('da-sites', JSON.stringify(['org/site', 'org/other']));
    const sites = document.createElement('da-sites');
    document.body.append(sites);
    try {
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
    } finally {
      sites.remove();
    }
  });
});
