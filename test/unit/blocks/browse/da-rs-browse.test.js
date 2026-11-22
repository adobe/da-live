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
    list.remove();
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

  function stubBranchCopy() {
    window.fetch = async (target, options = {}) => {
      calls.push({ target, options });
      if (target.includes('/ping/')) return new Response('', { headers: { 'x-api-upgrade-available': 'true' } });
      if (target.endsWith('/capabilities')) {
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
          helix6BranchSource: true,
        }));
      }
      if (target.endsWith('/branches/demo/work/draft')) return new Response('{"id":"draft"}');
      const request = new URL(target);
      const dst = request.pathname.split('/source')[1];
      return new Response(JSON.stringify({ copied: [{ src: request.searchParams.get('source'), dst }] }));
    };
  }

  it('waits for the navigated branch folder and its listing before pasting', async () => {
    stubBranchCopy();
    const item = { name: 'browsecopy', ext: 'html', path: '/demo/work~draft/browsecopy.html' };
    const url = new URL(window.location.href);
    url.hash = '#/demo/work~draft';
    window.history.replaceState(null, '', url);
    list.setAttribute('fullpath', '/demo/work~draft');
    document.body.append(list);
    await list.updateComplete;
    list._listItems = [item];
    list._listItemPaths = new Set([item.path]);
    list._selectedItems = [item];
    const bar = document.createElement('da-actionbar');
    bar.items = [item];
    bar.currentPath = '/demo/work~draft';
    bar.permissions = ['write'];
    list.shadowRoot.append(bar);
    bar.handleCopy();
    url.hash = '#/demo/work~draft/folder';
    window.history.replaceState(null, '', url);
    let paste;
    bar.addEventListener('onpaste', (event) => { paste = list.handlePaste(event); });
    bar.handlePaste();
    await Promise.resolve();
    expect(calls.some(({ options }) => options.method === 'PUT')).to.equal(false);
    let release;
    list._directoryReady = new Promise((resolve) => { release = resolve; });
    list.setAttribute('fullpath', '/demo/work~draft/folder');
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(calls.some(({ options }) => options.method === 'PUT')).to.equal(false);
    list._listItems = [];
    list._listItemPaths = new Set();
    release();
    await paste;
    const write = calls.find(({ options }) => options.method === 'PUT');
    expect(write?.target).to.equal(
      `${DA_ORIGIN}/demo/sites/work~draft/source/folder/browsecopy.html?source=%2Fbrowsecopy.html`,
    );
  });

  it('rejects a paste into a different branch before making any request', async () => {
    stubBranchCopy();
    const url = new URL(window.location.href);
    url.hash = '#/demo/work~other/folder';
    window.history.replaceState(null, '', url);
    list.fullpath = '/demo/work~draft';
    list._selectedItems = [{ name: 'page', ext: 'html', path: '/demo/work~draft/page.html' }];
    await list.handlePaste({});
    expect(list._itemErrors[0].message).to.include('across branches');
    expect(calls).to.have.length(0);
  });

  it('rejects a branch-to-Default paste before making any request', async () => {
    stubBranchCopy();
    const url = new URL(window.location.href);
    url.hash = '#/demo/work/folder';
    window.history.replaceState(null, '', url);
    list.fullpath = '/demo/work~draft';
    list._selectedItems = [{ name: 'page', ext: 'html', path: '/demo/work~draft/page.html' }];
    await list.handlePaste({});
    expect(list._itemErrors[0].message).to.include('across branches');
    expect(calls).to.have.length(0);
  });

  it('rejects a Default-to-branch paste before making any request', async () => {
    stubBranchCopy();
    const url = new URL(window.location.href);
    url.hash = '#/demo/work~draft/folder';
    window.history.replaceState(null, '', url);
    list.fullpath = '/demo/work';
    list._selectedItems = [{ name: 'page', ext: 'html', path: '/demo/work/page.html' }];
    await list.handlePaste({});
    expect(list._itemErrors[0].message).to.include('across branches');
    expect(calls).to.have.length(0);
  });

  it('uses the loaded destination folder to choose a same-branch collision name', async () => {
    stubBranchCopy();
    const url = new URL(window.location.href);
    url.hash = '#/demo/work~draft/folder';
    window.history.replaceState(null, '', url);
    list.fullpath = '/demo/work~draft/folder';
    list._selectedItems = [{ name: 'page', ext: 'html', path: '/demo/work~draft/page.html' }];
    list._listItems = [{ name: 'page', ext: 'html', path: '/demo/work~draft/folder/page.html' }];
    list._listItemPaths = new Set(list._listItems.map(({ path }) => path));
    await list.handlePaste({});
    const write = calls.find(({ options }) => options.method === 'PUT');
    expect(write?.target).to.equal(
      `${DA_ORIGIN}/demo/sites/work~draft/source/folder/page-copy.html?source=%2Fpage.html`,
    );
  });

  it('waits for the real legacy Browse list update before choosing a copy destination', async () => {
    stubBranchCopy();
    const { default: LegacyList } = await import('../../../../blocks/browse/legacy/da-list/da-list.js');
    const live = new LegacyList();
    const item = { name: 'page', ext: 'html', path: '/demo/work~draft/page.html' };
    const url = new URL(window.location.href);
    url.hash = '#/demo/work~draft';
    window.history.replaceState(null, '', url);
    let startFolder;
    let releaseFolder;
    const folderStarted = new Promise((resolve) => { startFolder = resolve; });
    live.getList = () => {
      if (live.fullpath === '/demo/work~draft') return Promise.resolve([item]);
      return new Promise((resolve) => {
        releaseFolder = resolve;
        startFolder();
      });
    };
    live.updateDeletePermission = async () => {};
    live.setupObserver = () => {};
    live.fullpath = '/demo/work~draft';
    document.body.append(live);
    try {
      await live.updateComplete;
      await live._directoryReady;
      live._selectedItems = [item];
      url.hash = '#/demo/work~draft/folder';
      window.history.replaceState(null, '', url);
      const paste = live.handlePaste({});
      live.setAttribute('fullpath', '/demo/work~draft/folder');
      await folderStarted;
      expect(calls.some(({ options }) => options.method === 'PUT')).to.equal(false);
      releaseFolder([{ name: 'page', ext: 'html', path: '/demo/work~draft/folder/page.html' }]);
      await paste;
      const write = calls.find(({ options }) => options.method === 'PUT');
      expect(write?.target).to.equal(
        `${DA_ORIGIN}/demo/sites/work~draft/source/folder/page-copy.html?source=%2Fpage.html`,
      );
    } finally { live.remove(); }
  });

  it('cancels a pending paste if navigation changes again', async () => {
    stubBranchCopy();
    const url = new URL(window.location.href);
    url.hash = '#/demo/work~draft/folder';
    window.history.replaceState(null, '', url);
    list.fullpath = '/demo/work~draft';
    list._selectedItems = [{ name: 'page', ext: 'html', path: '/demo/work~draft/page.html' }];
    const paste = list.handlePaste({});
    url.hash = '#/demo/work~draft/other';
    window.history.replaceState(null, '', url);
    window.dispatchEvent(new Event('hashchange'));
    await paste;
    expect(list._itemErrors[0].message).to.include('location changed');
    expect(calls).to.have.length(0);
  });

  it('does not paste when the destination listing failed', async () => {
    stubBranchCopy();
    const url = new URL(window.location.href);
    url.hash = '#/demo/work~draft/folder';
    window.history.replaceState(null, '', url);
    list.fullpath = '/demo/work~draft/folder';
    list._selectedItems = [{ name: 'page', ext: 'html', path: '/demo/work~draft/page.html' }];
    list._directoryReady = Promise.resolve();
    list._directoryError = 'Not permitted to list filenames';
    await list.handlePaste({});
    expect(list._itemErrors[0].message).to.include('unavailable');
    expect(calls).to.have.length(0);
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
