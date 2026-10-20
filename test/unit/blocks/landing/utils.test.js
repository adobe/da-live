import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-nx.js';
import { getHomeHref } from '../../../../scripts/utils.js';
import { getBrowseItemHref } from '../../../../blocks/browse/v2/shared/navigation.js';
import {
  getSiteOptions, getBrowseHref, getFileHref, loadFiles, getLandingIconHref, formatModified,
  fetchFileModifier, loadMyOpenComments, isCommentAuthor,
} from '../../../../blocks/landing/utils.js';

const HREF = 'https://lp--da-live--adobe.aem.live/?landing=true&nx=devlive&quick-edit=devlive&theme=light#/org/site';

describe('landing page data and navigation', () => {
  it('reads the real modifier from source metadata instead of inventing a user', async () => {
    const getMetadata = sinon.stub().resolves(new Response(null, { headers: { 'x-last-modified-by': 'alex@example.test' } }));
    expect(await fetchFileModifier({ path: '/org/site/index.html', source: { getMetadata } }))
      .to.deep.equal({ name: 'alex' });
    expect(getMetadata.calledOnceWithExactly('/org/site/index.html')).to.equal(true);
  });

  it('identifies missing and unreadable modifier metadata explicitly', async () => {
    const source = { getMetadata: sinon.stub() };
    source.getMetadata.onFirstCall().resolves(new Response(null, { status: 403 }));
    source.getMetadata.onSecondCall().resolves(new Response());
    expect((await fetchFileModifier({ path: '/org/site/a.html', source })).error).to.include('403');
    expect((await fetchFileModifier({ path: '/org/site/b.html', source })).error)
      .to.equal('The source did not provide a modifier.');
  });

  it('uses the design’s semantic icons without changing shared file mappings', () => {
    expect(getLandingIconHref({ ext: 'html' })).to.include('/landing/page.svg');
    expect(getLandingIconHref({ ext: 'json' })).to.include('/landing/sheet.svg');
    expect(getLandingIconHref({ ext: 'jpg' })).to.include('/landing/image.svg');
    expect(getLandingIconHref({ ext: 'html', type: 'content-fragment' })).to.include('/landing/fragment.svg');
    expect(getLandingIconHref({})).to.include('folder');
  });

  it('formats local calendar dates as Today, Yesterday or a short date', () => {
    const now = new Date(2026, 9, 19, 12);
    expect(formatModified({ modified: new Date(2026, 9, 19, 8).getTime(), now }).label).to.equal('Today');
    expect(formatModified({ modified: new Date(2026, 9, 18, 23).getTime(), now }).label).to.equal('Yesterday');
    expect(formatModified({ modified: new Date(2025, 8, 14).getTime(), now }).label).to.include('2025');
    expect(formatModified({ modified: 'invalid', now })).to.equal(undefined);
    expect(formatModified({ modified: undefined, now })).to.equal(undefined);
  });

  it('keeps the current site and deduplicates valid recent sites', () => {
    expect(getSiteOptions({
      current: 'org/site',
      recentSites: ['other/site', 'org/site', null, '../bad', 'org/.hidden', 'https://example.com'],
    }).map(({ value }) => value)).to.deep.equal(['org/site', 'other/site']);
  });

  it('exits the landing page into browse v2 without losing preview branches', () => {
    const url = new URL(getBrowseHref({ path: '/org/site/folder', href: HREF }));
    expect(url.searchParams.get('landing')).to.equal('home');
    expect(url.searchParams.get('browse')).to.equal('2');
    expect(url.searchParams.get('nx')).to.equal('devlive');
    expect(url.searchParams.get('quick-edit')).to.equal('devlive');
    expect(url.searchParams.get('theme')).to.equal('light');
    expect(url.hash).to.equal('#/org/site/folder');
  });

  it('clears the hash when browsing all sites', () => {
    expect(new URL(getBrowseHref({ href: HREF })).hash).to.equal('');
  });

  [
    ['html', '/canvas', '#/org/site/page'],
    ['json', '/sheet', '#/org/site/page'],
    ['png', '/media', '#/org/site/page.png'],
  ].forEach(([ext, pathname, hash]) => {
    it(`opens ${ext} files in the right editor and preserves branch parameters`, () => {
      const url = new URL(getFileHref({
        item: { path: `/org/site/page.${ext}`, ext },
        href: HREF,
      }));
      expect(url.pathname).to.equal(pathname);
      expect(url.hash).to.equal(hash);
      expect(url.searchParams.get('nx')).to.equal('devlive');
      expect(url.searchParams.get('quick-edit')).to.equal('devlive');
      expect(url.searchParams.get('landing')).to.equal('home');
      expect(url.searchParams.get('theme')).to.equal('light');
      const homeUrl = new URL(getHomeHref({ href: url.href }));
      expect(homeUrl.pathname).to.equal('/');
      expect(homeUrl.searchParams.get('landing')).to.equal('true');
      expect(homeUrl.searchParams.get('theme')).to.equal('light');
      expect(homeUrl.hash).to.equal('#/org/site');
    });
  });

  it('opens folders and link files in browse instead of pretending to edit them', () => {
    const folder = getFileHref({ item: { path: '/org/site/folder' }, href: HREF });
    const link = getFileHref({ item: { path: '/org/site/folder/a.link', ext: 'link' }, href: HREF });
    expect(new URL(folder).hash).to.equal('#/org/site/folder');
    expect(link).to.equal(folder);
  });

  it('does not introduce a theme override when the user has not selected one', () => {
    const href = new URL(HREF);
    href.searchParams.delete('theme');
    const url = new URL(getFileHref({ item: { path: '/org/site/page.html', ext: 'html' }, href: href.href }));
    expect(url.searchParams.has('theme')).to.equal(false);
    expect(new URL(getHomeHref({ href: url.href })).searchParams.has('theme')).to.equal(false);
  });

  it('supports the classic editor when EW is unavailable', () => {
    expect(new URL(getFileHref({ item: { path: '/org/site/page.html', ext: 'html' }, href: HREF, editor: '/edit#' })).pathname).to.equal('/edit');
  });

  it('retains the landing Home choice when opening an editor from Browse', () => {
    const { href } = window.location;
    try {
      const browseUrl = new URL(href);
      browseUrl.search = '?landing=home&nx=lp&quick-edit=devlive&browse=2&theme=light';
      window.history.replaceState(null, '', browseUrl);
      const url = new URL(getBrowseItemHref({ path: '/org/site/page.html', ext: 'html', editor: '/canvas#' }));
      expect(url.pathname).to.equal('/canvas');
      expect(url.searchParams.get('landing')).to.equal('home');
      expect(url.searchParams.get('nx')).to.equal('lp');
      expect(url.searchParams.get('quick-edit')).to.equal('devlive');
      expect(url.searchParams.get('theme')).to.equal('light');
      expect(new URL(getHomeHref({ href: url.href })).searchParams.get('theme')).to.equal('light');
      expect(url.hash).to.equal('#/org/site/page');
      expect(getBrowseItemHref({ path: '/org/site/folder' })).to.equal('#/org/site/folder');
      window.history.replaceState(null, '', '?nx=lp');
      expect(getBrowseItemHref({ path: '/org/site/page.html', ext: 'html', editor: '/canvas#' }))
        .to.equal('/canvas?nx=lp#/org/site/page');
    } finally {
      window.history.replaceState(null, '', href);
    }
  });

  it('does not pass landing or preview parameters to external editors', () => {
    const { href } = window.location;
    try {
      window.history.replaceState(null, '', '?landing=home&nx=lp&theme=light');
      const destination = getBrowseItemHref({ path: '/org/site/page.html', ext: 'html', editor: 'https://experience.adobe.com/editor' });
      expect(destination).to.equal('https://experience.adobe.com/editor/page');
    } finally {
      window.history.replaceState(null, '', href);
    }
  });

  it('loads all root pages, deduplicates, hides system entries and sorts newest first', async () => {
    const older = { path: '/org/site/a.html', name: 'a', ext: 'html', lastModified: 10 };
    const newer = { path: '/org/site/b.html', name: 'b', ext: 'html', lastModified: 20 };
    const list = sinon.stub();
    list.onFirstCall().resolves({ ok: true, items: [older, { path: '/org/site/.da', name: '.da' }], continuationToken: 'next' });
    list.onSecondCall().resolves({ ok: true, items: [older, newer] });
    const files = await loadFiles({ path: '/org/site', source: { list }, signal: new AbortController().signal });
    expect(files).to.deep.equal([newer, older]);
    expect(list.secondCall.args).to.deep.equal(['/org/site', { continuationToken: 'next' }]);
  });

  it('surfaces listing failures instead of rendering an empty success state', async () => {
    try {
      await loadFiles({
        path: '/org/site',
        source: { list: async () => ({ ok: false }) },
        signal: new AbortController().signal,
      });
      expect.fail('Expected listing to fail');
    } catch (error) {
      expect(error.message).to.include('site permissions');
    }
  });

  it('stops if the server repeats a continuation token', async () => {
    const list = sinon.stub().resolves({ ok: true, items: [], continuationToken: 'same' });
    try {
      await loadFiles({ path: '/org/site', source: { list }, signal: new AbortController().signal });
      expect.fail('Expected pagination to fail');
    } catch (error) {
      expect(error.message).to.include('did not complete');
      expect(list.callCount).to.equal(2);
    }
  });

  it('does not start a request that has already been superseded', async () => {
    const controller = new AbortController();
    controller.abort();
    const list = sinon.stub();
    try {
      await loadFiles({ path: '/org/site', source: { list }, signal: controller.signal });
      expect.fail('Expected cancellation');
    } catch (error) {
      expect(error.name).to.equal('AbortError');
      expect(list.called).to.equal(false);
    }
  });
});

describe('landing page open comments', () => {
  const ME = { email: 'me@example.test', userId: 'ME1' };
  const ALEX = { id: 'A1', name: 'Alex', email: 'alex@example.test' };
  const MINE = { id: 'ME1', name: 'Me', email: 'me@example.test' };
  const FILES = [
    { name: 'index', path: '/org/site/index.html', ext: 'html' },
    { name: 'about', path: '/org/site/about.html', ext: 'html' },
    { name: 'data', path: '/org/site/data.json', ext: 'json' },
    { name: 'blog', path: '/org/site/blog' },
  ];
  const DOC_IDS = { '/org/site/index.html': 'doc-index', '/org/site/about.html': 'doc-about' };
  const COMMENTS = {
    'doc-index': [
      {
        id: 'mine-open', threadId: null, author: MINE, body: 'Fix hero', createdAt: 10, resolved: false,
      },
      {
        id: 'mine-done', threadId: null, author: MINE, body: 'Done already', createdAt: 20, resolved: true,
      },
      {
        id: 'alex-open', threadId: null, author: ALEX, body: 'Not mine', createdAt: 30, resolved: false,
      },
    ],
    'doc-about': [
      {
        id: 'joined', threadId: null, author: ALEX, body: 'Check teaser', createdAt: 40, resolved: false,
      },
      { id: 'reply', threadId: 'joined', author: { ...MINE, email: 'ME@example.test' }, body: 'On it', createdAt: 50 },
    ],
  };

  const setup = ({ commentDocs = ['doc-index', 'doc-about'], listOk = true } = {}) => {
    const getMetadata = sinon.stub().callsFake(async (path) => new Response(null, { headers: DOC_IDS[path] ? { 'x-da-id': DOC_IDS[path] } : {} }));
    const fetchCommentDocs = sinon.stub().resolves(listOk
      ? new Response(JSON.stringify(commentDocs.map((name) => ({ name }))))
      : new Response(null, { status: 404 }));
    const createStore = sinon.stub().callsFake(({ docId }) => {
      const map = new Map((COMMENTS[docId] || []).map((c) => [c.id, c]));
      return { load: async () => {}, forEach: (fn) => map.forEach((v, k) => fn(v, k)) };
    });
    return { source: { getMetadata }, fetchCommentDocs, createStore };
  };

  it('matches authors by email (case-insensitively) or IMS user id', () => {
    expect(isCommentAuthor({ email: 'ME@example.test' }, ME)).to.equal(true);
    expect(isCommentAuthor({ id: 'ME1' }, ME)).to.equal(true);
    expect(isCommentAuthor(ALEX, ME)).to.equal(false);
    expect(isCommentAuthor(undefined, ME)).to.equal(false);
    expect(isCommentAuthor({ id: '' }, { userId: '' })).to.equal(false);
  });

  it('lists unresolved threads the user started or replied to, latest activity first', async () => {
    const deps = setup();
    const threads = await loadMyOpenComments({
      org: 'org', site: 'site', files: FILES, user: ME, signal: new AbortController().signal, ...deps,
    });
    expect(threads.map((t) => t.id)).to.deep.equal(['joined', 'mine-open']);
    expect(threads[0]).to.include({ body: 'Check teaser', updatedAt: 50, replyCount: 1 });
    expect(threads[0].file.path).to.equal('/org/site/about.html');
    expect(threads[0].author.name).to.equal('Alex');
    expect(deps.fetchCommentDocs.calledOnceWithExactly('org', 'site')).to.equal(true);
    expect(deps.createStore.args.map(([a]) => a)).to.deep.equal([
      { docId: 'doc-index', owner: 'org', repo: 'site' },
      { docId: 'doc-about', owner: 'org', repo: 'site' },
    ]);
  });

  it('only probes pages and stops once every commented document is found', async () => {
    const deps = setup({ commentDocs: ['doc-index'] });
    await loadMyOpenComments({
      org: 'org', site: 'site', files: FILES, user: ME, signal: new AbortController().signal, concurrency: 1, ...deps,
    });
    expect(deps.source.getMetadata.args.map(([p]) => p)).to.deep.equal(['/org/site/index.html']);
  });

  it('skips page lookups when the site has no comments', async () => {
    const deps = setup({ listOk: false });
    const threads = await loadMyOpenComments({
      org: 'org', site: 'site', files: FILES, user: ME, signal: new AbortController().signal, ...deps,
    });
    expect(threads).to.deep.equal([]);
    expect(deps.source.getMetadata.called).to.equal(false);
  });

  it('surfaces comment listing failures other than a missing folder', async () => {
    const deps = setup();
    deps.fetchCommentDocs.resolves(new Response(null, { status: 403 }));
    try {
      await loadMyOpenComments({
        org: 'org', site: 'site', files: FILES, user: ME, signal: new AbortController().signal, ...deps,
      });
      expect.fail('Expected comments to fail');
    } catch (error) {
      expect(error.message).to.include('403');
    }
  });

  it('does not start when the request was superseded', async () => {
    const deps = setup();
    const controller = new AbortController();
    controller.abort();
    try {
      await loadMyOpenComments({
        org: 'org', site: 'site', files: FILES, user: ME, signal: controller.signal, ...deps,
      });
      expect.fail('Expected cancellation');
    } catch (error) {
      expect(error.name).to.equal('AbortError');
      expect(deps.fetchCommentDocs.called).to.equal(false);
    }
  });
});
