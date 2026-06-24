import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../scripts/utils.js';
import { getEWFlags, isEWEnabled, isEwDisableChat } from '../../../../blocks/shared/ewFlags.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

describe('getEWFlags', () => {
  let savedFetch;
  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => { window.fetch = savedFetch; });

  it('returns all ew.* flags merged from org and site configs', async () => {
    window.fetch = async (url) => ({
      ok: true,
      json: async () => (url.includes('/flag-site1/')
        ? { flags: { data: [{ key: 'ew.canvasDefaultView', value: 'split' }] } }
        : { flags: { data: [{ key: 'ew.enabled', value: 'true' }] } }),
    });
    const flags = await getEWFlags({ org: 'flag-org1', site: 'flag-site1' });
    expect(flags).to.deep.equal({ 'ew.enabled': 'true', 'ew.canvasDefaultView': 'split' });
  });

  it('site level flag overrides org level flag', async () => {
    window.fetch = async (url) => ({
      ok: true,
      json: async () => (url.includes('/flag-site2/')
        ? { flags: { data: [{ key: 'ew.enabled', value: 'false' }] } }
        : { flags: { data: [{ key: 'ew.enabled', value: 'true' }] } }),
    });
    const flags = await getEWFlags({ org: 'flag-org2', site: 'flag-site2' });
    expect(flags['ew.enabled']).to.equal('false');
  });

  it('returns empty object when no ew.* flags are present', async () => {
    window.fetch = async () => ({ ok: true, json: async () => ({ flags: { data: [] } }) });
    expect(await getEWFlags({ org: 'flag-org3', site: 'flag-site3' })).to.deep.equal({});
  });

  it('ignores non-ew.* flags', async () => {
    window.fetch = async () => ({
      ok: true,
      json: async () => ({ flags: { data: [{ key: 'other.flag', value: 'true' }] } }),
    });
    expect(await getEWFlags({ org: 'flag-org4', site: 'flag-site4' })).to.deep.equal({});
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

describe('isEwDisableChat', () => {
  let savedFetch;
  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => { window.fetch = savedFetch; });

  it('returns true when ew.disableChat is set at org level but not site level', async () => {
    window.fetch = async (url) => ({
      ok: true,
      json: async () => (url.includes('/dc-site1/')
        ? { flags: { data: [] } }
        : { flags: { data: [{ key: 'ew.disableChat', value: 'true' }] } }),
    });
    expect(await isEwDisableChat({ org: 'dc-org1', site: 'dc-site1' })).to.be.true;
  });

  it('returns true when ew.disableChat is set at site level but not org level', async () => {
    window.fetch = async (url) => ({
      ok: true,
      json: async () => (url.includes('/dc-site2/')
        ? { flags: { data: [{ key: 'ew.disableChat', value: 'true' }] } }
        : { flags: { data: [] } }),
    });
    expect(await isEwDisableChat({ org: 'dc-org2', site: 'dc-site2' })).to.be.true;
  });

  it('returns false when ew.disableChat flag is not set at any level', async () => {
    window.fetch = async () => ({ ok: true, json: async () => ({ flags: { data: [] } }) });
    expect(await isEwDisableChat({ org: 'dc-org3', site: 'dc-site3' })).to.be.false;
  });
});
