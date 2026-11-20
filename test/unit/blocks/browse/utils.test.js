import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { getBrowseComponent, resolveBrowsePath } from '../../../../blocks/browse/utils.js';

describe('Home landing toggle', () => {
  it('keeps existing Home unless landing is explicitly true', () => {
    ['', '?landing=false', '?landing=home', '?landing=', '?landing=TRUE'].forEach((search) => {
      expect(getBrowseComponent({ search })).to.equal('da-sites');
    });
  });

  it('opts Home into the landing surface alongside other parameters', () => {
    expect(getBrowseComponent({ search: '?nx=lpbg&landing=true' })).to.equal('da-landing');
  });

  it('opts Home into the landing surface when the page authors a Landing table, unless landing=false', () => {
    expect(getBrowseComponent({ search: '', hasLanding: true })).to.equal('da-landing');
    expect(getBrowseComponent({ search: '?landing=false', hasLanding: true })).to.equal('da-sites');
    expect(getBrowseComponent({ search: '', hasLanding: true, pathDetails: { org: 'o', site: 's' } }))
      .to.equal('da-browse');
  });

  it('never replaces site Browse with the landing surface', () => {
    ['', '?landing=true', '?landing=false'].forEach((search) => {
      expect(getBrowseComponent({ search, pathDetails: { org: 'example', site: 'site' } }))
        .to.equal('da-browse');
    });
  });
});

describe('browse implementation selection', () => {
  it('defaults to v2 without an explicit legacy opt-out', async () => {
    const searches = ['', '?nx=local', '?browse=', '?browse=01', '?browse=02', '?browse=other'];
    await Promise.all(searches.map(async (search) => {
      expect(await resolveBrowsePath({ search, org: 'org', fetchConfigs: () => [] })).to.equal('./v2');
    }));
  });

  it('continues to support browse=2 without fetching config', async () => {
    const fetchConfigs = sinon.spy();
    const searches = ['?browse=2', '?nx=local&browse=2', '?browse=2&da-admin=stage'];
    await Promise.all(searches.map(async (search) => {
      expect(await resolveBrowsePath({ search, org: 'org', fetchConfigs })).to.equal('./v2');
    }));
    expect(fetchConfigs.called).to.equal(false);
  });

  it('selects legacy with browse=1 without fetching config', async () => {
    const fetchConfigs = sinon.spy();
    const searches = ['?browse=1', '?nx=local&browse=1', '?browse=1&da-admin=stage'];
    await Promise.all(searches.map(async (search) => {
      expect(await resolveBrowsePath({ search, org: 'org', fetchConfigs })).to.equal('./legacy');
    }));
    expect(fetchConfigs.called).to.equal(false);
  });
});

describe('browseV1 flag', () => {
  const configs = (...docs) => () => docs.map((doc) => Promise.resolve(doc));
  const flag = (value) => ({ flags: { data: [{ key: 'browseV1', value }] } });
  const resolve = (fetchConfigs, extra = {}) => resolveBrowsePath({ search: '', org: 'org', site: 'site', fetchConfigs, ...extra });

  it('selects legacy from the org or site config', async () => {
    const fetchConfigs = sinon.spy(configs(flag('true')));
    expect(await resolve(fetchConfigs)).to.equal('./legacy');
    expect(fetchConfigs.calledOnceWithExactly({ org: 'org', site: 'site' })).to.equal(true);
    expect(await resolve(configs({}, flag('true')))).to.equal('./legacy');
  });

  it('lets site flags override org flags and otherwise inherits the org setting', async () => {
    expect(await resolve(configs(flag('true'), flag('false')))).to.equal('./v2');
    expect(await resolve(configs(flag('false'), flag('true')))).to.equal('./legacy');
    expect(await resolve(configs(flag('true'), {}))).to.equal('./legacy');
  });

  it('requires the string true and ignores the former browseV2 flag', async () => {
    for (const value of ['false', '', 'TRUE', true, 1]) {
      expect(await resolve(configs(flag(value)))).to.equal('./v2');
    }
    expect(await resolve(configs({ flags: { data: [{ key: 'browseV2', value: 'true' }] } })))
      .to.equal('./v2');
  });

  it('lets explicit query parameters override config', async () => {
    expect(await resolve(configs(flag('false')), { search: '?browse=1' })).to.equal('./legacy');
    expect(await resolve(configs(flag('true')), { search: '?browse=2' })).to.equal('./v2');
    expect(await resolve(configs(flag('true')), { search: '?browse=other' })).to.equal('./legacy');
  });

  it('falls back to v2 without a flag, org, or readable config', async () => {
    expect(await resolve(configs(null, { error: 'Unavailable' }))).to.equal('./v2');
    const fetchConfigs = sinon.spy(configs(flag('true')));
    expect(await resolve(fetchConfigs, { org: undefined })).to.equal('./v2');
    expect(fetchConfigs.called).to.equal(false);
    expect(await resolve(() => { throw new Error('Unavailable'); })).to.equal('./v2');
    expect(await resolve(() => [Promise.reject(new Error('Unavailable'))])).to.equal('./v2');
  });
});
