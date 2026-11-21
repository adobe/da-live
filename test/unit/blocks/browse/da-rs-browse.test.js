import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../scripts/utils.js';
import DaListBase from '../../../../blocks/browse/da-list-base/da-list-base.js';
import { DA_ORIGIN } from '../../../../blocks/shared/constants.js';
import { invalidateDaRsDiscovery } from '../../../../blocks/shared/da-rs-provider.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
await import('../../../../blocks/browse/da-actionbar/da-actionbar.js');
class DaRsTestList extends DaListBase {}
customElements.define('da-rs-test-list', DaRsTestList);

describe('bound browse mutations', () => {
  let savedUrl;
  let savedFetch;
  let calls;
  let list;
  beforeEach(() => {
    savedUrl = window.location.href;
    savedFetch = window.fetch;
    const url = new URL(savedUrl);
    url.searchParams.set('da-source', 'da-rs');
    url.hash = '#/demo/work';
    window.history.replaceState(null, '', url);
    invalidateDaRsDiscovery();
    calls = [];
    list = document.createElement('da-rs-test-list');
    list._listItems = [];
    list._listItemPaths = new Set();
    list._itemErrors = [];
    window.fetch = async (target, options) => {
      calls.push({ target, options });
      if (target.includes('/ping/')) return new Response('', { headers: { 'x-api-upgrade-available': 'true' } });
      if (options.method === 'DELETE') return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ copied: [{ src: '/page.html', dst: '/copy-2.html' }] }));
    };
  });
  afterEach(() => {
    window.fetch = savedFetch;
    window.history.replaceState(null, '', savedUrl);
    invalidateDaRsDiscovery();
  });

  it('trashes a document with H6 DELETE rather than moving or falling back', async () => {
    const item = { path: '/demo/work/page.html', ext: 'html', destination: '/demo/work/.trash/page.html' };
    list._listItems = [item];
    list._listItemPaths = new Set([item.path]);
    await list.handleItemAction({ item, type: 'move' });
    expect(list._itemErrors).to.have.length(0);
    expect(calls[1].target).to.equal(`${DA_ORIGIN}/demo/sites/work/source/page.html`);
    expect(calls[1].options.method).to.equal('DELETE');
    expect(list._listItems).to.have.length(0);
  });

  it('uses the server-selected same-site copy destination', async () => {
    const item = { path: '/demo/work/page.html', ext: 'html', destination: '/demo/work/copy.html' };
    await list.handleItemAction({ item, type: 'copy' });
    expect(list._itemErrors).to.have.length(0);
    expect(list._listItems[0].path).to.equal('/demo/work/copy-2.html');
    expect(calls[1].target).to.equal(`${DA_ORIGIN}/demo/sites/work/source/copy.html?source=%2Fpage.html`);
  });

  it('does not send unsupported folder trash operations', async () => {
    const item = { path: '/demo/work/folder', destination: '/demo/work/.trash/folder' };
    await list.handleItemAction({ item, type: 'move' });
    expect(list._itemErrors).to.have.length(1);
    expect(calls).to.have.length(1);
  });

  it('disables public delivery and share actions on the bound provider', () => {
    const bar = document.createElement('da-actionbar');
    bar.permissions = ['write'];
    bar.currentPath = '/demo/work';
    bar.items = [{ path: '/demo/work/page.html', ext: 'html' }];
    expect(bar._canAemAction).to.equal(false);
    expect(bar._canShare).to.equal(false);
  });
});
