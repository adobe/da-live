/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setViewport } from '@web/test-runner-commands';

const { setNx } = await import('../../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

await import('../../../../../blocks/browse/da-list/da-list.js');

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

async function waitForRender(listEl) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (listEl.shadowRoot?.querySelector('.da-browse-panel-header')) return;
    await nextFrame();
  }
}

describe('da-list render', () => {
  let el;
  let savedFetch;
  let storageDescriptor;

  beforeEach(() => {
    storageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { configurable: true, value: sessionStorage });
    savedFetch = window.fetch;
    localStorage.removeItem('da-browse-settings');
    // Stub fetch to avoid real network calls during getList()
    window.fetch = () => Promise.resolve(new Response('[]', { status: 200 }));
  });

  afterEach(() => {
    window.fetch = savedFetch;
    if (el && el.parentElement) el.remove();
    el = null;
    localStorage.removeItem('da-browse-settings');
    Object.defineProperty(window, 'localStorage', storageDescriptor);
  });

  async function fixture(props = {}) {
    el = document.createElement('da-list');
    Object.assign(el, props);
    document.body.appendChild(el);
    await waitForRender(el);
    return el;
  }

  async function rerender() {
    el.requestUpdate();
    await el.updateComplete;
  }

  it('restores saved sorting on initial load and applies it again when changing folders', async () => {
    localStorage.setItem('da-browse-settings', JSON.stringify({ sort: { property: 'name', direction: 'ascending' } }));
    el = document.createElement('da-list');
    el.sort = true;
    el.getList = async () => [
      { path: `${el.fullpath}/b.html`, name: 'b', ext: 'html' },
      { path: `${el.fullpath}/a.html`, name: 'a', ext: 'html' },
    ];
    el.updateDeletePermission = async () => {};
    el.fullpath = '/org/site/one';
    document.body.append(el);
    await nextFrame();
    await el.updateComplete;
    expect(el._listItems.map((item) => item.name)).to.deep.equal(['a', 'b']);
    expect(el.sortState.property).to.equal('name');
    el.fullpath = '/org/site/two';
    await nextFrame();
    await el.updateComplete;
    expect(el._listItems.map((item) => item.path)).to.deep.equal([
      '/org/site/two/a.html', '/org/site/two/b.html',
    ]);
    expect(el.shadowRoot.querySelector('[data-column="name"]').getAttribute('aria-sort')).to.equal('ascending');
  });

  it('uses default ordering for an invalid stored sort', async () => {
    localStorage.setItem('da-browse-settings', '{"sort":{"property":"unknown","direction":"ascending"}}');
    await fixture({ fullpath: '/o/r', sort: true });
    await el.updateComplete;
    expect(el.sortState.direction).to.equal('none');
  });

  it('Renders an empty list message when no items', async () => {
    await fixture({ fullpath: '/o/r' });
    el._listItems = [];
    el._continuationToken = null;
    el._allPagesLoaded = true;
    el._emptyMessage = 'Nothing here';
    await rerender();
    expect(el.shadowRoot.querySelector('.empty-list')).to.exist;
    expect(el.shadowRoot.querySelector('.empty-list h3').textContent).to.equal('Nothing here');
  });

  it('Renders the list when items are present', async () => {
    await fixture({ fullpath: '/o/r' });
    el._listItems = [
      { path: '/o/r/page.html', name: 'page', ext: 'html', lastModified: 1704067200000 },
      { path: '/o/r/img.png', name: 'img', ext: 'png', lastModified: 1704067200000 },
    ];
    el.select = true;
    await rerender();
    const items = el.shadowRoot.querySelectorAll('da-list-item');
    expect(items.length).to.equal(2);
  });

  it('Renders the load-more sentinel when continuationToken is set', async () => {
    // Mock fetch to return continuation header
    window.fetch = () => Promise.resolve(new Response('[]', {
      status: 200,
      headers: { 'da-continuation-token': 'tok' },
    }));
    await fixture({ fullpath: '/o/r' });
    el._listItems = [{ path: '/o/r/a', name: 'a', ext: 'html' }];
    await rerender();
    expect(el.shadowRoot.querySelector('.da-list-sentinel')).to.exist;
  });

  it('Filters items by name when _filter is set', async () => {
    await fixture({ fullpath: '/o/r' });
    el._listItems = [
      { path: '/o/r/alpha', name: 'alpha', ext: 'html' },
      { path: '/o/r/beta', name: 'beta', ext: 'html' },
    ];
    el._filter = 'alph';
    await rerender();
    const items = el.shadowRoot.querySelectorAll('da-list-item');
    expect(items.length).to.equal(1);
    expect(items[0].getAttribute('name')).to.equal('alpha');
  });

  it('Renders the status toast when _status is set', async () => {
    await fixture({ fullpath: '/o/r' });
    el._status = { type: 'success', text: 'Hello', description: 'desc' };
    await rerender();
    const toast = el.shadowRoot.querySelector('.da-list-status');
    expect(toast).to.exist;
    expect(toast.textContent).to.contain('Hello');
    expect(toast.textContent).to.contain('desc');
  });

  it('Renders the drop-conflicts dialog when _dropConflicts is set', async () => {
    await fixture({ fullpath: '/o/r' });
    el._dropConflicts = ['a.html', 'b.html'];
    await rerender();
    const dialog = el.shadowRoot.querySelector('da-dialog');
    expect(dialog).to.exist;
    expect(dialog.title).to.contain('Replace 2');
    const items = dialog.querySelectorAll('.da-drop-conflicts li');
    expect(items.length).to.equal(2);
  });

  it('Renders singular text when there is exactly 1 conflict', async () => {
    await fixture({ fullpath: '/o/r' });
    el._dropConflicts = ['a.html'];
    await rerender();
    const dialog = el.shadowRoot.querySelector('da-dialog');
    expect(dialog.title).to.contain('1 existing item');
  });

  it('Renders the errors dialog when _itemErrors has entries', async () => {
    await fixture({ fullpath: '/o/r' });
    el._itemErrors = [{ name: 'a', message: 'Failed' }];
    await rerender();
    const dialog = el.shadowRoot.querySelector('da-dialog');
    expect(dialog).to.exist;
    expect(dialog.textContent).to.contain('Failed');
    expect(dialog.textContent).to.contain('a');
  });

  it('Renders the confirm dialog when _confirm is set', async () => {
    await fixture({ fullpath: '/o/r' });
    el._selectedItems = [{ path: '/o/r/x.html', ext: 'html' }];
    el._confirm = { type: 'delete' };
    el._itemsRemaining = 0;
    await rerender();
    const dialog = el.shadowRoot.querySelector('da-dialog');
    expect(dialog).to.exist;
    expect(dialog.title).to.contain('Deleting');
  });

  it('Renders the drop area when drag is enabled', async () => {
    await fixture({ fullpath: '/o/r' });
    el._listItems = [];
    el._continuationToken = null;
    el.drag = true;
    el._dropMessage = 'Drop here';
    await rerender();
    expect(el.shadowRoot.querySelector('.da-drop-area')).to.exist;
  });

  it('Renders the filter input toggle button', async () => {
    await fixture({ fullpath: '/o/r' });
    el._listItems = [];
    await rerender();
    expect(el.shadowRoot.querySelector('button.da-browse-filter')).to.exist;
  });

  it('Renders a table-style header with Name, Type, and Modified columns', async () => {
    await fixture({ fullpath: '/o/r' });
    el._listItems = [{ path: '/o/r/page.html', name: 'page', ext: 'html', lastModified: 1704067200000 }];
    await rerender();
    const header = el.shadowRoot.querySelector('.da-browse-table-header');
    expect(header).to.exist;
    const columns = [...header.querySelectorAll('[data-column]')].map((node) => node.getAttribute('data-column'));
    expect(columns).to.deep.equal(['select', 'name', 'type', 'modified', 'actions']);
    expect(header.textContent).to.contain('Name');
    expect(header.textContent).to.contain('Type');
    expect(header.textContent).to.contain('Modified');
  });

  it('getSortAttr returns "ascending" / "descending" / "none"', async () => {
    await fixture({ fullpath: '/o/r' });
    expect(el.getSortAttr('new')).to.equal('ascending');
    expect(el.getSortAttr('old')).to.equal('descending');
    expect(el.getSortAttr(undefined)).to.equal('none');
  });

  it('retains the sentinel when a grouped, filtered page has no visible items', async () => {
    await fixture();
    el.loadMore = () => {};
    el._bulkLoading = true;
    el.flattenFolders = false;
    el._listItems = [{ path: '/o/r/page.html', name: 'page', ext: 'html' }];
    el._hiddenTypes = new Set(['Page']);
    el._continuationToken = 'next';
    el._allPagesLoaded = false;
    await rerender();
    expect(el.shadowRoot.querySelector('da-list-item')).to.be.null;
    expect(el.shadowRoot.querySelector('.da-list-sentinel')).to.exist;
  });

  it('uses the same Sheet tag styling for groups and the type filter', async () => {
    await fixture();
    el.flattenFolders = false;
    el._listItems = [{ path: '/o/r/data.json', name: 'data', ext: 'json' }];
    await rerender();
    expect(el.shadowRoot.querySelector('.da-list-group-header .tag').classList.contains('sheet')).to.be.true;
    expect(el.shadowRoot.querySelector('.da-list-types-popover .tag').classList.contains('sheet')).to.be.true;
  });

  it('keeps header and row columns aligned at narrow and wide viewport sizes', async () => {
    await fixture();
    el._listItems = [{ path: '/o/r/page.html', name: 'page', ext: 'html' }];
    await rerender();
    const item = el.shadowRoot.querySelector('da-list-item');
    await item.updateComplete;
    const [listCss, itemCss] = await Promise.all([
      savedFetch('/blocks/browse/da-list/da-list.css').then((response) => response.text()),
      savedFetch('/blocks/browse/da-list-item/da-list-item.css').then((response) => response.text()),
    ]);
    const listStyle = new CSSStyleSheet();
    const itemStyle = new CSSStyleSheet();
    listStyle.replaceSync(listCss);
    itemStyle.replaceSync(itemCss);
    el.shadowRoot.adoptedStyleSheets = [listStyle];
    item.shadowRoot.adoptedStyleSheets = [itemStyle];
    const header = el.shadowRoot.querySelector('.da-browse-table-header');
    const row = item.shadowRoot.querySelector('.da-item-list-item-inner');
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    try {
      for (const [width, columns] of [[480, 3], [700, 4], [1000, 5]]) {
        // eslint-disable-next-line no-await-in-loop
        await setViewport({ width, height: viewport.height });
        const headerColumns = getComputedStyle(header).gridTemplateColumns.split(' ');
        const rowColumns = getComputedStyle(row).gridTemplateColumns.split(' ');
        expect(headerColumns.length).to.equal(columns);
        expect(rowColumns).to.deep.equal(headerColumns);
        const typeDisplay = getComputedStyle(row.querySelector('[data-column="type"]')).display;
        expect(typeDisplay === 'none').to.equal(el.getBoundingClientRect().width < 900);
        const dateDisplay = getComputedStyle(row.querySelector('[data-column="modified"]')).display;
        expect(dateDisplay === 'none').to.equal(el.getBoundingClientRect().width < 500);
      }
    } finally {
      await setViewport(viewport);
    }
  });

  it('filters by type and restores all types', async () => {
    await fixture();
    el._listItems = [
      { path: '/o/r/page.html', name: 'page', ext: 'html' },
      { path: '/o/r/data.json', name: 'data', ext: 'json' },
    ];
    el.toggleTypeVisibility('Page');
    await rerender();
    expect(el.filteredItems.map((item) => item.ext)).to.deep.equal(['json']);
    el.toggleAllTypesVisibility();
    await rerender();
    expect(el.filteredItems.length).to.equal(2);
  });

  it('collapses and expands type groups without changing the data', async () => {
    await fixture();
    el.flattenFolders = false;
    el._listItems = [{ path: '/o/r/page.html', name: 'page', ext: 'html' }];
    el.toggleTypeGroup('Page');
    await rerender();
    expect(el.shadowRoot.querySelector('da-list-item')).to.be.null;
    expect(el.shadowRoot.querySelector('.da-list-group-toggle').getAttribute('aria-expanded')).to.equal('false');
    el.toggleTypeGroup('Page');
    await rerender();
    expect(el.shadowRoot.querySelector('da-list-item')).to.exist;
  });

  it('loads remaining pages before presenting the complete type selection', async () => {
    await fixture();
    el._continuationToken = 'next';
    el._allPagesLoaded = false;
    el.loadAllPages = async () => {
      el._listItems = [{ path: '/o/r/data.json', name: 'data', ext: 'json' }];
      el._allPagesLoaded = true;
      el._continuationToken = null;
    };
    await el.toggleTypesPopover(document.createElement('button'));
    expect(el.allTypeLabels).to.deep.equal(['Sheet']);
    expect(el._bulkLoading).to.be.false;
  });

  it('Hides the action bar when no items are selected', async () => {
    await fixture({ fullpath: '/o/r' });
    el._selectedItems = [];
    await rerender();
    const bar = el.shadowRoot.querySelector('da-actionbar');
    expect(bar.getAttribute('data-visible')).to.equal('false');
  });

  it('Shows the action bar when items are selected', async () => {
    await fixture({ fullpath: '/o/r' });
    el._selectedItems = [{ path: '/x' }];
    await rerender();
    const bar = el.shadowRoot.querySelector('da-actionbar');
    expect(bar.getAttribute('data-visible')).to.equal('true');
  });

  it('Forwards hidePublishConfs to the action bar', async () => {
    await fixture({ fullpath: '/o/r', hidePublishConfs: ['/o/r/blog'] });
    await rerender();
    const bar = el.shadowRoot.querySelector('da-actionbar');
    expect(bar.hidePublishConfs).to.deep.equal(['/o/r/blog']);
  });
});

describe('da-list pagination observer', () => {
  let el;
  let savedFetch;

  beforeEach(async () => {
    // Setting _continuationToken in tests below renders the sentinel, which
    // the IntersectionObserver may immediately consider intersecting and
    // trigger loadMore() → fetch. Stub fetch so it stays in-process.
    savedFetch = window.fetch;
    window.fetch = () => Promise.resolve(new Response('[]', { status: 200 }));
    el = document.createElement('da-list');
    // Initialize so renderCheckBox()/isSelectAll don't throw on first render
    el._listItems = [];
    document.body.appendChild(el);
    await nextFrame();
  });

  afterEach(() => {
    if (el.parentElement) el.remove();
    window.fetch = savedFetch;
  });

  it('setupObserver creates an IntersectionObserver only once', () => {
    el.setupObserver();
    const first = el._observer;
    el.setupObserver();
    expect(el._observer).to.equal(first);
  });

  it('checkLoadMore is callable without throwing', async () => {
    el._continuationToken = 'tok';
    el._allPagesLoaded = false;
    el._isLoadingMore = false;
    // checkLoadMore looks at intersection state via _observer — without an
    // observer/sentinel it's a no-op. Just verify it doesn't throw.
    expect(() => el.checkLoadMore()).not.to.throw();
  });

  it('disconnectedCallback disconnects the observer', () => {
    el.setupObserver();
    let disconnected = false;
    el._observer.disconnect = () => { disconnected = true; };
    el.disconnectedCallback();
    expect(disconnected).to.be.true;
  });
});
