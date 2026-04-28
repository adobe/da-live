/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

await import('../../../../../blocks/browse/da-list/da-list.js');

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('da-list render', () => {
  let el;
  let savedFetch;

  beforeEach(() => {
    savedFetch = window.fetch;
    // Stub fetch to avoid real network calls during getList()
    window.fetch = () => Promise.resolve(new Response('[]', { status: 200 }));
  });

  afterEach(() => {
    window.fetch = savedFetch;
    if (el && el.parentElement) el.remove();
    el = null;
  });

  async function fixture(props = {}) {
    el = document.createElement('da-list');
    Object.assign(el, props);
    document.body.appendChild(el);
    // Wait for getList + firstUpdated dynamic imports
    await nextFrame();
    await nextFrame();
    await nextFrame();
    return el;
  }

  it('Renders an empty list message when no items', async () => {
    await fixture({ fullpath: '/o/r' });
    el._listItems = [];
    el._continuationToken = null;
    el._emptyMessage = 'Nothing here';
    el.requestUpdate();
    await nextFrame();
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
    el.requestUpdate();
    await nextFrame();
    await nextFrame();
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
    el.requestUpdate();
    await nextFrame();
    await nextFrame();
    expect(el.shadowRoot.querySelector('.da-list-sentinel')).to.exist;
  });

  it('Filters items by name when _filter is set', async () => {
    await fixture({ fullpath: '/o/r' });
    el._listItems = [
      { path: '/o/r/alpha', name: 'alpha', ext: 'html' },
      { path: '/o/r/beta', name: 'beta', ext: 'html' },
    ];
    el._filter = 'alph';
    el.requestUpdate();
    await nextFrame();
    const items = el.shadowRoot.querySelectorAll('da-list-item');
    expect(items.length).to.equal(1);
    expect(items[0].getAttribute('name')).to.equal('alpha');
  });

  it('Renders the status toast when _status is set', async () => {
    await fixture({ fullpath: '/o/r' });
    el._status = { type: 'success', text: 'Hello', description: 'desc' };
    el.requestUpdate();
    await nextFrame();
    const toast = el.shadowRoot.querySelector('.da-list-status');
    expect(toast).to.exist;
    expect(toast.textContent).to.contain('Hello');
    expect(toast.textContent).to.contain('desc');
  });

  it('Renders the drop-conflicts dialog when _dropConflicts is set', async () => {
    await fixture({ fullpath: '/o/r' });
    el._dropConflicts = ['a.html', 'b.html'];
    el.requestUpdate();
    await nextFrame();
    const dialog = el.shadowRoot.querySelector('da-dialog');
    expect(dialog).to.exist;
    expect(dialog.title).to.contain('Replace 2');
    const items = dialog.querySelectorAll('.da-drop-conflicts li');
    expect(items.length).to.equal(2);
  });

  it('Renders singular text when there is exactly 1 conflict', async () => {
    await fixture({ fullpath: '/o/r' });
    el._dropConflicts = ['a.html'];
    el.requestUpdate();
    await nextFrame();
    const dialog = el.shadowRoot.querySelector('da-dialog');
    expect(dialog.title).to.contain('1 existing item');
  });

  it('Renders the errors dialog when _itemErrors has entries', async () => {
    await fixture({ fullpath: '/o/r' });
    el._itemErrors = [{ name: 'a', message: 'Failed' }];
    el.requestUpdate();
    await nextFrame();
    const dialog = el.shadowRoot.querySelector('da-dialog');
    expect(dialog).to.exist;
    expect(dialog.textContent).to.contain('Failed');
    expect(dialog.textContent).to.contain('a');
  });

  it('Renders the confirm dialog when _confirm is set', async () => {
    await fixture({ fullpath: '/o/r' });
    el._selectedItems = [{ path: '/o/r/x.html', ext: 'html' }];
    el._confirm = 'delete';
    el._itemsRemaining = 0;
    el.requestUpdate();
    await nextFrame();
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
    el.requestUpdate();
    await nextFrame();
    expect(el.shadowRoot.querySelector('.da-drop-area')).to.exist;
  });

  it('Renders the filter input toggle button', async () => {
    await fixture({ fullpath: '/o/r' });
    el._listItems = [];
    el.requestUpdate();
    await nextFrame();
    expect(el.shadowRoot.querySelector('button.da-browse-filter')).to.exist;
  });

  it('getSortAttr returns "ascending" / "descending" / "none"', async () => {
    await fixture({ fullpath: '/o/r' });
    expect(el.getSortAttr('new')).to.equal('ascending');
    expect(el.getSortAttr('old')).to.equal('descending');
    expect(el.getSortAttr(undefined)).to.equal('none');
  });

  it('Hides the action bar when no items are selected', async () => {
    await fixture({ fullpath: '/o/r' });
    el._selectedItems = [];
    el.requestUpdate();
    await nextFrame();
    const bar = el.shadowRoot.querySelector('da-actionbar');
    expect(bar.getAttribute('data-visible')).to.equal('false');
  });

  it('Shows the action bar when items are selected', async () => {
    await fixture({ fullpath: '/o/r' });
    el._selectedItems = [{ path: '/x' }];
    el.requestUpdate();
    await nextFrame();
    const bar = el.shadowRoot.querySelector('da-actionbar');
    expect(bar.getAttribute('data-visible')).to.equal('true');
  });
});

describe('da-list pagination observer', () => {
  let el;

  beforeEach(async () => {
    el = document.createElement('da-list');
    document.body.appendChild(el);
    await nextFrame();
  });

  afterEach(() => {
    if (el.parentElement) el.remove();
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
