import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../scripts/utils.js';
import { DA_ORIGIN } from '../../../../blocks/shared/constants.js';
import { invalidateDaRsDiscovery } from '../../../../blocks/shared/da-rs-provider.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
const { default: init } = await import('../../../../blocks/media/media.js');

describe('bound standalone media', () => {
  let originalUrl;
  let originalFetch;
  let originalCreate;
  let calls;
  beforeEach(() => {
    originalUrl = window.location.href;
    originalFetch = window.fetch;
    originalCreate = URL.createObjectURL;
    window.history.replaceState(null, '', '/media?da-source=da-rs#/demo/work/pic.png');
    invalidateDaRsDiscovery();
    calls = [];
    URL.createObjectURL = () => 'blob:bound-media';
  });
  afterEach(() => {
    window.fetch = originalFetch;
    URL.createObjectURL = originalCreate;
    window.history.replaceState(null, '', originalUrl);
    invalidateDaRsDiscovery();
  });

  [true, false].forEach((upgraded) => {
    it(`loads ${upgraded ? 'H6' : 'legacy'} media from the bound Source origin`, async () => {
      window.fetch = async (target, options) => {
        calls.push({ target, options });
        if (target.includes('/ping/')) {
          return new Response('', { headers: upgraded ? { 'x-api-upgrade-available': 'true' } : {} });
        }
        return new Response('png', { headers: { 'Content-Type': 'image/png' } });
      };
      const el = document.createElement('div');
      await init(el);
      const expected = upgraded ? '/demo/sites/work/source/pic.png' : '/source/demo/work/pic.png';
      expect(calls.map(({ target }) => target)).to.deep.equal([
        `${DA_ORIGIN}/ping/demo/work`, `${DA_ORIGIN}${expected}`,
      ]);
      expect(el.querySelector('da-media').details.contentUrl).to.equal('blob:bound-media');
    });
  });

  it('refuses non-image media bytes without falling back to delivery', async () => {
    window.fetch = async (target) => {
      calls.push(target);
      if (target.includes('/ping/')) return new Response('', { headers: { 'x-api-upgrade-available': 'true' } });
      return new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } });
    };
    let failed = false;
    try { await init(document.createElement('div')); } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
    expect(calls).to.have.length(2);
  });
});
