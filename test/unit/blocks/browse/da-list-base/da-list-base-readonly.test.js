/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { invalidateDaRsDiscovery } from '../../../../../blocks/shared/da-rs-provider.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
const { default: DaListBase } = await import('../../../../../blocks/browse/da-list-base/da-list-base.js');

class TestList extends DaListBase {}
customElements.define('da-list-base-readonly-test', TestList);

const IMPORTED = {
  apiVersion: 1, transport: 'helix6', contentProfile: 'aem-import', readOnly: true, openKinds: ['image', 'sheet'], collaboration: false, branching: false, generation: 'g1',
};

describe('DaListBase read-only imported content', () => {
  let originalUrl;
  let originalFetch;
  let calls;

  beforeEach(() => {
    originalUrl = window.location.href;
    originalFetch = window.fetch;
    calls = [];
    window.history.replaceState(null, '', '/?da-source=da-rs#/demo/wknd');
    invalidateDaRsDiscovery();
    window.fetch = async (target, options) => {
      calls.push({ target: String(target), options });
      if (String(target).includes('/ping/')) return new Response('', { headers: { 'x-api-upgrade-available': 'true' } });
      if (String(target).endsWith('/source-capabilities')) return Response.json(IMPORTED);
      return new Response('{}');
    };
  });
  afterEach(() => {
    window.fetch = originalFetch;
    window.history.replaceState(null, '', originalUrl);
    invalidateDaRsDiscovery();
  });

  const make = () => {
    const el = new TestList();
    el.fullpath = '/demo/wknd';
    el.select = true;
    el.drag = true;
    el._listItems = [];
    return el;
  };

  it('resolves read-only from discovery and masks write permissions', async () => {
    const el = make();
    await el.resolveReadOnlyContent('/demo/wknd', []);
    expect(el._readOnlyContent).to.equal(true);
    expect(el.canSelect).to.equal(false);
    expect(el.canDrop).to.equal(false);
    el.handlePermissions(['read', 'write']);
    expect(el._permissions).to.deep.equal(['read']);
  });

  it('skips config fetches and disables delete for imported sites', async () => {
    const el = make();
    await el.updateDeletePermission();
    expect(el._canDelete).to.equal(false);
    expect(calls.some(({ target }) => target.includes('/config'))).to.equal(false);
  });

  it('fails closed on capability errors', async () => {
    window.fetch = async (target) => (String(target).includes('/ping/')
      ? new Response('', { headers: { 'x-api-upgrade-available': 'true' } })
      : new Response('', { status: 500 }));
    const el = make();
    expect(await el.getList()).to.deep.equal([]);
    expect(el.canDrop).to.equal(false);
    expect(el.canSelect).to.equal(false);
    expect(el._permissions).to.deep.equal([]);
    await el.updateDeletePermission();
    expect(el._canDelete).to.equal(false);
  });

  it('refuses mutations, paste, drops and selection', async () => {
    const el = make();
    el._readOnlyContent = true;
    el._selectedItems = [{ path: '/demo/wknd/hero.png', ext: 'png', name: 'hero' }];
    await el.handlePaste({ detail: {} });
    await el.handleDelete();
    await el.handleConfirmDelete();
    await el.drop({
      preventDefault() {},
      get dataTransfer() { throw new Error('A read-only list must not inspect dropped files'); },
    });
    await el.processDropFiles();
    el.handleRename();
    expect(el._confirm).to.equal(undefined);
    await el.handleItemAction({ item: { path: '/demo/wknd/hero.png', ext: 'png', name: 'hero' }, type: 'delete' });
    expect(el._itemErrors).to.have.length(1);
    expect(calls.filter(({ options }) => options?.method && options.method !== 'GET')).to.deep.equal([]);
  });

  it('checks the base site for a bound branch path', async () => {
    const el = make();
    el.fullpath = '/demo/wknd~b';
    expect(await el.getList()).to.deep.equal([]);
    expect(el._directoryError).to.contain('does not support branches');
    expect(el.canSelect).to.equal(false);
    expect(el.canDrop).to.equal(false);
    expect(calls.map(({ target }) => new URL(target).pathname)).to.deep.equal([
      '/ping/demo/wknd', '/demo/sites/wknd/source-capabilities',
    ]);
  });

  it('does not probe unbound paths', async () => {
    window.history.replaceState(null, '', '/#/demo/wknd');
    const el = make();
    expect(await el.isReadOnlySite('/demo/wknd')).to.equal(false);
    expect(await el.isReadOnlySite('/demo/wknd~b')).to.equal(false);
    expect(await el.isReadOnlySite('/demo')).to.equal(false);
    expect(calls).to.deep.equal([]);
  });
});
