import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../scripts/utils.js';
import isEWEnabled from '../../../../blocks/shared/isEWEnabled.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

describe('isEWEnabled', () => {
  let savedFetch;
  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => { window.fetch = savedFetch; });

  it('returns true when ew.enabled flag value is "true"', async () => {
    window.fetch = async (url) => ({
      ok: true,
      json: async () => (url.includes('/ew-s1/')
        ? { flags: { data: [{ key: 'ew.enabled', value: 'true' }] } }
        : {}),
    });
    expect(await isEWEnabled({ org: 'ew-o1', site: 'ew-s1' })).to.be.true;
  });

  it('returns false when ew.enabled flag value is "false"', async () => {
    window.fetch = async (url) => ({
      ok: true,
      json: async () => (url.includes('/ew-s2/')
        ? { flags: { data: [{ key: 'ew.enabled', value: 'false' }] } }
        : {}),
    });
    expect(await isEWEnabled({ org: 'ew-o2', site: 'ew-s2' })).to.be.false;
  });
});
