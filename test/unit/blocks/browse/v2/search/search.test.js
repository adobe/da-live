/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { stub, spy } from 'sinon';
import { getMatchContext } from '../../../../../../blocks/browse/v2/search/utils.js';

// Setup for dynamic imports
const { setNx, getNx2Api } = await import('../../../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: SearchEngine } = await import('../../../../../../blocks/browse/v2/search/search.js');

// nx2 api.js pings `/ping/{org}/{site}` to detect hlx6 before every source
// op and caches the result in a module-level closure. Pre-warm the cache with
// a legacy (no-upgrade) response so individual tests don't need to mock the
// ping in their fetch stubs and can keep one-fetch-per-call assertions.
async function primeHlx6Cache(orgSitePairs) {
  const tempStub = stub(window, 'fetch').callsFake(async () => new Response('', { status: 200 }));
  try {
    const { isHlx6 } = await getNx2Api();
    await Promise.all(orgSitePairs.map(([org, site]) => isHlx6(org, site)));
  } finally {
    tempStub.restore();
  }
}

describe('SearchEngine', () => {
  let searchEngine;
  let fetchStub;

  before(async () => {
    await primeHlx6Cache([['myorg', 'mysite'], ['org', 'site']]);
  });

  beforeEach(() => {
    searchEngine = new SearchEngine();
    fetchStub = stub(window, 'fetch');
  });

  afterEach(() => {
    searchEngine.cancelSearch();
    fetchStub.restore();
  });

  describe('match context', () => {
    it('retains original casing and uses literal, case-aware matches', () => {
      const text = '<p>Old old OLD a.b aXb A.B</p>';
      const context = getMatchContext({ text, filename: 'old.html', term: 'old', caseSensitive: false });
      const snippet = context.snippets[0];
      expect(snippet.text).to.equal(text);
      expect(snippet.matches.map(({ start, end }) => snippet.text.slice(start, end)))
        .to.deep.equal(['Old', 'old', 'OLD']);
      expect(context.filenameMatch).to.be.true;
      const sensitive = getMatchContext({ text, filename: 'OLD.html', term: 'old', caseSensitive: true });
      expect(sensitive.snippets[0].matches).to.have.length(1);
      expect(sensitive.filenameMatch).to.be.false;
      const literal = getMatchContext({ text, filename: 'aXb.html', term: 'a.b', caseSensitive: false });
      expect(literal.snippets[0].matches.map(({ start, end }) => text.slice(start, end)))
        .to.deep.equal(['a.b', 'A.B']);
      expect(literal.filenameMatch).to.be.false;
    });

    it('distinguishes filename-only matches and non-matching files', () => {
      expect(getMatchContext({ text: 'unrelated', filename: 'old.html', term: 'old', caseSensitive: true })).to.deep.equal({ filenameMatch: true, snippets: [], hasMore: false });
      expect(getMatchContext({ text: 'unrelated', filename: 'other.html', term: 'old', caseSensitive: true })).to.deep.equal({ filenameMatch: false, snippets: [], hasMore: false });
    });

    it('preserves Unicode source and its UTF-16 match offsets', () => {
      const text = 'A \u{1F600} old \u{1F600} B';
      const context = getMatchContext({
        text,
        filename: 'page.html',
        term: '\u{1F600}',
        caseSensitive: true,
      });
      const snippet = context.snippets[0];
      expect(snippet.text).to.equal(text);
      expect(snippet.matches).to.have.length(2);
      snippet.matches.forEach(({ start, end }) => {
        expect(end - start).to.equal(2);
        expect(snippet.text.slice(start, end)).to.equal('\u{1F600}');
      });
    });

    it('bounds retained source excerpts and stops after the first three windows', () => {
      const text = `${'x'.repeat(200)}needle`.repeat(12);
      const context = getMatchContext({ text, filename: 'page.html', term: 'needle', caseSensitive: true });
      expect(context.snippets).to.have.length(3);
      expect(context.hasMore).to.be.true;
      context.snippets.forEach((snippet) => {
        expect(snippet.text.length).to.be.at.most(160);
        expect(snippet.text)
          .to.equal(text.slice(snippet.offset, snippet.offset + snippet.text.length));
        expect(snippet.truncatedStart).to.be.true;
        expect(snippet.truncatedEnd).to.be.true;
        expect(snippet.matches.map(({ start, end }) => snippet.text.slice(start, end)))
          .to.deep.equal(['needle']);
      });
      expect(JSON.stringify(context).length).to.be.lessThan(1000);
      const term = 'a'.repeat(500);
      const longMatch = getMatchContext({ text: term, filename: 'page.html', term, caseSensitive: true }).snippets[0];
      expect(longMatch.text.length).to.equal(160);
      expect(longMatch.matches).to.deep.equal([{ start: 0, end: 160 }]);
      expect(longMatch.truncatedEnd).to.be.true;
    });

    it('groups nearby matches without overlapping source windows', () => {
      const context = getMatchContext({ text: 'a'.repeat(1000), filename: 'page.html', term: 'a', caseSensitive: true });
      expect(context.snippets).to.have.length(3);
      expect(context.hasMore).to.be.true;
      context.snippets.forEach((snippet, index) => {
        expect(snippet.text.length).to.be.at.most(160);
        expect(snippet.matches).to.have.length(snippet.text.length);
        if (index) {
          const previous = context.snippets[index - 1];
          expect(snippet.offset).to.equal(previous.offset + previous.text.length);
        }
        snippet.matches.forEach(({ start, end }) => {
          expect(snippet.text.slice(start, end)).to.equal('a');
        });
      });
    });

    it('does not present the truncated tail of a previous match as unchanged context', () => {
      const term = 'a'.repeat(120);
      const context = getMatchContext({
        text: `b${term.repeat(3)}`,
        filename: 'page.html',
        term,
        caseSensitive: true,
      });
      expect(context.snippets).to.have.length(2);
      expect(context.snippets[0].matches).to.have.length(2);
      expect(context.snippets[1].offset).to.equal(241);
      expect(context.snippets[1].matches).to.deep.equal([{ start: 0, end: 120 }]);
    });

    it('does not expose failed source response bodies as match previews', async () => {
      const previous = globalThis.__crawlMock;
      const file = { path: '/org/site/page.html', name: 'page', ext: 'html' };
      stub(searchEngine, 'getSearchScope').resolves({ paths: ['/org/site'], files: [file] });
      globalThis.__crawlMock = ({ callback }) => ({ results: callback(file) });
      fetchStub.resolves(new Response('old', { status: 403 }));
      try {
        await searchEngine.getMatches('/org/site', 'old');
        expect(fetchStub.called).to.be.true;
        expect(searchEngine._items).to.deep.equal([]);
        expect(searchEngine._matches).to.equal(0);
      } finally {
        globalThis.__crawlMock = previous;
      }
    });
  });

  describe('constructor', () => {
    it('initializes with default values', () => {
      const search = new SearchEngine();
      expect(search).to.be.instanceOf(EventTarget);
      expect(search).not.to.be.instanceOf(HTMLElement);
      expect(customElements.get('da-search')).to.equal(undefined);
      expect(search._items).to.deep.equal([]);
      expect(search._total).to.equal(0);
      expect(search._matches).to.equal(0);
      expect(search._time).to.be.null;
    });
  });

  describe('setDefault', () => {
    it('resets all state properties', () => {
      searchEngine._items = [{ path: '/test' }];
      searchEngine._total = 5;
      searchEngine._matches = 3;
      searchEngine._time = '1.234';

      searchEngine.setDefault();

      expect(searchEngine._items).to.deep.equal([]);
      expect(searchEngine._total).to.equal(0);
      expect(searchEngine._matches).to.equal(0);
      expect(searchEngine._time).to.be.null;
    });
  });

  describe('nav search support', () => {
    it('cancels the crawl and invalidates its callbacks', () => {
      const cancel = spy();
      searchEngine._cancelCrawl = cancel;
      searchEngine.cancelSearch();
      expect(cancel.calledOnce).to.be.true;
      expect(searchEngine._searchRun).to.equal(undefined);
    });

    it('does not start a crawl after cancellation during scope resolution', async () => {
      let finish;
      const scope = new Promise((resolve) => { finish = resolve; });
      stub(searchEngine, 'getSearchScope').returns(scope);
      const pending = searchEngine.getMatches('/org/site', 'term');
      searchEngine.cancelSearch();
      finish({ paths: [], files: [] });
      await pending;
      expect(searchEngine._cancelCrawl).to.equal(undefined);
      expect(searchEngine._items).to.deep.equal([]);
      expect(fetchStub.called).to.be.false;
    });
  });

  describe('updateList', () => {
    it('dispatches updated event with items', () => {
      const eventSpy = spy();
      searchEngine.addEventListener('updated', eventSpy);
      searchEngine._items = [{ path: '/test.html' }];

      searchEngine.updateList();

      expect(eventSpy.calledOnce).to.be.true;
      expect(eventSpy.firstCall.args[0].detail.items).to.deep.equal([{ path: '/test.html' }]);
    });

    it('event bubbles and is composed', () => {
      let eventDetails;
      searchEngine.addEventListener('updated', (e) => {
        eventDetails = { bubbles: e.bubbles, composed: e.composed };
      });

      searchEngine.updateList();

      expect(eventDetails.bubbles).to.be.true;
      expect(eventDetails.composed).to.be.true;
    });
  });

  describe('getSearchScope', () => {
    it('returns startPath for non-site folder (depth > 3)', async () => {
      const startPath = '/myorg/mysite/folder1/folder2';
      const result = await searchEngine.getSearchScope(startPath);

      expect(result.paths).to.deep.equal([startPath]);
      expect(result.files).to.deep.equal([]);
      expect(fetchStub.called).to.be.false;
    });

    it('returns startPath for non-site folder (depth < 3)', async () => {
      const startPath = '/myorg';
      const result = await searchEngine.getSearchScope(startPath);

      expect(result.paths).to.deep.equal([startPath]);
      expect(result.files).to.deep.equal([]);
      expect(fetchStub.called).to.be.false;
    });

    it('returns startPath when translate.json fetch fails', async () => {
      const startPath = '/myorg/mysite';
      fetchStub.resolves({ ok: false });

      const result = await searchEngine.getSearchScope(startPath);

      expect(result.paths).to.deep.equal([startPath]);
      expect(result.files).to.deep.equal([]);
      expect(fetchStub.calledOnce).to.be.true;
      expect(fetchStub.firstCall.args[0]).to.include('/source/myorg/mysite/.da/translate.json');
    });

    it('returns startPath when no locales are configured', async () => {
      const startPath = '/myorg/mysite';
      fetchStub.resolves({
        ok: true,
        json: async () => ({}),
      });

      const result = await searchEngine.getSearchScope(startPath);

      expect(result.paths).to.deep.equal([startPath]);
      expect(result.files).to.deep.equal([]);
    });

    it('returns startPath when browseItems is empty', async () => {
      const startPath = '/myorg/mysite';
      fetchStub.resolves({
        ok: true,
        json: async () => ({
          languages: {
            data: [
              { locales: 'en, fr' },
            ],
          },
        }),
      });
      searchEngine.browseItems = [];

      const result = await searchEngine.getSearchScope(startPath);

      expect(result.paths).to.deep.equal([startPath]);
      expect(result.files).to.deep.equal([]);
    });

    it('filters out locale folders from paths', async () => {
      const startPath = '/myorg/mysite';
      fetchStub.resolves({
        ok: true,
        json: async () => ({
          languages: {
            data: [
              { locales: 'en, fr, de' },
            ],
          },
        }),
      });
      searchEngine.browseItems = [
        { name: 'en', path: '/myorg/mysite/en' },
        { name: 'fr', path: '/myorg/mysite/fr' },
        { name: 'docs', path: '/myorg/mysite/docs' },
        { name: 'assets', path: '/myorg/mysite/assets' },
      ];

      const result = await searchEngine.getSearchScope(startPath);

      expect(result.paths).to.deep.equal([
        '/myorg/mysite/docs',
        '/myorg/mysite/assets',
      ]);
      expect(result.files).to.deep.equal([]);
    });

    it('filters out locale folders with leading slash', async () => {
      const startPath = '/myorg/mysite';
      fetchStub.resolves({
        ok: true,
        json: async () => ({
          languages: {
            data: [
              { locales: '/en, /fr' },
            ],
          },
        }),
      });
      searchEngine.browseItems = [
        { name: 'en', path: '/myorg/mysite/en' },
        { name: 'fr', path: '/myorg/mysite/fr' },
        { name: 'content', path: '/myorg/mysite/content' },
      ];

      const result = await searchEngine.getSearchScope(startPath);

      expect(result.paths).to.deep.equal(['/myorg/mysite/content']);
      expect(result.files).to.deep.equal([]);
    });

    it('filters out langstore folder by default', async () => {
      const startPath = '/myorg/mysite';
      fetchStub.resolves({
        ok: true,
        json: async () => ({
          languages: {
            data: [
              { locales: 'en' },
            ],
          },
        }),
      });
      searchEngine.browseItems = [
        { name: 'langstore', path: '/myorg/mysite/langstore' },
        { name: 'en', path: '/myorg/mysite/en' },
        { name: 'content', path: '/myorg/mysite/content' },
      ];

      const result = await searchEngine.getSearchScope(startPath);

      expect(result.paths).to.deep.equal(['/myorg/mysite/content']);
      expect(result.files).to.deep.equal([]);
    });

    it('separates files from paths', async () => {
      const startPath = '/myorg/mysite';
      fetchStub.resolves({
        ok: true,
        json: async () => ({
          languages: {
            data: [
              { locales: 'en' },
            ],
          },
        }),
      });
      const file1 = { name: 'doc1', path: '/myorg/mysite/doc1.html', ext: 'html' };
      const file2 = { name: 'readme', path: '/myorg/mysite/readme.md', ext: 'md' };
      searchEngine.browseItems = [
        { name: 'en', path: '/myorg/mysite/en' },
        file1,
        { name: 'content', path: '/myorg/mysite/content' },
        file2,
      ];

      const result = await searchEngine.getSearchScope(startPath);

      expect(result.paths).to.deep.equal(['/myorg/mysite/content']);
      expect(result.files).to.deep.equal([file1, file2]);
    });

    it('handles multiple languages with comma-separated locales', async () => {
      const startPath = '/myorg/mysite';
      fetchStub.resolves({
        ok: true,
        json: async () => ({
          languages: {
            data: [
              { locales: 'en, fr' },
              { locales: 'de, es, it' },
            ],
          },
        }),
      });
      searchEngine.browseItems = [
        { name: 'en', path: '/myorg/mysite/en' },
        { name: 'fr', path: '/myorg/mysite/fr' },
        { name: 'de', path: '/myorg/mysite/de' },
        { name: 'es', path: '/myorg/mysite/es' },
        { name: 'it', path: '/myorg/mysite/it' },
        { name: 'content', path: '/myorg/mysite/content' },
      ];

      const result = await searchEngine.getSearchScope(startPath);

      expect(result.paths).to.deep.equal(['/myorg/mysite/content']);
      expect(result.files).to.deep.equal([]);
    });

    it('handles locales with extra whitespace', async () => {
      const startPath = '/myorg/mysite';
      fetchStub.resolves({
        ok: true,
        json: async () => ({
          languages: {
            data: [
              { locales: '  en  ,   fr   ' },
            ],
          },
        }),
      });
      searchEngine.browseItems = [
        { name: 'en', path: '/myorg/mysite/en' },
        { name: 'fr', path: '/myorg/mysite/fr' },
        { name: 'content', path: '/myorg/mysite/content' },
      ];

      const result = await searchEngine.getSearchScope(startPath);

      expect(result.paths).to.deep.equal(['/myorg/mysite/content']);
      expect(result.files).to.deep.equal([]);
    });

    it('handles undefined languages data', async () => {
      const startPath = '/myorg/mysite';
      fetchStub.resolves({
        ok: true,
        json: async () => ({ languages: { data: undefined } }),
      });
      searchEngine.browseItems = [
        { name: 'content', path: '/myorg/mysite/content' },
      ];

      const result = await searchEngine.getSearchScope(startPath);

      // When languages.data is undefined, locales will only have DEFAULT_LOCALES (langstore)
      // Since 'content' is not in DEFAULT_LOCALES, it should be included in paths
      expect(result.paths).to.deep.equal(['/myorg/mysite/content']);
      expect(result.files).to.deep.equal([]);
    });

    it('handles missing locales property', async () => {
      const startPath = '/myorg/mysite';
      fetchStub.resolves({
        ok: true,
        json: async () => ({
          languages: {
            data: [
              { name: 'English' },
            ],
          },
        }),
      });
      searchEngine.browseItems = [
        { name: 'content', path: '/myorg/mysite/content' },
      ];

      const result = await searchEngine.getSearchScope(startPath);

      // When locales property is missing, only DEFAULT_LOCALES is used
      // Since 'content' is not in DEFAULT_LOCALES, it should be included in paths
      expect(result.paths).to.deep.equal(['/myorg/mysite/content']);
      expect(result.files).to.deep.equal([]);
    });
  });

  describe('browseItems property', () => {
    it('accepts and stores browseItems property', () => {
      const items = [
        { name: 'folder1', path: '/org/site/folder1' },
        { name: 'file1', path: '/org/site/file1.html', ext: 'html' },
      ];
      searchEngine.browseItems = items;

      expect(searchEngine.browseItems).to.equal(items);
    });

    it('defaults to undefined if not set', () => {
      expect(searchEngine.browseItems).to.be.undefined;
    });
  });

  describe('timeoutWrapper', () => {
    it('resolves with result when promise completes before timeout', async () => {
      const fn = async () => ({ success: true });
      const result = await searchEngine.timeoutWrapper(fn, 1000);

      expect(result).to.deep.equal({ success: true });
    });

    it('resolves with timeout error when promise exceeds timeout', async () => {
      const fn = async () => {
        await new Promise((resolve) => { setTimeout(resolve, 200); });
        return { success: true };
      };
      const result = await searchEngine.timeoutWrapper(fn, 50);

      expect(result).to.deep.equal({ error: 'timeout' });
    });

    it('resolves with bad result error when promise rejects', async () => {
      const fn = async () => {
        throw new Error('test error');
      };
      const result = await searchEngine.timeoutWrapper(fn, 1000);

      expect(result).to.deep.equal({ error: 'bad result' });
    });

    it('uses default timeout of 30000ms', async () => {
      const fn = async () => ({ success: true });
      const result = await searchEngine.timeoutWrapper(fn);

      expect(result).to.deep.equal({ success: true });
    });

    it('clears timeout when promise completes', async () => {
      const clearTimeoutSpy = spy(window, 'clearTimeout');
      const fn = async () => ({ success: true });

      await searchEngine.timeoutWrapper(fn, 1000);

      expect(clearTimeoutSpy.called).to.be.true;
      clearTimeoutSpy.restore();
    });
  });

  describe('search', () => {
    beforeEach(() => {
      searchEngine.fullpath = '/org/site/folder';
      stub(searchEngine, 'getMatches').resolves();
    });

    it('sets term', async () => {
      await searchEngine.search('/org/site/folder', 'my search');

      expect(searchEngine._term).to.equal('my search');
    });

    it('calls getMatches with path and term', async () => {
      await searchEngine.search('/org/site/folder', 'test');

      expect(searchEngine.getMatches.calledOnce).to.be.true;
      expect(searchEngine.getMatches.firstCall.args).to.deep.equal(['/org/site/folder', 'test']);
    });

    it('measures and sets search time', async () => {
      await searchEngine.search('/org/site/folder', 'test');

      expect(searchEngine._time).to.be.a('string');
      expect(parseFloat(searchEngine._time)).to.be.a('number');
    });

    it('truncates time to 4 characters', async () => {
      await searchEngine.search('/org/site/folder', 'test');

      expect(searchEngine._time.length).to.be.at.most(4);
    });
  });

  describe('case-aware replacement', () => {
    beforeEach(() => {
      searchEngine._term = 'old';
      searchEngine._matches = 1;
      searchEngine._items = [{ path: '/org/site/file.html', ext: 'html' }];
    });

    function mockSource(text, writes) {
      fetchStub.callsFake(async (href, opts) => {
        if (opts?.body) {
          const blob = opts.body instanceof Blob
            ? opts.body : [...opts.body.values()].find((value) => value instanceof Blob);
          writes.push({ href, blob });
          return new Response('', { status: 200 });
        }
        return new Response(text, { status: 200 });
      });
    }

    it('replaces literal case-insensitive matches and preserves replacement dollar characters', async () => {
      searchEngine._term = 'a.b';
      searchEngine.caseSensitive = false;
      const writes = [];
      mockSource('A.B a.b axb', writes);
      const result = await searchEngine.replaceMatches({ replacement: '$&' });
      expect(result).to.deep.equal({ replaced: 1, skipped: 0, errors: [] });
      expect(writes).to.have.length(1);
      expect(await writes[0].blob.text()).to.equal('$& $& axb');
      expect(writes[0].blob.type).to.equal('text/html');
    });

    it('respects match case and supports deliberately empty replacements', async () => {
      const writes = [];
      mockSource('OLD old', writes);
      const result = await searchEngine.replaceMatches({ replacement: '' });
      expect(result.replaced).to.equal(1);
      expect(await writes[0].blob.text()).to.equal('OLD ');
    });

    it('skips filename-only matches without saving unchanged content', async () => {
      const writes = [];
      mockSource('unrelated content', writes);
      const result = await searchEngine.replaceMatches({ replacement: 'new' });
      expect(result).to.deep.equal({ replaced: 0, skipped: 1, errors: [] });
      expect(writes).to.have.length(0);
    });

    it('preserves JSON and SVG source types', async () => {
      searchEngine._items = [
        { path: '/org/site/file.json', ext: 'json' },
        { path: '/org/site/file.svg', ext: 'svg' },
      ];
      searchEngine._matches = 2;
      const writes = [];
      mockSource('old', writes);
      const result = await searchEngine.replaceMatches({ replacement: 'new' });
      expect(result.replaced).to.equal(2);
      expect(writes.map(({ blob }) => blob.type))
        .to.have.members(['application/json', 'image/svg+xml']);
      expect(await Promise.all(writes.map(({ blob }) => blob.text()))).to.deep.equal(['new', 'new']);
    });

    it('reports read and save failures and never saves an unreadable file', async () => {
      searchEngine._items = [
        { path: '/org/site/denied.html', ext: 'html' },
        { path: '/org/site/failing.html', ext: 'html' },
      ];
      searchEngine._matches = 2;
      const writes = [];
      fetchStub.callsFake(async (href, opts) => {
        if (opts?.body) {
          writes.push(href);
          return new Response('', { status: 500 });
        }
        return new Response('old', { status: href.includes('denied') ? 403 : 200 });
      });
      const result = await searchEngine.replaceMatches({ replacement: 'new' });
      expect(result.replaced).to.equal(0);
      expect(result.errors.map(({ error }) => error))
        .to.have.members(['Could not read file (403).', 'Could not save file (500).']);
      expect(writes).to.have.length(1);
      expect(writes[0]).to.contain('failing.html');
    });

    it('does not save when the search is cancelled while source is being read', async () => {
      let finish;
      let start;
      const started = new Promise((resolve) => { start = resolve; });
      const writes = [];
      fetchStub.callsFake(async (href, opts) => {
        if (opts?.body) {
          writes.push(href);
          return new Response('', { status: 200 });
        }
        return new Promise((resolve) => {
          finish = resolve;
          start();
        });
      });
      const pending = searchEngine.replaceMatches({ replacement: 'new' });
      await started;
      searchEngine.cancelSearch();
      finish(new Response('old', { status: 200 }));
      expect(await pending).to.deep.equal({ cancelled: true });
      expect(writes).to.have.length(0);
    });
  });

  describe('integration scenarios', () => {
    it('complete search flow updates state correctly', async () => {
      searchEngine.fullpath = '/org/site';
      stub(searchEngine, 'getMatches').callsFake(async () => {
        searchEngine._total = 10;
        searchEngine._matches = 3;
        searchEngine._items = [
          { path: '/org/site/a.html' },
          { path: '/org/site/b.html' },
          { path: '/org/site/c.html' },
        ];
      });

      await searchEngine.search('/org/site', 'test');

      expect(searchEngine._term).to.equal('test');

      expect(searchEngine._total).to.equal(10);
      expect(searchEngine._matches).to.equal(3);
      expect(searchEngine._items.length).to.equal(3);
      expect(searchEngine._time).to.be.a('string');
    });

    it('handles search with no matches', async () => {
      stub(searchEngine, 'getMatches').callsFake(async () => {
        searchEngine._total = 10;
        searchEngine._matches = 0;
        searchEngine._items = [];
      });

      await searchEngine.search('/org/site', 'nonexistent');

      expect(searchEngine._matches).to.equal(0);
      expect(searchEngine._items).to.deep.equal([]);
      expect(searchEngine._total).to.equal(10);
    });
  });
});
