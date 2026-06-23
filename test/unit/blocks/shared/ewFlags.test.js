import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../scripts/utils.js';
import { getEWFlag, isEWEnabled } from '../../../../blocks/shared/ewFlags.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

describe('getEWFlag', () => {
  let savedFetch;
  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => { window.fetch = savedFetch; });

  it('returns the flag value string when present', async () => {
    window.fetch = async (url) => ({
      ok: true,
      json: async () => (url.includes('/flag-site1/')
        ? { flags: { data: [{ key: 'ew.enabled', value: 'true' }] } }
        : {}),
    });
    expect(await getEWFlag({ org: 'flag-org1', site: 'flag-site1', flagName: 'ew.enabled' })).to.equal('true');
  });

  it('returns undefined when the flag is not in the config', async () => {
    window.fetch = async () => ({ ok: true, json: async () => ({ flags: { data: [] } }) });
    expect(await getEWFlag({ org: 'flag-org2', site: 'flag-site2', flagName: 'ew.enabled' })).to.be.undefined;
  });
});

describe('isEWEnabled', () => {
  let savedFetch;
  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => { window.fetch = savedFetch; });

  it('returns true when ew.enabled flag value is "true"', async () => {
    window.fetch = async (url) => ({
      ok: true,
      json: async () => (url.includes('/ew-site1/')
        ? { flags: { data: [{ key: 'ew.enabled', value: 'true' }] } }
        : {}),
    });
    expect(await isEWEnabled({ org: 'ew-org1', site: 'ew-site1' })).to.be.true;
  });

  it('returns false when ew.enabled flag value is "false"', async () => {
    window.fetch = async (url) => ({
      ok: true,
      json: async () => (url.includes('/ew-site2/')
        ? { flags: { data: [{ key: 'ew.enabled', value: 'false' }] } }
        : {}),
    });
    expect(await isEWEnabled({ org: 'ew-org2', site: 'ew-site2' })).to.be.false;
  });
});
