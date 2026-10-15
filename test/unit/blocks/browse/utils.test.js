import { expect } from '@esm-bundle/chai';
import { getBrowsePath, resolveBrowsePath } from '../../../../blocks/browse/utils.js';

describe('browse implementation selection', () => {
  it('defaults to legacy browse without an explicit opt-in', () => {
    ['', '?nx=local', '?browse=', '?browse=1', '?browse=02', '?browse=other'].forEach((search) => {
      expect(getBrowsePath({ search })).to.equal('./legacy');
    });
  });

  it('selects the redesign with browse=2 alongside existing query parameters', () => {
    ['?browse=2', '?nx=local&browse=2', '?browse=2&da-admin=stage'].forEach((search) => {
      expect(getBrowsePath({ search })).to.equal('./v2');
    });
  });
});

describe('browseV2 flag', () => {
  const configs = (...docs) => () => docs.map((doc) => Promise.resolve(doc));
  const flag = (value) => ({ flags: { data: [{ key: 'browseV2', value }] } });
  const resolve = (fetchConfigs, extra = {}) => resolveBrowsePath({ search: '', org: 'o', site: 's', fetchConfigs, ...extra });

  it('opts in from the org or site config', async () => {
    expect(await resolve(configs(flag('true')))).to.equal('./v2');
    expect(await resolve(configs({}, flag('true')))).to.equal('./v2');
  });

  it('lets the site config override the org config', async () => {
    expect(await resolve(configs(flag('true'), flag('false')))).to.equal('./legacy');
    expect(await resolve(configs(flag('false'), flag('true')))).to.equal('./v2');
  });

  it('lets the query param override the flag', async () => {
    expect(await resolve(configs(flag('true')), { search: '?browse=1' })).to.equal('./legacy');
    expect(await resolve(configs(), { search: '?browse=2' })).to.equal('./v2');
  });

  it('falls back to legacy without a flag, org, or config', async () => {
    expect(await resolve(configs({}, { error: 'x' }))).to.equal('./legacy');
    expect(await resolve(configs(flag('true')), { org: undefined })).to.equal('./legacy');
    expect(await resolve(() => { throw new Error('boom'); })).to.equal('./legacy');
    expect(await resolve(() => [Promise.reject(new Error('boom'))])).to.equal('./legacy');
  });
});
