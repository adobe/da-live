import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { addSite } = await import('../../../../blocks/onboarding/utils.js');

describe('onboarding/utils addSite', () => {
  let savedFetch;
  let savedIms;
  let calls;

  const mockFetch = (responses) => {
    window.fetch = (url, opts = {}) => {
      const method = opts.method || 'GET';
      calls.push({ url: `${url}`, method });
      const key = Object.keys(responses).find((k) => {
        const [m, part] = k.split(' ');
        return m === method && `${url}`.includes(part);
      });
      return Promise.resolve(new Response('{}', { status: key ? responses[key] : 200 }));
    };
  };

  beforeEach(() => {
    savedFetch = window.fetch;
    savedIms = window.adobeIMS;
    calls = [];
    window.adobeIMS = {
      isSignedInUser: () => true,
      getProfile: async () => ({ email: 'user@example.com' }),
    };
  });

  afterEach(() => {
    window.fetch = savedFetch;
    window.adobeIMS = savedIms;
  });

  it('creates the site folder in an existing org', async () => {
    mockFetch({ 'GET /config/org': 200, 'PUT /source/org/site': 201 });
    const result = await addSite({ org: 'org', site: 'site' });
    expect(result).to.deep.equal({ status: 201 });
    expect(calls.some(({ url, method }) => method === 'PUT' && url.endsWith('/source/org/site'))).to.be.true;
    expect(calls.some(({ url, method }) => method !== 'GET' && url.includes('/config/'))).to.be.false;
  });

  it('creates the org config first when the org does not exist', async () => {
    mockFetch({ 'GET /config/org': 404, 'PUT /config/org': 201, 'PUT /source/org/site': 201 });
    const result = await addSite({ org: 'org', site: 'site' });
    expect(result.error).to.be.undefined;
    const configSave = calls.findIndex(({ url, method }) => method === 'PUT' && url.includes('/config/org'));
    const sitePut = calls.findIndex(({ url, method }) => method === 'PUT' && url.includes('/source/'));
    expect(configSave).to.be.greaterThan(-1);
    expect(sitePut).to.be.greaterThan(configSave);
  });

  it('explains a forbidden or failed site creation', async () => {
    mockFetch({ 'GET /config/org': 200, 'PUT /source/org/site': 401 });
    expect((await addSite({ org: 'org', site: 'site' })).error).to.include('not authorized to create this site');
    mockFetch({ 'GET /config/org': 200, 'PUT /source/org/site': 500 });
    expect((await addSite({ org: 'org', site: 'site' })).error).to.include('The site could not be created');
  });
});
