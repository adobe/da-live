/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { html } from 'da-lit';
import { stub, spy } from 'sinon';

const { setNx } = await import('../../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });
const { default: DaBrowse } = await import('../../../../../blocks/browse/da-browse/da-browse.js');
const { default: DaSearch } = await import('../../../../../blocks/browse/da-search/da-search.js');

describe('browse-owned nav search', () => {
  let nav;
  let browse;
  let getMatches;

  beforeEach(async () => {
    nav = document.createElement('nx-nav');
    nav.attachShadow({ mode: 'open' }).innerHTML = '<slot name="search"></slot>';
    document.body.append(nav);
    browse = new DaBrowse();
    browse.details = { fullpath: '/org/site/products' };
    browse.getEditor = async () => '/edit#';
    browse.renderList = () => html`
      <div class="da-list-type-browse"
        @sortchange=${browse.handleSortChange}
        @typesfilterchange=${browse.handleTypesFilterChange}></div>`;
    document.body.append(browse);
    await browse.updateComplete;
    await browse._navSearchReady;
    getMatches = stub(DaSearch.prototype, 'getMatches').callsFake(async function getMatchesForTest(path) {
      this._total = 1;
      this._matches = 1;
      this._items = [{ path: `${path}/match.html`, name: '/match', ext: 'html' }];
      this.updateList();
    });
  });

  afterEach(() => {
    browse.remove();
    nav.remove();
    getMatches.restore();
  });

  async function submit(value) {
    const submitted = spy(browse, 'submitSearch');
    const event = new CustomEvent('search-submit', { detail: { value }, cancelable: true });
    browse._navSearch.dispatchEvent(event);
    await submitted.returnValues[0];
    submitted.restore();
    return event;
  }

  it('injects a scoped field into nav without nav owning search logic', () => {
    const field = browse._navSearch;
    expect(nav.shadowRoot.querySelector('slot').assignedElements()).to.deep.equal([field]);
    expect(field.label).to.equal('Search products');
    expect(field.placeholder).to.equal('Search products');
    expect(field.getAttribute('aria-label')).to.equal('Search products');
    expect(field.variant).to.equal('field');
    expect(field.size).to.equal('m');
  });

  it('runs existing content search with a trimmed term and streams results to the list', async () => {
    const item = { path: '/org/site/products/original.html', name: 'original', ext: 'html' };
    browse.browseCmp.items = [item];
    const event = await submit('  project plan  ');
    expect(event.defaultPrevented).to.be.true;
    expect(getMatches.calledOnceWithExactly('/org/site/products', 'project plan')).to.be.true;
    expect(browse._search.externalInput).to.be.true;
    expect(browse._search.browseItems).to.deep.equal([item]);
    expect(browse._search.browseItems[0]).to.not.equal(item);
    await browse.updateComplete;
    const list = browse.shadowRoot.querySelector('.da-list-type-search');
    expect(list.listItems).to.have.length(1);
    expect(list.listItems[0].path).to.equal('/org/site/products/match.html');
    expect(list.listItems[0].name).to.equal('/match');
    expect(list.listItems[0].ext).to.equal('html');
    expect(browse.shadowRoot.querySelector('[aria-label="Browse files"]').hidden).to.be.true;
    expect(browse._search.shadowRoot.querySelector('form[role="search"]')).to.be.null;
    expect(browse._search.shadowRoot.querySelector('.replace-pane')).to.exist;
  });

  it('ignores blank submissions', async () => {
    await submit('   ');
    expect(getMatches.called).to.be.false;
    expect(browse._search).to.equal(undefined);
  });

  it('matches filenames and document content through the existing crawler and source API', async () => {
    getMatches.restore();
    getMatches = spy(DaSearch.prototype, 'getMatches');
    const originalCrawl = globalThis.__crawlMock;
    const files = [
      { path: '/org/site/products/content.html', name: 'content', ext: 'html' },
      { path: '/org/site/products/needle.html', name: 'needle', ext: 'html' },
      { path: '/org/site/products/other.html', name: 'other', ext: 'html' },
      { path: '/org/site/products/ignored.md', name: 'ignored', ext: 'md' },
    ];
    const crawl = spy(({ callback }) => {
      const results = Promise.all(files.map((file) => callback({ ...file })));
      return { results };
    });
    globalThis.__crawlMock = crawl;
    const fetch = stub(window, 'fetch').callsFake(async (resource) => {
      const path = new URL(String(resource)).pathname;
      const content = path.endsWith('/content.html') ? '<p>needle</p>' : 'unrelated';
      return new Response(content, { status: 200 });
    });
    try {
      await submit('needle');
      expect(crawl.calledOnce).to.be.true;
      expect(crawl.firstCall.args[0].path).to.deep.equal(['/org/site/products']);
      expect(browse._searchItems.map((item) => item.path)).to.have.members([
        '/org/site/products/content.html',
        '/org/site/products/needle.html',
      ]);
      expect(browse._search._matches).to.equal(2);
      expect(browse._search._total).to.equal(3);
    } finally {
      fetch.restore();
      globalThis.__crawlMock = originalCrawl;
    }
  });

  it('preserves the case-sensitivity choice on subsequent submissions', async () => {
    await submit('one');
    browse._search.toggleCaseSensitive();
    await submit('two');
    expect(browse._search._caseSensitive).to.be.false;
    expect(getMatches.secondCall.args).to.deep.equal(['/org/site/products', 'two']);
  });

  it('routes toolbar sort and filter requests to the visible results list', async () => {
    await submit('one');
    await browse.updateComplete;
    const list = browse.activeListCmp;
    const sort = stub(list, 'setSort');
    const filter = stub(list, 'toggleTypesPopover');
    const header = browse.shadowRoot.querySelector('da-browse-header');
    const anchor = document.createElement('button');
    header.dispatchEvent(new CustomEvent('sortrequest', { detail: { property: 'name', direction: 'ascending' } }));
    header.dispatchEvent(new CustomEvent('typesfilterrequest', { detail: { anchor } }));
    expect(sort.calledOnceWithExactly('name', 'ascending')).to.be.true;
    expect(filter.calledOnceWithExactly(anchor)).to.be.true;
    sort.restore();
    filter.restore();
  });

  it('ignores toolbar state from a hidden list and restores browse state when cleared', async () => {
    const normal = browse.browseCmp;
    const normalState = { property: 'name', direction: 'ascending', loading: false };
    normal.notifySortState = () => {
      normal.dispatchEvent(new CustomEvent('sortchange', { detail: normalState }));
    };
    await submit('one');
    browse._sortState = { property: 'lastModified', direction: 'descending', loading: false };
    normal.notifySortState();
    expect(browse._sortState.property).to.equal('lastModified');
    browse.clearSearch();
    expect(browse._sortState).to.deep.equal(normalState);
  });

  it('restores browse when the field is cleared', async () => {
    await submit('one');
    browse._navSearch.value = '';
    browse._navSearch.dispatchEvent(new Event('input'));
    await browse.updateComplete;
    expect(browse._search).to.equal(undefined);
    expect(browse.shadowRoot.querySelector('.da-list-type-search')).to.be.null;
    expect(browse.shadowRoot.querySelector('[aria-label="Browse files"]').hidden).to.be.false;
  });

  it('returns to the directory listing from the results controls', async () => {
    await submit('one');
    browse._navSearch.value = 'one';
    browse.shadowRoot.querySelector('.da-search-controls > button').click();
    await browse.updateComplete;
    expect(browse._search).to.equal(undefined);
    expect(browse._navSearch.value).to.equal('');
    expect(browse.shadowRoot.querySelector('[aria-label="Browse files"]').hidden).to.be.false;
  });

  it('ignores late results after a search has been cleared', async () => {
    let finish;
    let start;
    const started = new Promise((resolve) => { start = resolve; });
    getMatches.callsFake(function deferredMatches() {
      return new Promise((resolve) => {
        finish = () => {
          this._items = [{ path: '/old.html', name: 'old', ext: 'html' }];
          this.updateList();
          resolve();
        };
        start();
      });
    });
    const submitted = spy(browse, 'submitSearch');
    browse._navSearch.dispatchEvent(new CustomEvent('search-submit', { detail: { value: 'one' } }));
    await started;
    const pending = submitted.returnValues[0];
    browse.clearSearch();
    finish();
    await pending;
    submitted.restore();
    expect(browse._searchItems).to.equal(undefined);
    expect(browse._search).to.equal(undefined);
  });

  it('clears results and updates the scope when navigating to a new directory', async () => {
    await submit('one');
    const search = browse._search;
    browse.details = { fullpath: '/org/site/images' };
    await browse.updateComplete;
    expect(browse._search).to.equal(undefined);
    expect(search._searchRun).to.equal(undefined);
    expect(browse._navSearch.label).to.equal('Search images');
    expect(browse._navSearch.placeholder).to.equal('Search images');
    expect(browse._navSearch.value).to.equal('');
  });

  it('removes the injected control and cancels the search when browse disconnects', async () => {
    await submit('one');
    const search = browse._search;
    browse.remove();
    expect(nav.querySelector('[slot="search"]')).to.be.null;
    expect(search._searchRun).to.equal(undefined);
  });

  it('shows search failures rather than reporting empty results', async () => {
    getMatches.rejects(new Error('Network unavailable'));
    await submit('one');
    await browse.updateComplete;
    expect(browse.shadowRoot.querySelector('[role="alert"]').textContent)
      .to.equal('Search failed: Network unavailable');
  });
});
