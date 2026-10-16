import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-nx.js';
import { getSiteOptions, getBrowseHref, getFileHref, loadFiles } from '../../../../blocks/landing/utils.js';

const HREF = 'https://lp--da-live--adobe.aem.live/?landing=true&nx=devlive&quick-edit=devlive#/org/site';

describe('landing page data and navigation', () => {
  it('keeps the current site and deduplicates valid recent sites', () => {
    expect(getSiteOptions({
      current: 'org/site',
      recentSites: ['other/site', 'org/site', null, '../bad', 'org/.hidden', 'https://example.com'],
    }).map(({ value }) => value)).to.deep.equal(['org/site', 'other/site']);
  });

  it('exits the landing page into browse v2 without losing preview branches', () => {
    const url = new URL(getBrowseHref({ path: '/org/site/folder', href: HREF }));
    expect(url.searchParams.has('landing')).to.equal(false);
    expect(url.searchParams.get('browse')).to.equal('2');
    expect(url.searchParams.get('nx')).to.equal('devlive');
    expect(url.searchParams.get('quick-edit')).to.equal('devlive');
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
      expect(url.searchParams.has('landing')).to.equal(false);
    });
  });

  it('opens folders and link files in browse instead of pretending to edit them', () => {
    const folder = getFileHref({ item: { path: '/org/site/folder' }, href: HREF });
    const link = getFileHref({ item: { path: '/org/site/folder/a.link', ext: 'link' }, href: HREF });
    expect(new URL(folder).hash).to.equal('#/org/site/folder');
    expect(link).to.equal(folder);
  });

  it('supports the classic editor when EW is unavailable', () => {
    expect(new URL(getFileHref({ item: { path: '/org/site/page.html', ext: 'html' }, href: HREF, editor: '/edit#' })).pathname).to.equal('/edit');
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
