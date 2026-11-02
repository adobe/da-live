import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-nx.js';
import { getBrowseHref, getFileHref, loadFiles, formatModified } from '../../../../blocks/landing/utils.js';

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

  it('opens folders and link-file parent directories in Browse without fetching link destinations', () => {
    const folder = getFileHref({ item: { path: '/org/site/folder' }, href: HREF });
    const link = getFileHref({ item: { path: '/org/site/folder/a.link', ext: 'link' }, href: HREF });
    expect(link).to.equal(folder);
    expect(new URL(folder).hash).to.equal('#/org/site/folder');
    expect(new URL(folder).searchParams.get('browse')).to.equal('2');
    expect(new URL(getBrowseHref({ href: HREF })).hash).to.equal('');
  });

  it('does not send preview parameters to external editors or invent a theme override', () => {
    expect(getFileHref({ item: { path: '/org/site/page.html', ext: 'html' }, href: HREF, editor: 'https://experience.adobe.com/editor' }))
      .to.equal('https://experience.adobe.com/editor/page');
    const url = new URL(getFileHref({ item: { path: '/org/site/page.html', ext: 'html' }, href: HREF.replace('&theme=light', '') }));
    expect(url.pathname).to.equal('/edit');
    expect(url.searchParams.has('theme')).to.equal(false);
  });

  it('formats real modification dates without inventing missing metadata', () => {
    const now = new Date(2026, 9, 19, 12);
    expect(formatModified({ modified: new Date(2026, 9, 19, 8).getTime(), now }).label).to.equal('Today');
    expect(formatModified({ modified: new Date(2026, 9, 18, 23).getTime(), now }).label).to.equal('Yesterday');
    expect(formatModified({ modified: new Date(2025, 8, 14).getTime(), now }).label).to.include('2025');
    expect(formatModified({ modified: undefined, now })).to.equal(undefined);
  });

  it('paginates the root listing, deduplicates entries and sorts newest first', async () => {
    const older = { path: '/org/site/a.html', name: 'a', lastModified: 10 };
    const newer = { path: '/org/site/b.html', name: 'b', lastModified: 20 };
    const list = sinon.stub();
    list.onFirstCall().resolves({ ok: true, items: [older, { path: '/org/site/.da', name: '.da' }], continuationToken: 'next', permissions: ['read'] });
    list.onSecondCall().resolves({ ok: true, items: [older, newer] });
    const { signal } = new AbortController();
    expect(await loadFiles({ path: '/org/site', source: { list }, signal }))
      .to.deep.equal({ files: [newer, older], permissions: ['read'] });
    expect(list.secondCall.args).to.deep.equal(['/org/site', { continuationToken: 'next', opts: { signal } }]);
  });

  it('rejects failed listings and repeated pagination tokens instead of returning partial success', async () => {
    for (const response of [{ ok: false }, { ok: true, items: [], continuationToken: 'same' }]) {
      try {
        await loadFiles({ path: '/org/site', source: { list: async () => response }, signal: new AbortController().signal });
        expect.fail('Expected listing failure');
      } catch (error) {
        expect(error.message).to.match(/site permissions|did not complete/);
      }
    }
  });

  it('does not start an already cancelled request', async () => {
    const request = new AbortController();
    request.abort();
    const list = sinon.spy();
    try {
      await loadFiles({ path: '/org/site', source: { list }, signal: request.signal });
      expect.fail('Expected cancellation');
    } catch (error) {
      expect(error.name).to.equal('AbortError');
    }
    expect(list.called).to.equal(false);
  });
});
