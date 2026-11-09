import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-nx.js';
import { getBrowseHref, getFileHref, getListItems, loadFilesByPath } from '../../../../blocks/landing/utils.js';
import { getNx2Api } from '../../../../scripts/utils.js';

const { source } = await getNx2Api();
const HREF = 'https://fileitem--da-live--adobe.aem.live/?landing=true&nx=main&nxver=2&quick-edit=test&theme=light&rum=on#/org/site';

describe('Content data and destinations on main', () => {
  [
    ['html', '/canvas', '#/org/site/page'],
    ['json', '/sheet', '#/org/site/page'],
    ['png', '/media', '#/org/site/page.png'],
  ].forEach(([ext, pathname, hash]) => {
    it(`preserves ${ext} editor selection and preview parameters`, () => {
      const url = new URL(getFileHref({ item: { path: `/org/site/page.${ext}`, ext }, editor: '/canvas#', href: HREF }));
      expect(url.pathname).to.equal(pathname);
      expect(url.hash).to.equal(hash);
      expect(url.searchParams.get('nx')).to.equal('main');
      expect(url.searchParams.get('nxver')).to.equal('2');
      expect(url.searchParams.get('quick-edit')).to.equal('test');
      expect(url.searchParams.get('theme')).to.equal('light');
      expect(url.searchParams.get('rum')).to.equal('on');
      expect(url.searchParams.get('landing')).to.equal('home');
    });
  });

  it('opens folders in Browse', () => {
    const folder = getFileHref({ item: { path: '/org/site/folder' }, href: HREF });
    expect(new URL(folder).hash).to.equal('#/org/site/folder');
    expect(new URL(folder).searchParams.get('browse')).to.equal('2');
    expect(new URL(getBrowseHref({ href: HREF })).hash).to.equal('');
  });

  it('resolves link files to their saved destination using shared navigation', async () => {
    const path = '/org/site/folder/a.link';
    const externalUrl = 'https://example.com/destination?view=full#section';
    const get = sinon.stub(source, 'get').resolves({ ok: true, json: async () => ({ externalUrl }) });
    try {
      expect(await getFileHref({ item: { path, ext: 'link' }, href: HREF })).to.equal(externalUrl);
      expect(get.calledOnceWithExactly(path)).to.equal(true);
    } finally {
      get.restore();
    }
  });

  it('does not send preview parameters to external editors or invent a theme override', () => {
    expect(getFileHref({ item: { path: '/org/site/page.html', ext: 'html' }, href: HREF, editor: 'https://experience.adobe.com/editor' }))
      .to.equal('https://experience.adobe.com/editor/page');
    const url = new URL(getFileHref({ item: { path: '/org/site/page.html', ext: 'html' }, href: HREF.replace('&theme=light', '') }));
    expect(url.pathname).to.equal('/edit');
    expect(url.searchParams.has('theme')).to.equal(false);
  });

  it('adapts controlled list items without mutating files or changing their order', () => {
    const files = [
      { path: '/org/site/nested/a.html', name: 'a', ext: 'html' },
      { path: '/org/site/b.png', name: 'b', ext: 'png' },
    ];
    const items = getListItems({ files, favorites: new Set([files[1].path]), editor: '/canvas#' });
    expect(items.map((item) => item.path)).to.deep.equal(files.map((item) => item.path));
    expect(new URL(items[0].href).pathname).to.equal('/canvas');
    expect(new URL(items[0].folderHref).hash).to.equal('#/org/site/nested');
    expect(new URL(items[0].folderHref).searchParams.get('landing')).to.equal('home');
    expect(items.map((item) => item.isFavorited)).to.deep.equal([false, true]);
    expect(files[0]).not.to.have.property('href');
    expect(files[1]).not.to.have.property('isFavorited');
  });

  it('identifies same-named favorites and destinations by full path, not modification date', () => {
    const files = [
      { path: '/org/site/coffee.html', name: 'coffee', ext: 'html', lastModified: 1 },
      { path: '/org/site/de/coffee.html', name: 'coffee', ext: 'html', lastModified: 2 },
    ];
    const favorites = new Set([files[1].path]);
    for (const dates of [[1, 2], [20, 10]]) {
      const items = getListItems({
        files: files.map((item, index) => ({ ...item, lastModified: dates[index] })),
        favorites,
        editor: '/canvas#',
      });
      expect(items.map((item) => item.isFavorited)).to.deep.equal([false, true]);
      expect(items.map((item) => new URL(item.href).hash))
        .to.deep.equal(['#/org/site/coffee', '#/org/site/de/coffee']);
    }
  });

  it('uses the longest matching configured editor per file and the default otherwise', () => {
    const items = getListItems({
      files: [
        { path: '/org/site/forms/a.html', ext: 'html' },
        { path: '/org/site/forms/ue/b.html', ext: 'html' },
        { path: '/org/site/page.html', ext: 'html' },
        { path: '/org/site/forms/data.json', ext: 'json' },
        { path: '/org/site/forms/image.png', ext: 'png' },
      ],
      editor: '/canvas#',
      editorConfs: [
        '/org/site/forms=https://da.live/form#',
        '/org/site/forms/ue=https://experience.adobe.com/editor',
      ],
    });

    expect(items[0].href).to.equal('https://da.live/form#/org/site/forms/a');
    expect(items[1].href).to.equal('https://experience.adobe.com/editor/forms/ue/b');
    expect(new URL(items[2].href).pathname).to.equal('/canvas');
    expect(new URL(items[3].href).pathname).to.equal('/sheet');
    expect(new URL(items[4].href).pathname).to.equal('/media');
  });

  it('loads saved files directly and keeps folder bookmarks without metadata', async () => {
    const date = 'Mon, 09 Nov 2026 12:00:00 GMT';
    const paths = [
      '/org/site/de/coffee.special.html',
      '/org/site/missing.html',
      '/org/site/products.json',
      '/org/site/docs',
    ];
    const getMetadata = sinon.stub().callsFake(async (path) => {
      if (path === paths[1]) return new Response(null, { status: 404 });
      return new Response(null, { headers: path === paths[0] ? { 'last-modified': date } : {} });
    });
    const { signal } = new AbortController();
    expect(await loadFilesByPath({ paths, source: { getMetadata }, signal })).to.deep.equal([
      { path: paths[0], name: 'coffee.special', ext: 'html', lastModified: Date.parse(date) },
      { path: paths[2], name: 'products', ext: 'json', lastModified: undefined },
      { path: paths[3], name: 'docs', ext: undefined },
    ]);
    expect(getMetadata.getCalls().map(({ args }) => args))
      .to.deep.equal(paths.slice(0, 3).map((path) => [path]));
  });

  it('keeps permission and server errors retryable instead of showing an empty result', async () => {
    for (const status of [403, 500]) {
      try {
        await loadFilesByPath({
          paths: ['/org/site/a.html'],
          source: { getMetadata: async () => new Response(null, { status }) },
          signal: new AbortController().signal,
        });
        expect.fail('Expected metadata failure');
      } catch (error) {
        expect(error.message).to.include('site permissions');
      }
    }
  });

  it('bounds active lookups and stops queued work when cancelled', async () => {
    const request = new AbortController();
    const finishes = [];
    const getMetadata = sinon.stub().callsFake(() => new Promise((resolve) => {
      finishes.push(resolve);
    }));
    const paths = Array.from({ length: 8 }, (_, index) => `/org/site/${index}.html`);
    const pending = loadFilesByPath({ paths, source: { getMetadata }, signal: request.signal });
    expect(getMetadata.callCount).to.equal(4);
    request.abort();
    finishes.reverse().forEach((finish) => finish(new Response(null)));
    try {
      await pending;
      expect.fail('Expected cancellation');
    } catch (error) {
      expect(error.name).to.equal('AbortError');
    }
    expect(getMetadata.callCount).to.equal(4);
  });

  it('does not start an already cancelled request', async () => {
    const request = new AbortController();
    request.abort();
    const getMetadata = sinon.spy();
    try {
      await loadFilesByPath({ paths: ['/org/site/a.html'], source: { getMetadata }, signal: request.signal });
      expect.fail('Expected cancellation');
    } catch (error) {
      expect(error.name).to.equal('AbortError');
    }
    expect(getMetadata.called).to.equal(false);
  });
});
