import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { DA_ORIGIN } from '../../../../../blocks/shared/constants.js';
import { invalidateDaRsDiscovery } from '../../../../../blocks/shared/da-rs-provider.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
const { checkEditorAccess, IMPORTED_EDITOR_MESSAGE, CAPABILITIES_UNAVAILABLE_MESSAGE } = await import('../../../../../blocks/shared/da-file-item/guard.js');

const caps = (profile) => (profile === 'aem-import'
  ? {
    apiVersion: 1, transport: 'helix6', contentProfile: 'aem-import', readOnly: true, openKinds: ['image', 'sheet'], collaboration: false, branching: false, generation: 'g1',
  }
  : {
    apiVersion: 1, transport: 'helix6', contentProfile: 'native-da', readOnly: false, openKinds: ['page', 'sheet', 'image', 'asset'], collaboration: true, branching: true, generation: null,
  });

describe('checkEditorAccess', () => {
  let originalUrl;
  let originalFetch;
  let calls;

  const stub = (capsResponse) => async (target) => {
    calls.push(target);
    if (target.includes('/ping/')) return new Response('', { headers: { 'x-api-upgrade-available': 'true' } });
    return capsResponse();
  };

  beforeEach(() => {
    originalUrl = window.location.href;
    originalFetch = window.fetch;
    calls = [];
    window.history.replaceState(null, '', '/edit?da-source=da-rs#/demo/wknd/page');
    invalidateDaRsDiscovery();
  });
  afterEach(() => {
    window.fetch = originalFetch;
    window.history.replaceState(null, '', originalUrl);
    invalidateDaRsDiscovery();
  });

  it('denies imported sites without touching source', async () => {
    window.fetch = stub(() => Response.json(caps('aem-import')));
    const result = await checkEditorAccess('demo', 'wknd');
    expect(result).to.deep.equal({ allowed: false, message: IMPORTED_EDITOR_MESSAGE });
    expect(calls.some((target) => target.includes('/source/'))).to.equal(false);
    expect(calls).to.include(`${DA_ORIGIN}/demo/sites/wknd/source-capabilities`);
  });

  it('allows native sites', async () => {
    window.fetch = stub(() => Response.json(caps('native-da')));
    expect((await checkEditorAccess('demo', 'harbor')).allowed).to.equal(true);
  });

  it('fails closed when discovery errors', async () => {
    window.fetch = stub(() => new Response('', { status: 500 }));
    expect(await checkEditorAccess('demo', 'wknd'))
      .to.deep.equal({ allowed: false, message: CAPABILITIES_UNAVAILABLE_MESSAGE });
  });

  it('does not probe unbound, branch or incomplete targets', async () => {
    window.history.replaceState(null, '', '/edit#/demo/wknd/page');
    window.fetch = stub(() => { throw new Error('unexpected'); });
    expect((await checkEditorAccess('demo', 'wknd')).allowed).to.equal(true);
    expect((await checkEditorAccess('demo', 'wknd~b')).allowed).to.equal(true);
    expect((await checkEditorAccess('demo')).allowed).to.equal(true);
    expect(calls).to.deep.equal([]);
  });
});
