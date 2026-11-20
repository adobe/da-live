import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../scripts/utils.js';
import DaListBase from '../../../../blocks/browse/da-list-base/da-list-base.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
await import('../../../../blocks/browse/da-actionbar/da-actionbar.js');
await import('../../../../blocks/browse/da-new/da-new.js');
await import('../../../../blocks/browse/legacy/da-search/da-search.js');
class BranchTestList extends DaListBase {}
customElements.define('branch-test-list', BranchTestList);

describe('branch browse operations', () => {
  let originalHash;
  let originalFetch;
  let calls;
  beforeEach(() => {
    originalHash = window.location.hash;
    originalFetch = window.fetch;
    window.location.hash = '#/deleteorg/deletesite~work';
    calls = [];
    window.fetch = async (url, opts = {}) => {
      calls.push({ url, method: opts.method });
      if (url.endsWith('/capabilities')) {
        return new Response(JSON.stringify({
          supported: true,
          apiVersion: 1,
          defaultBranchId: 'main',
          addressing: 'site-suffix',
          separator: '~',
          operations: ['create', 'changes', 'sync', 'publish', 'revert', 'restore'],
          itemKinds: ['html', 'json', 'media', 'config'],
          branchScopedSource: true,
          branchScopedCollaboration: true,
        }), { status: 200 });
      }
      if (url.endsWith('/work')) return new Response('{"id":"work"}', { status: 200 });
      return new Response('{}', { status: 200 });
    };
  });
  afterEach(() => {
    window.fetch = originalFetch;
    window.location.hash = originalHash;
  });

  it('deletes a branch document directly without trash or unpublish', async () => {
    const list = document.createElement('branch-test-list');
    const item = { name: 'doc', ext: 'html', path: '/deleteorg/deletesite~work/doc.html' };
    list.fullpath = '/deleteorg/deletesite~work';
    list._selectedItems = [item];
    list._listItems = [item];
    list._listItemPaths = new Set([item.path]);
    list._unpublish = true;
    list._confirmText = 'YES';
    list.handleClear = () => {};
    await list.handleConfirmDelete();
    const mutations = calls.filter((call) => call.method === 'DELETE');
    const expected = { url: 'https://admin.da.live/source/deleteorg/deletesite~work/doc.html', method: 'DELETE' };
    expect(mutations).to.deep.equal([expected]);
    expect(calls.some((call) => /\/move\/|\/live\/|\/preview\//.test(call.url))).to.equal(false);
  });

  it('rejects transfers to and from a different branch before making a request', async () => {
    const list = document.createElement('branch-test-list');
    const fromBranch = { path: '/deleteorg/deletesite~work/a.html', destination: '/deleteorg/deletesite/a.html' };
    const toBranch = { path: '/deleteorg/deletesite/a.html', destination: '/deleteorg/deletesite~work/a.html' };
    await list.handleItemAction({ type: 'copy', item: fromBranch });
    await list.handleItemAction({ type: 'move', item: toBranch });
    expect(list._itemErrors).to.have.length(2);
    expect(calls).to.have.length(0);
  });

  it('hides delivery and share actions on a branch but leaves default unchanged', () => {
    const bar = document.createElement('da-actionbar');
    bar.permissions = ['write'];
    bar.items = [{ path: '/deleteorg/deletesite~work/doc.html', ext: 'html' }];
    bar.currentPath = '/deleteorg/deletesite~work';
    expect(bar._canAemAction).to.equal(false);
    expect(bar._canShare).to.equal(false);
    bar.currentPath = '/deleteorg/deletesite';
    expect(bar._canAemAction).to.equal(true);
    expect(bar._canShare).to.equal(true);
  });

  it('blocks legacy bulk replacement and link creation on a branch', async () => {
    const search = document.createElement('da-search');
    search.fullpath = '/deleteorg/deletesite~work';
    await search.handleReplace({ preventDefault() {} });
    const create = document.createElement('da-new');
    create.fullpath = '/deleteorg/deletesite~work';
    create.handleNewType({ detail: { id: 'link' } });
    expect(create._linkDialogOpen).not.to.equal(true);
    expect(calls).to.have.length(0);
  });
});
