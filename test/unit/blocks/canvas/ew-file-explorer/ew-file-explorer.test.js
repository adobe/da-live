/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

function listUrl(fullpath) {
  const [, org, site, ...rest] = fullpath.split('/');
  const tail = rest.length ? `/${rest.join('/')}` : '/';
  return `https://admin.da.live/list/${org}/${site}${tail}`;
}

function mockFetch(listingsByFullpath) {
  const savedFetch = window.fetch;
  const calls = [];
  window.fetch = async (url) => {
    const s = String(url);
    calls.push(s);
    if (s.includes('/ping/')) return new Response('', { status: 200 });
    const match = Object.entries(listingsByFullpath).find(([fp]) => s === listUrl(fp));
    if (!match) return new Response('', { status: 404 });
    return new Response(JSON.stringify(match[1]), { status: 200 });
  };
  return { calls, restore: () => { window.fetch = savedFetch; } };
}

describe('EwFileExplorer', () => {
  let el;

  beforeEach(async () => {
    await import('../../../../../blocks/canvas/ew-file-explorer/ew-file-explorer.js');
    el = document.createElement('ew-file-explorer');
    document.body.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => { el.remove(); });

  describe('_refreshPath', () => {
    beforeEach(() => {
      el._org = 'org';
      el._site = 'site';
      el._treeRoot = '/org/site';
    });

    it('fetches and caches the target, marking it expanded', async () => {
      el._cache = { '/org/site': [{ name: 'a', path: '/org/site/a' }] };
      el._expanded = new Set(['org/site']);

      const { calls, restore } = mockFetch({ '/org/site/a': [{ name: 'b.html', path: '/org/site/a/b.html', ext: 'html' }] });

      let ok;
      try {
        ok = await el._refreshPath('/org/site/a');
      } finally {
        restore();
      }

      expect(ok).to.be.true;
      expect(el._cache['/org/site/a']).to.deep.equal([
        { name: 'b.html', path: '/org/site/a/b.html', ext: 'html' },
      ]);
      expect(el._expanded.has('org/site/a')).to.be.true;
      expect(calls.filter((c) => c.includes('/list/'))).to.have.length(1);
    });

    it('marks the target expanded even if it was collapsed before the refresh', async () => {
      el._cache = { '/org/site': [{ name: 'a', path: '/org/site/a' }] };
      el._expanded = new Set(['org/site']);

      const { restore } = mockFetch({ '/org/site/a': [] });

      try {
        await el._refreshPath('/org/site/a');
      } finally {
        restore();
      }

      expect(el._expanded.has('org/site')).to.be.true;
      expect(el._expanded.has('org/site/a')).to.be.true;
    });

    it('returns false and leaves cache untouched when the fetch fails', async () => {
      el._cache = { '/org/site': [] };
      el._expanded = new Set(['org/site']);

      const savedFetch = window.fetch;
      window.fetch = async (url) => {
        if (String(url).includes('/ping/')) return new Response('', { status: 200 });
        return new Response('', { status: 500 });
      };

      let ok;
      try {
        ok = await el._refreshPath('/org/site/missing');
      } finally {
        window.fetch = savedFetch;
      }

      expect(ok).to.be.false;
      expect(el._cache['/org/site/missing']).to.be.undefined;
    });
  });

  describe('_expandToPath', () => {
    beforeEach(() => {
      el._org = 'org';
      el._site = 'site';
      el._treeRoot = '/org/site';
    });

    it('expands and loads ancestors between the root and the new path', async () => {
      el._cache = { '/org/site': [] };
      el._expanded = new Set(['org/site']);

      const { calls, restore } = mockFetch({ '/org/site/a': [{ name: 'b', path: '/org/site/a/b' }] });

      try {
        await el._expandToPath('a/b');
      } finally {
        restore();
      }

      expect(el._cache['/org/site/a']).to.deep.equal([{ name: 'b', path: '/org/site/a/b' }]);
      expect(el._expanded.has('org/site/a')).to.be.true;
      expect(calls.filter((c) => c.includes('/list/'))).to.have.length(1);
    });

    it('resets to "Not permitted" when the parent folder fetch fails', async () => {
      el._cache = { '/org/site': [] };
      el._expanded = new Set(['org/site']);

      const savedFetch = window.fetch;
      window.fetch = async (url) => {
        if (String(url).includes('/ping/')) return new Response('', { status: 200 });
        return new Response('', { status: 500 });
      };

      try {
        await el._expandToPath('a/b');
      } finally {
        window.fetch = savedFetch;
      }

      expect(el._error).to.equal('Not permitted');
      expect(el._treeRoot).to.be.null;
    });
  });

  describe('_onRefreshClick', () => {
    it('refreshes the tree root and every expanded folder', async () => {
      el._treeRoot = '/org/site';
      el._expanded = new Set(['org/site', 'org/site/a']);

      const calls = [];
      el._refreshPath = async (fp) => {
        calls.push(fp);
        return true;
      };

      await el._onRefreshClick();

      expect(calls.sort()).to.deep.equal(['/org/site', '/org/site/a'].sort());
    });

    it('sets _refreshing while the operation is in flight and clears it after', async () => {
      el._treeRoot = '/org/site';
      el._expanded = new Set();

      let sawRefreshing = false;
      el._refreshPath = async () => {
        sawRefreshing = el._refreshing;
        return true;
      };

      await el._onRefreshClick();

      expect(sawRefreshing).to.be.true;
      expect(el._refreshing).to.be.false;
    });

    it('disables the header button and shows a spinner while refreshing, restores both after', async () => {
      el._treeRoot = '/org/site';
      el._expanded = new Set();

      const btn = el.getHeaderActions();

      let sawDisabled = false;
      let sawSpinner = false;
      el._refreshPath = async () => {
        sawDisabled = btn.disabled;
        sawSpinner = !!btn.querySelector('.da-loading-spinner');
        return true;
      };

      await el._onRefreshClick();

      expect(sawDisabled).to.be.true;
      expect(sawSpinner).to.be.true;
      expect(btn.disabled).to.be.false;
      expect(btn.querySelector('.da-loading-spinner')).to.be.null;
      expect(btn.querySelector('svg')).to.exist;
    });
  });

  describe('getHeaderActions', () => {
    it('returns the same cached button node on repeated calls', () => {
      const first = el.getHeaderActions();
      const second = el.getHeaderActions();

      expect(first).to.equal(second);
      expect(first.tagName).to.equal('BUTTON');
      expect(first.className).to.equal('da-icon-btn');
    });

    it('clicking the returned button invokes _onRefreshClick', () => {
      const btn = el.getHeaderActions();

      let called = false;
      el._onRefreshClick = () => { called = true; };

      btn.click();

      expect(called).to.be.true;
    });
  });

  describe('create-page dialog', () => {
    beforeEach(() => {
      el._org = 'org';
      el._site = 'site';
      el._treeRoot = '/org/site';
    });

    describe('_openCreateDialog / _closeCreateDialog', () => {
      it('opens with the folder path, closes back to null', () => {
        const item = { type: 'directory', path: '/org/site/a', name: 'a' };
        const e = { stopPropagation: () => {}, preventDefault: () => {} };

        el._openCreateDialog(e, item);
        expect(el._createDialog).to.deep.equal({ folder: '/org/site/a', saving: false, error: null });

        el._closeCreateDialog();
        expect(el._createDialog).to.be.null;
      });
    });

    // Name validation/sanitization is covered by da-name-dialog's own test suite —
    // _handleCreateSubmit only ever receives an already-valid, sanitized name via
    // the da-name-submit event's detail.
    describe('_handleCreateSubmit', () => {
      it('creates the page and refreshes the folder on success', async () => {
        el._createDialog = { folder: '/org/site/a', saving: false, error: null };

        const fetchCalls = [];
        const savedFetch = window.fetch;
        window.fetch = async (url, opts) => {
          if (String(url).includes('/ping/')) return new Response('', { status: 200 });
          const body = opts?.body instanceof FormData ? opts.body.get('data') : opts?.body;
          const bodyText = body && typeof body.text === 'function' ? await body.text() : body;
          fetchCalls.push({ url: String(url), method: opts?.method, bodyText });
          return new Response('ok', { status: 200 });
        };

        let refreshedPath;
        el._refreshPath = async (fp) => {
          refreshedPath = fp;
          return true;
        };

        try {
          await el._handleCreateSubmit({ detail: { name: 'my-new-page' } });
        } finally {
          window.fetch = savedFetch;
        }

        expect(fetchCalls).to.have.length(1);
        expect(fetchCalls[0].url).to.equal('https://admin.da.live/source/org/site/a/my-new-page.html');
        expect(fetchCalls[0].method).to.equal('POST');
        expect(fetchCalls[0].bodyText).to.equal(
          '<body><header></header><main><div></div></main><footer></footer></body>',
        );
        expect(refreshedPath).to.equal('/org/site/a');
        expect(el._createDialog).to.be.null;
      });

      it('shows an inline error and keeps the dialog open when save fails', async () => {
        el._createDialog = { folder: '/org/site/a', saving: false, error: null };

        const savedFetch = window.fetch;
        window.fetch = async (url) => {
          if (String(url).includes('/ping/')) return new Response('', { status: 200 });
          return new Response('', { status: 500 });
        };

        let refreshCalled = false;
        el._refreshPath = async () => {
          refreshCalled = true;
          return true;
        };

        try {
          await el._handleCreateSubmit({ detail: { name: 'my-page' } });
        } finally {
          window.fetch = savedFetch;
        }

        expect(el._createDialog.error).to.be.a('string').and.not.empty;
        expect(el._createDialog.folder).to.equal('/org/site/a');
        expect(refreshCalled).to.be.false;
      });

      it('refreshes the folder and navigates to the new page when openAfter is true', async () => {
        // Regression: _expandToPath (run by the hash-change handler that fires
        // once the hash below is set) only re-fetches a folder that isn't
        // already cached — the folder you create in almost always already is
        // — so the refresh here must not be skipped in favor of relying on
        // that side effect, or the new page silently never appears.
        el._createDialog = { folder: '/org/site/a', saving: false, error: null };
        el._org = 'org';
        el._site = 'site';

        const savedFetch = window.fetch;
        window.fetch = async (url) => {
          if (String(url).includes('/ping/')) return new Response('', { status: 200 });
          return new Response('ok', { status: 200 });
        };

        let refreshedPath;
        el._refreshPath = async (fp) => {
          refreshedPath = fp;
          return true;
        };
        const savedHash = window.location.hash;

        try {
          await el._handleCreateSubmit({ detail: { name: 'my-new-page', openAfter: true } });

          expect(refreshedPath).to.equal('/org/site/a');
          expect(window.location.hash).to.equal('#/org/site/a/my-new-page');
          expect(el._createDialog).to.be.null;
        } finally {
          window.fetch = savedFetch;
          window.location.hash = savedHash;
        }
      });
    });
  });

  describe('_warmCrawl', () => {
    it('starts the crawl when a tree root is loaded', () => {
      el._treeRoot = '/org/site';
      let called = false;
      el._getCrawlEntry = () => { called = true; };

      el._warmCrawl();

      expect(called).to.be.true;
    });

    it('does nothing before a tree root is loaded', () => {
      el._treeRoot = null;
      let called = false;
      el._getCrawlEntry = () => { called = true; };

      el._warmCrawl();

      expect(called).to.be.false;
    });
  });

  describe('_runSearch category filter', () => {
    beforeEach(() => {
      el._treeRoot = '/org/site';
      el._crawlCache = {
        '/org/site': {
          files: [
            { name: 'foo.html', path: '/org/site/foo.html', ext: 'html' },
            { name: 'foo-data.json', path: '/org/site/foo-data.json', ext: 'json' },
            { name: 'foo-cta.html', path: '/org/site/fragments/foo-cta.html', ext: 'html' },
          ],
          done: true,
          listeners: new Set(),
        },
      };
    });

    it('matches on name only when category is "all"', () => {
      el._category = 'all';
      el._runSearch('foo');
      expect(el._searchResults.map((f) => f.name).sort()).to.deep.equal(
        ['foo-cta.html', 'foo-data.json', 'foo.html'].sort(),
      );
    });

    it('narrows to pages, excluding files under a fragments folder', () => {
      el._category = 'page';
      el._runSearch('foo');
      expect(el._searchResults.map((f) => f.name)).to.deep.equal(['foo.html']);
    });

    it('narrows to sheets', () => {
      el._category = 'sheet';
      el._runSearch('foo');
      expect(el._searchResults.map((f) => f.name)).to.deep.equal(['foo-data.json']);
    });

    it('narrows to fragments', () => {
      el._category = 'fragment';
      el._runSearch('foo');
      expect(el._searchResults.map((f) => f.name)).to.deep.equal(['foo-cta.html']);
    });
  });

  describe('_onCategoryChange', () => {
    beforeEach(() => {
      el._treeRoot = '/org/site';
      el._crawlCache = {
        '/org/site': {
          files: [
            { name: 'foo.html', path: '/org/site/foo.html', ext: 'html' },
            { name: 'foo-data.json', path: '/org/site/foo-data.json', ext: 'json' },
            { name: 'bar.json', path: '/org/site/sub/bar.json', ext: 'json' },
          ],
          done: true,
          listeners: new Set(),
        },
      };
    });

    it('re-runs the search against the active term', () => {
      el._searchTerm = 'foo';
      el._category = 'all';

      el._onCategoryChange({ detail: { value: 'sheet' } });

      expect(el._category).to.equal('sheet');
      expect(el._searchResults.map((f) => f.name)).to.deep.equal(['foo-data.json']);
    });

    it('kicks off the crawl and builds matching folders even with no active search term', () => {
      el._searchTerm = '';
      el._category = 'all';

      el._onCategoryChange({ detail: { value: 'sheet' } });

      expect(el._category).to.equal('sheet');
      expect(el._searchResults).to.not.exist;
      expect(el._categoryCrawling).to.be.false;
      expect([...el._matchingFolders].sort()).to.deep.equal(['org', 'org/site', 'org/site/sub']);
    });

    it('resets crawl state when the category goes back to "all"', () => {
      el._onCategoryChange({ detail: { value: 'sheet' } });
      expect(el._matchingFolders).to.exist;

      el._onCategoryChange({ detail: { value: 'all' } });

      expect(el._matchingFolders).to.be.null;
      expect(el._categoryCrawling).to.be.false;
    });
  });

  describe('_rowTitle', () => {
    it('shows the AEM URL for a page', () => {
      const title = el._rowTitle({ path: '/org/site/blog/foo.html', ext: 'html' });
      expect(title).to.equal('https://main--site--org.aem.page/blog/foo');
    });

    it('shows the AEM URL for a sheet', () => {
      const title = el._rowTitle({ path: '/org/site/blog/data.json', ext: 'json' });
      expect(title).to.equal('https://main--site--org.aem.page/blog/data.json');
    });

    it('is empty for a directory', () => {
      expect(el._rowTitle({ path: '/org/site/blog' })).to.equal('');
    });

    it('is empty for a non-copyable file', () => {
      expect(el._rowTitle({ path: '/org/site/a.png', ext: 'png' })).to.equal('');
    });
  });

  describe('_relativeParentPath', () => {
    it('omits the org/site root prefix', () => {
      el._treeRoot = '/org/site';
      const path = el._relativeParentPath({ path: '/org/site/blog/foo.html' });
      expect(path).to.equal('blog');
    });

    it('returns an empty string for a file directly in the root', () => {
      el._treeRoot = '/org/site';
      const path = el._relativeParentPath({ path: '/org/site/foo.html' });
      expect(path).to.equal('');
    });

    it('omits a deeper, permission-scoped root prefix', () => {
      el._treeRoot = '/org/site/a/b';
      const path = el._relativeParentPath({ path: '/org/site/a/b/c/foo.html' });
      expect(path).to.equal('c');
    });
  });

  describe('_buildMatchingFolders', () => {
    it('collects every ancestor folder pathKey of a matching file', () => {
      el._category = 'sheet';
      const folders = el._buildMatchingFolders([
        { name: 'foo.html', path: '/org/site/foo.html', ext: 'html' },
        { name: 'bar.json', path: '/org/site/a/b/bar.json', ext: 'json' },
      ]);
      expect([...folders].sort()).to.deep.equal(['org', 'org/site', 'org/site/a', 'org/site/a/b']);
    });
  });

  describe('_visibleChildren', () => {
    const children = [
      { type: 'directory', name: 'sub', path: '/org/site/sub', pathKey: 'org/site/sub', children: [] },
      { type: 'file', name: 'a.html', path: '/org/site/a.html', pathKey: 'org/site/a.html', ext: 'html' },
      { type: 'file', name: 'a.json', path: '/org/site/a.json', pathKey: 'org/site/a.json', ext: 'json' },
      {
        type: 'file',
        name: 'b.html',
        path: '/org/site/fragments/b.html',
        pathKey: 'org/site/fragments/b.html',
        ext: 'html',
      },
    ];

    it('returns everything when category is "all"', () => {
      el._category = 'all';
      expect(el._visibleChildren(children)).to.deep.equal(children);
    });

    it('hides folders while no crawl data is available yet, narrowing files regardless', () => {
      el._category = 'sheet';
      el._matchingFolders = null;
      expect(el._visibleChildren(children).map((c) => c.name)).to.deep.equal(['a.json']);
    });

    it('hides a folder once the crawl proves it has no matching descendant', () => {
      el._category = 'sheet';
      el._matchingFolders = new Set();
      expect(el._visibleChildren(children).map((c) => c.name)).to.deep.equal(['a.json']);
    });

    it('keeps a folder once the crawl proves it contains a matching descendant', () => {
      el._category = 'fragment';
      el._matchingFolders = new Set(['org/site/fragments']);
      expect(el._visibleChildren(children).map((c) => c.name)).to.deep.equal(['b.html']);
    });

    it('keeps a directory child whose own pathKey is proven to contain a match', () => {
      el._category = 'page';
      el._matchingFolders = new Set(['org/site/sub']);
      expect(el._visibleChildren(children).map((c) => c.name)).to.deep.equal(['sub', 'a.html']);
    });
  });

  describe('category persistence across hash changes', () => {
    it('resets to "all" when the org/site root changes', () => {
      el._org = 'org';
      el._site = 'site';
      el._category = 'sheet';
      el._loadFromLeaves = async () => {};

      el._onHashChange({ org: 'org', site: 'other-site', path: '' });

      expect(el._category).to.equal('all');
    });

    it('resets to "all" when navigating away from a site', () => {
      el._org = 'org';
      el._site = 'site';
      el._category = 'sheet';

      el._onHashChange({ org: '', site: '', path: '' });

      expect(el._category).to.equal('all');
    });
  });

  describe('.action-btn keyboard reachability', () => {
    beforeEach(async () => {
      el._org = 'org';
      el._site = 'site';
      el._treeRoot = '/org/site';
      el._cache = { '/org/site': [{ name: 'a', path: '/org/site/a' }] };
      el._expanded = new Set(['org/site']);
      await el.updateComplete;
    });

    async function withRealCss() {
      const cssText = await (await fetch('/blocks/canvas/ew-file-explorer/ew-file-explorer.css')).text();
      const realSheet = new CSSStyleSheet();
      realSheet.replaceSync(cssText);
      el.shadowRoot.adoptedStyleSheets = [...el.shadowRoot.adoptedStyleSheets, realSheet];
    }

    it('is hidden by default, even on the row that is the current roving-tabindex stop', async () => {
      await withRealCss();

      const rows = [...el.shadowRoot.querySelectorAll('.row')];
      const firstRow = rows[0];
      expect(firstRow.getAttribute('tabindex')).to.equal('0');

      const btn = firstRow.closest('.row-wrap').querySelector('.action-btn');
      expect(getComputedStyle(btn).visibility).to.equal('hidden');
    });

    it('becomes visible when the row itself receives real focus, and hides again on blur', async () => {
      await withRealCss();

      const firstRow = el.shadowRoot.querySelector('.row');
      const btn = firstRow.closest('.row-wrap').querySelector('.action-btn');
      expect(getComputedStyle(btn).visibility).to.equal('hidden');

      firstRow.focus();
      expect(getComputedStyle(btn).visibility).to.equal('visible');

      firstRow.blur();
      expect(getComputedStyle(btn).visibility).to.equal('hidden');
    });

    it('does not let Enter/Space on the button bubble into toggling the row', async () => {
      const firstRow = el.shadowRoot.querySelector('.row');
      const btn = firstRow.closest('.row-wrap').querySelector('.action-btn');
      const expandedBefore = new Set(el._expanded);

      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      btn.dispatchEvent(event);

      expect(el._expanded).to.deep.equal(expandedBefore);
    });
  });
});
