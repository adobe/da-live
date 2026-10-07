/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { html } from 'da-lit';
import { stub, spy } from 'sinon';

const { setNx } = await import('../../../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });
const { default: DaBrowse } = await import('../../../../../../blocks/browse/v2/da-browse/da-browse.js');
const { default: SearchEngine } = await import('../../../../../../blocks/browse/v2/search/search.js');
const { PANEL_EVENT } = await import('../../../../../fixtures/nx/utils/panel.js');

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
    getMatches = stub(SearchEngine.prototype, 'getMatches').callsFake(async function getMatchesForTest(path) {
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

  async function searchSummary() {
    await browse.updateComplete;
    const header = browse.shadowRoot.querySelector('da-browse-header');
    await header.updateComplete;
    return header.shadowRoot.querySelector('[role="status"]');
  }

  it('injects a scoped field into nav without nav owning search logic', () => {
    const field = browse._navSearch;
    expect(nav.shadowRoot.querySelector('slot').assignedElements()).to.deep.equal([field]);
    expect(field.getAttribute('role')).to.equal('search');
    expect(field.children).to.have.length(1);
    expect(field.firstElementChild).to.equal(browse._searchAction);
    expect(field.slot).to.equal('search');
    expect(browse._searchAction.slot).to.equal('actions');
    expect(field.label).to.equal('Search products');
    expect(field.placeholder).to.equal('Search products');
    expect(field.getAttribute('aria-label')).to.equal('Search products');
    expect(field.variant).to.equal('field');
    expect(field.size).to.equal('m');
  });

  it('starts a search from the panel without requiring a prior nav search', async () => {
    const panel = await browse.getSearchPanel();
    document.body.append(panel);
    await panel.updateComplete;
    panel.focus();
    const input = panel.shadowRoot.querySelector('#find');
    expect(panel.shadowRoot.activeElement).to.equal(input);
    expect(input.value).to.equal('');
    input.value = '  panel query  ';
    input.dispatchEvent(new Event('input'));
    expect(browse._navSearch.value).to.equal('  panel query  ');
    expect(getMatches.called).to.be.false;
    await panel.updateComplete;
    const submitted = spy(browse, 'submitSearch');
    panel.shadowRoot.querySelector('.browse-find-form')
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await submitted.returnValues[0];
    submitted.restore();
    await browse.updateComplete;
    await panel.updateComplete;
    expect(getMatches.calledOnceWithExactly('/org/site/products', 'panel query')).to.be.true;
    expect(browse._searchState.term).to.equal('panel query');
    expect(browse._searchState.draft).to.equal('  panel query  ');
    expect(browse._navSearch.value).to.equal(input.value);
    expect(panel.searchState.items).to.equal(browse._searchState.items);
  });

  it('synchronizes drafts in both directions without searching on input', async () => {
    const panel = await browse.getSearchPanel();
    document.body.append(panel);
    await panel.updateComplete;
    browse._navSearch.value = 'nav draft';
    browse._navSearch.dispatchEvent(new Event('input'));
    await panel.updateComplete;
    const input = panel.shadowRoot.querySelector('#find');
    expect(input.value).to.equal('nav draft');
    input.value = 'panel draft';
    input.dispatchEvent(new Event('input'));
    expect(browse._navSearch.value).to.equal('panel draft');
    expect(browse._searchState.draft).to.equal('panel draft');
    expect(getMatches.called).to.be.false;
    input.value = '';
    input.dispatchEvent(new Event('input'));
    await panel.updateComplete;
    expect(browse._navSearch.value).to.equal('');
    expect(panel.searchState.term).to.be.undefined;
    expect(panel.shadowRoot.querySelector('.browse-match-context')).to.be.null;
  });

  it('invalidates replacement on nav edits and rejects writes against a different draft', async () => {
    await submit('one');
    browse.handlePermissions({ detail: ['write'] });
    const panel = await browse.getSearchPanel();
    document.body.append(panel);
    await panel.updateComplete;
    const replace = stub(browse._searchEngine, 'replaceMatches')
      .resolves({ replaced: 1, skipped: 0, errors: [] });
    const requested = spy();
    panel.addEventListener('replacerequest', requested);
    panel.shadowRoot.querySelector('.browse-replace-form')
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await panel.updateComplete;
    expect(panel.shadowRoot.querySelector('.browse-replace-confirmation')).to.exist;
    browse._navSearch.value = 'two';
    browse._navSearch.dispatchEvent(new Event('input'));
    panel.confirmReplacement();
    await browse.replaceSearchMatches({ detail: { replacement: 'unsafe' } });
    await panel.updateComplete;
    expect(requested.called).to.be.false;
    expect(replace.called).to.be.false;
    expect(panel.shadowRoot.querySelector('.browse-replace-confirmation')).to.be.null;
    expect(panel.shadowRoot.querySelector('#find').value).to.equal('two');
    expect(browse._searchState.term).to.equal('one');
    expect(browse._searchState.draft).to.equal('two');
    expect(panel.canReplace).to.be.false;
    browse._navSearch.value = 'one';
    browse._navSearch.dispatchEvent(new Event('input'));
    await panel.updateComplete;
    panel.shadowRoot.querySelector('.browse-replace-form')
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await panel.updateComplete;
    expect(panel.shadowRoot.querySelector('.browse-replace-confirmation')).to.exist;
    browse._navSearch.value = 'two';
    browse._navSearch.dispatchEvent(new Event('input'));
    browse._navSearch.value = 'one';
    browse._navSearch.dispatchEvent(new Event('input'));
    panel.confirmReplacement();
    await panel.updateComplete;
    expect(requested.called).to.be.false;
    expect(replace.called).to.be.false;
    expect(panel.shadowRoot.querySelector('.browse-replace-confirmation')).to.be.null;
  });

  it('runs existing content search with a trimmed term and streams results to the list', async () => {
    const item = { path: '/org/site/products/original.html', name: 'original', ext: 'html' };
    browse.browseCmp.items = [item];
    const event = await submit('  project plan  ');
    expect(event.defaultPrevented).to.be.true;
    expect(getMatches.calledOnceWithExactly('/org/site/products', 'project plan')).to.be.true;
    expect(browse._searchEngine).to.be.instanceOf(EventTarget);
    expect(browse._searchEngine).not.to.be.instanceOf(HTMLElement);
    expect(browse._searchEngine.browseItems).to.deep.equal([item]);
    expect(browse._searchEngine.browseItems[0]).to.not.equal(item);
    await browse.updateComplete;
    const list = browse.shadowRoot.querySelector('.da-list-type-search');
    expect(list.listItems).to.have.length(1);
    expect(list.listItems[0].path).to.equal('/org/site/products/match.html');
    expect(list.listItems[0].name).to.equal('/match');
    expect(list.listItems[0].ext).to.equal('html');
    expect(browse.shadowRoot.querySelector('[aria-label="Browse files"]').hidden).to.be.true;
    expect(browse.shadowRoot.querySelector('da-search')).to.be.null;
    expect((await searchSummary()).textContent).to.equal('1 result found');
  });

  it('ignores blank submissions', async () => {
    await submit('   ');
    expect(getMatches.called).to.be.false;
    expect(browse._searchEngine).to.equal(undefined);
  });

  it('replaces coherent state snapshots across search, replacement, and clearing', async () => {
    expect(DaBrowse.properties).to.have.property('_searchState');
    expect(DaBrowse.properties).not.to.have.property('_searchEngine');
    expect(DaBrowse.properties).not.to.have.property('_searchRequest');
    await browse.changeMatchCase({ detail: { matchCase: false } });
    const initial = Object.freeze(browse._searchState);
    let finish;
    let start;
    const started = new Promise((resolve) => { start = resolve; });
    getMatches.callsFake(function deferredMatches() {
      this._items = [{ path: '/one.html', name: 'one', ext: 'html' }];
      this.updateList();
      return new Promise((resolve) => {
        finish = resolve;
        start();
      });
    });
    const pending = browse.submitSearch(new CustomEvent('search-submit', { detail: { value: 'one' } }));
    const starting = Object.freeze(browse._searchState);
    expect(starting).not.to.equal(initial);
    expect(starting).to.deep.equal({
      matchCase: false,
      draft: 'one',
      term: 'one',
      items: [],
      loading: true,
    });
    await started;
    const streamed = Object.freeze(browse._searchState);
    const request = browse._searchRequest;
    expect(streamed).not.to.equal(starting);
    expect(streamed.items).to.have.length(1);
    expect(starting.items).to.have.length(0);
    finish();
    await pending;
    const completed = Object.freeze(browse._searchState);
    expect(completed).not.to.equal(streamed);
    expect(completed.loading).to.be.false;
    expect(streamed.loading).to.be.true;
    expect(completed.items).to.equal(streamed.items);
    browse.handlePermissions({ detail: ['write'] });
    const result = { replaced: 1, skipped: 0, errors: [] };
    stub(browse._searchEngine, 'replaceMatches').resolves(result);
    const replacing = browse.replaceSearchMatches({ detail: { replacement: 'two' } });
    const busy = Object.freeze(browse._searchState);
    expect(busy).not.to.equal(completed);
    expect(busy.replacement.loading).to.be.true;
    expect(completed.replacement).to.be.undefined;
    await replacing;
    const replaced = Object.freeze(browse._searchState);
    expect(replaced).not.to.equal(busy);
    expect(replaced.replacement).to.equal(result);
    expect(replaced.term).to.equal('one');
    expect(replaced.items).to.equal(completed.items);
    expect(browse._searchRequest).to.equal(request);
    browse.clearSearch();
    expect(browse._searchState).to.deep.equal({ matchCase: false, loading: false });
    expect(initial).to.deep.equal({ matchCase: false, loading: false });
    expect(replaced.replacement).to.equal(result);
    expect(browse._searchEngine).to.be.undefined;
    expect(browse._searchRequest).to.be.undefined;
  });

  it('ignores old engine updates while the next search is being initialized', async () => {
    await submit('one');
    const previous = browse._searchEngine;
    const pending = browse.submitSearch(new CustomEvent('search-submit', { detail: { value: 'two' } }));
    const starting = browse._searchState;
    expect(browse._searchEngine).to.equal(previous);
    previous.dispatchEvent(new CustomEvent('updated', { detail: { items: [{ path: '/stale.html', name: 'stale', ext: 'html' }] } }));
    expect(browse._searchState).to.equal(starting);
    expect(starting.items).to.have.length(0);
    await pending;
    expect(browse._searchState.term).to.equal('two');
    expect(browse._searchState.items[0].path).to.equal('/org/site/products/match.html');
  });

  it('matches filenames and document content through the existing crawler and source API', async () => {
    getMatches.restore();
    getMatches = spy(SearchEngine.prototype, 'getMatches');
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
      expect(browse._searchState.items.map((item) => item.path)).to.have.members([
        '/org/site/products/content.html',
        '/org/site/products/needle.html',
      ]);
      expect(browse._searchEngine._matches).to.equal(2);
      expect(browse._searchEngine._total).to.equal(3);
      expect((await searchSummary()).textContent).to.equal('2 results found');
      const panel = await browse.getSearchPanel();
      document.body.append(panel);
      await panel.updateComplete;
      expect(panel.searchState.items).to.equal(browse._searchState.items);
      expect(panel.shadowRoot.querySelector('select')).to.be.null;
      expect(panel.shadowRoot.querySelectorAll('[data-match-file]')).to.have.length(2);
      const preview = panel.shadowRoot.querySelector(
        '[data-match-file="/org/site/products/content.html"] [data-preview="match"]',
      );
      expect(preview.textContent).to.equal('<p>needle</p>');
      expect(preview.querySelector('mark').textContent).to.equal('needle');
      expect(panel.shadowRoot.textContent).to.contain('Filename match only.');
      expect(fetch.getCalls().filter(({ args }) => new URL(String(args[0])).pathname.endsWith('.html')))
        .to.have.length(3);
      browse.clearSearch();
      await browse.updateComplete;
      await panel.updateComplete;
      expect(panel.shadowRoot.querySelector('.browse-match-context')).to.be.null;
    } finally {
      fetch.restore();
      globalThis.__crawlMock = originalCrawl;
    }
  });

  it('preserves the case-sensitivity choice on subsequent submissions', async () => {
    await submit('one');
    await browse.changeMatchCase({ detail: { matchCase: false } });
    await submit('two');
    expect(browse._searchEngine._caseSensitive).to.be.false;
    expect(getMatches.thirdCall.args).to.deep.equal(['/org/site/products', 'two']);
  });

  it('opens lazy browse tools from a consumer-owned search action', async () => {
    expect(browse._searchPanel).to.be.undefined;
    const action = browse._searchAction;
    expect(action.getAttribute('aria-label')).to.equal('Search options');
    expect(action.querySelector('svg use').getAttribute('href'))
      .to.equal('/img/icons/s2-icon-properties-20-n.svg#icon');
    let opened;
    const listener = (event) => { opened = event.detail; };
    document.addEventListener(PANEL_EVENT.OPEN, listener);
    try {
      action.click();
      expect(opened).to.deep.equal({ section: 'tools' });
      await browse.updateComplete;
      expect(action.getAttribute('aria-expanded')).to.equal('true');
      const panel = await browse.getSearchPanel();
      document.body.append(panel);
      await panel.updateComplete;
      expect(panel.searchState.scope).to.equal('/org/site/products');
      expect(panel.searchState.matchCase).to.be.true;
      expect(panel.shadowRoot.querySelector('#match-case').disabled).to.be.false;
      panel.close();
      await browse.updateComplete;
      expect(action.getAttribute('aria-expanded')).to.equal('false');
      expect(document.activeElement).to.equal(action);
    } finally {
      document.removeEventListener(PANEL_EVENT.OPEN, listener);
    }
  });

  it('sets match case before searching and retains it after clearing', async () => {
    await browse.changeMatchCase({ detail: { matchCase: false } });
    expect(getMatches.called).to.be.false;
    await submit('one');
    expect(browse._searchEngine.caseSensitive).to.be.false;
    browse.clearSearch();
    await submit('two');
    expect(browse._searchEngine.caseSensitive).to.be.false;
  });

  it('reruns the submitted query rather than a draft when match case changes', async () => {
    await submit('one');
    const previous = browse._searchEngine;
    const cancel = spy(previous, 'cancelSearch');
    browse._navSearch.value = 'unfinished draft';
    browse._navSearch.dispatchEvent(new Event('input'));
    await browse.changeMatchCase({ detail: { matchCase: false } });
    expect(cancel.called).to.be.true;
    expect(getMatches.secondCall.args).to.deep.equal(['/org/site/products', 'one']);
    expect(browse._searchEngine).not.to.equal(previous);
    expect(browse._searchEngine.caseSensitive).to.be.false;
    expect(browse._navSearch.value).to.equal('unfinished draft');
    expect(browse._searchState.draft).to.equal('unfinished draft');
  });

  it('invalidates an active crawl when match case changes without letting it finish the new search', async () => {
    let finish;
    let start;
    const started = new Promise((resolve) => { start = resolve; });
    getMatches.onFirstCall().callsFake(() => new Promise((resolve) => {
      finish = resolve;
      start();
    }));
    const pending = browse.submitSearch(new CustomEvent('search-submit', { detail: { value: 'one' } }));
    await started;
    const previous = browse._searchEngine;
    await browse.changeMatchCase({ detail: { matchCase: false } });
    finish();
    await pending;
    expect(previous._searchRun).to.be.undefined;
    expect(browse._searchEngine.caseSensitive).to.be.false;
    expect(browse._searchState.loading).to.be.false;
    expect(browse._searchState.items).to.have.length(1);
  });
  it('routes a confirmed replacement to the engine and reports its result in the panel', async () => {
    await submit('one');
    browse.handlePermissions({ detail: ['write'] });
    const panel = await browse.getSearchPanel();
    document.body.append(panel);
    await browse.updateComplete;
    await panel.updateComplete;
    const result = { replaced: 1, skipped: 0, errors: [] };
    const replace = stub(browse._searchEngine, 'replaceMatches').resolves(result);
    await browse.replaceSearchMatches({ detail: { replacement: '$& literal' } });
    await browse.updateComplete;
    await panel.updateComplete;
    expect(replace.calledOnceWithExactly({ replacement: '$& literal' })).to.be.true;
    expect(panel.searchState.replacement).to.deep.equal(result);
    expect(panel.shadowRoot.querySelector('[role="status"]').textContent)
      .to.equal('Replaced text in 1 file.');
  });

  it('blocks replacement without write permission and ignores late completion after clearing', async () => {
    await submit('one');
    let finish;
    const replace = stub(browse._searchEngine, 'replaceMatches').callsFake(() => new Promise((resolve) => {
      finish = resolve;
    }));
    await browse.replaceSearchMatches({ detail: { replacement: 'two' } });
    expect(replace.called).to.be.false;
    browse.handlePermissions({ detail: ['write'] });
    const pending = browse.replaceSearchMatches({ detail: { replacement: 'two' } });
    await browse.updateComplete;
    expect(browse._navSearch.disabled).to.be.true;
    browse.clearSearch();
    finish({ replaced: 1, skipped: 0, errors: [] });
    await pending;
    await browse.updateComplete;
    expect(browse._searchState.replacement).to.be.undefined;
    expect(browse._navSearch.disabled).to.be.false;
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
    const creation = browse.newCmp;
    await submit('one');
    const header = browse.shadowRoot.querySelector('da-browse-header');
    await header.updateComplete;
    expect(header.shadowRoot.querySelector('slot')).to.be.null;
    expect(creation.isConnected).to.be.true;
    browse._navSearch.value = '';
    browse._navSearch.dispatchEvent(new Event('input'));
    await browse.updateComplete;
    expect(browse._searchEngine).to.equal(undefined);
    expect(browse.shadowRoot.querySelector('.da-list-type-search')).to.be.null;
    expect(browse.shadowRoot.querySelector('[aria-label="Browse files"]').hidden).to.be.false;
    expect((await searchSummary()).textContent).to.equal('');
    expect(header.shadowRoot.querySelector('slot').assignedElements()).to.deep.equal([creation]);
    expect(browse.newCmp).to.equal(creation);
  });

  it('uses only the field clear action to return to browse', async () => {
    await submit('one');
    expect(browse.shadowRoot.querySelector('.da-search-controls > button')).to.be.null;
    expect(browse.shadowRoot.textContent).not.to.contain('Back to browse');
  });

  it('shows streamed counts without announcing each increment and reports the completed total', async () => {
    let finish;
    let start;
    const started = new Promise((resolve) => { start = resolve; });
    getMatches.callsFake(function deferredMatches() {
      this._items = [{ path: '/one.html', name: 'one', ext: 'html' }];
      this.updateList();
      return new Promise((resolve) => {
        finish = resolve;
        start();
      });
    });
    const pending = browse.submitSearch(new CustomEvent('search-submit', { detail: { value: 'one' } }));
    await started;
    const summary = await searchSummary();
    expect(summary.textContent).to.equal('Searching...');
    const visual = browse.shadowRoot.querySelector('da-browse-header').shadowRoot.querySelector('.da-browse-search-summary');
    expect(visual.querySelector('.da-browse-search-progress').textContent).to.equal('Searching... \u00b7 1 found');
    expect(visual.getAttribute('aria-hidden')).to.equal('true');
    browse._searchEngine._items = [
      ...browse._searchEngine._items,
      { path: '/two.html', name: 'two', ext: 'html' },
    ];
    browse._searchEngine.updateList();
    expect((await searchSummary()).textContent).to.equal('Searching...');
    expect(visual.querySelector('.da-browse-search-progress').textContent).to.equal('Searching... \u00b7 2 found');
    finish();
    await pending;
    expect((await searchSummary()).textContent).to.equal('2 results found');
    expect(visual.hasAttribute('data-loading')).to.be.false;
    expect(visual.querySelector('.da-browse-search-complete').textContent).to.equal('2 results found');
  });

  it('reports an empty completed search rather than an unfinished zero count', async () => {
    getMatches.callsFake(async function emptyMatches() {
      this._items = [];
      this.updateList();
    });
    await submit('missing');
    expect((await searchSummary()).textContent).to.equal('No results found');
  });

  it('keeps the newest search loading when an older search completes', async () => {
    let startFirst;
    let finishFirst;
    let startSecond;
    let finishSecond;
    const firstStarted = new Promise((resolve) => { startFirst = resolve; });
    const secondStarted = new Promise((resolve) => { startSecond = resolve; });
    getMatches.onFirstCall().callsFake(() => new Promise((resolve) => {
      finishFirst = resolve;
      startFirst();
    }));
    getMatches.onSecondCall().callsFake(() => new Promise((resolve) => {
      finishSecond = resolve;
      startSecond();
    }));
    const first = browse.submitSearch(new CustomEvent('search-submit', { detail: { value: 'one' } }));
    await firstStarted;
    const second = browse.submitSearch(new CustomEvent('search-submit', { detail: { value: 'two' } }));
    await secondStarted;
    finishFirst();
    await first;
    expect((await searchSummary()).textContent).to.equal('Searching...');
    finishSecond();
    await second;
    expect((await searchSummary()).textContent).to.equal('No results found');
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
    expect(browse._searchState.items).to.equal(undefined);
    expect(browse._searchEngine).to.equal(undefined);
    expect(browse._searchState.loading).to.be.false;
    expect((await searchSummary()).textContent).to.equal('');
  });

  it('clears results and updates the scope when navigating to a new directory', async () => {
    await submit('one');
    const search = browse._searchEngine;
    browse.details = { fullpath: '/org/site/images' };
    await browse.updateComplete;
    expect(browse._searchEngine).to.equal(undefined);
    expect(search._searchRun).to.equal(undefined);
    expect(browse._navSearch.label).to.equal('Search images');
    expect(browse._navSearch.placeholder).to.equal('Search images');
    expect(browse._navSearch.getAttribute('aria-label')).to.equal('Search images');
    expect(browse._navSearch.value).to.equal('');
  });

  it('removes the injected control and cancels the search when browse disconnects', async () => {
    await submit('one');
    const search = browse._searchEngine;
    browse.remove();
    expect(nav.querySelector('[slot="search"]')).to.be.null;
    expect(browse._navSearch.isConnected).to.be.false;
    expect(browse._searchAction.isConnected).to.be.false;
    expect(search._searchRun).to.equal(undefined);
  });

  it('reattaches the same field and in-field action once when browse reconnects', async () => {
    const field = browse._navSearch;
    const action = browse._searchAction;
    browse.remove();
    document.body.append(browse);
    await browse._navSearchReady;
    expect(nav.shadowRoot.querySelector('slot').assignedElements()).to.deep.equal([field]);
    expect(browse._navSearch).to.equal(field);
    expect(browse._searchAction).to.equal(action);
    expect([...field.children]).to.deep.equal([action]);
    const opened = spy();
    document.addEventListener(PANEL_EVENT.OPEN, opened);
    try {
      action.click();
      expect(opened.calledOnce).to.be.true;
      expect(opened.firstCall.args[0].detail).to.deep.equal({ section: 'tools' });
    } finally {
      document.removeEventListener(PANEL_EVENT.OPEN, opened);
    }
  });

  it('shows search failures rather than reporting empty results', async () => {
    getMatches.rejects(new Error('Network unavailable'));
    await submit('one');
    await browse.updateComplete;
    expect(browse.shadowRoot.querySelector('[role="alert"]').textContent)
      .to.equal('Search failed: Network unavailable');
    expect((await searchSummary()).textContent).to.equal('');
    expect(browse._searchState).to.include({
      term: 'one',
      loading: false,
      error: 'Search failed: Network unavailable',
    });
  });
});
