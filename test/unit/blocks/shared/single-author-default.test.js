import { expect } from '@esm-bundle/chai';

describe('da-rs demo authoring default', () => {
  const config = { apiVersion: 1, provider: 'da-rs', org: 'demo', adminEnv: 'local', collabEnv: 'local' };
  let originalFetch;
  let originalHref;

  beforeEach(() => {
    originalFetch = window.fetch;
    originalHref = window.location.href;
  });
  afterEach(() => {
    window.fetch = originalFetch;
    window.history.replaceState(null, '', originalHref);
  });

  async function load(response, suffix) {
    window.fetch = async () => response;
    const url = new URL(`../../../../blocks/shared/da-rs-bootstrap.js?${suffix}`, import.meta.url);
    return import(url.href);
  }

  it('defaults configured demos to single author and honors a hosted override', async () => {
    const bootstrap = await load(Response.json(config), 'default-single');
    expect(bootstrap.isSingleAuthorDemo()).to.equal(true);
    const url = new URL(window.location.href);
    url.searchParams.set('da-source', 'hosted');
    window.history.replaceState(null, '', url);
    expect(bootstrap.isSingleAuthorDemo()).to.equal(false);
  });

  it('allows configuration to select collaboration explicitly', async () => {
    const bootstrap = await load(Response.json({ ...config, authoringMode: 'collaboration' }), 'collaboration');
    expect(bootstrap.isSingleAuthorDemo()).to.equal(false);
  });

  it('retains explicit single-author selection', async () => {
    const bootstrap = await load(Response.json({ ...config, authoringMode: 'single' }), 'explicit-single');
    expect(bootstrap.isSingleAuthorDemo()).to.equal(true);
  });

  it('keeps local demo access and single-author mode with the shared Stage service', async () => {
    const bootstrap = await load(Response.json({ ...config, adminEnv: 'rspoc' }), 'local-shared-service');
    expect(bootstrap.getDaRsDemoState().config.org).to.equal('demo');
    expect(bootstrap.isSingleAuthorDemo()).to.equal(true);
  });

  it('does not enable single-author mode when no demo is configured', async () => {
    const bootstrap = await load(new Response('', { status: 404 }), 'no-demo');
    expect(bootstrap.isSingleAuthorDemo()).to.equal(false);
  });
});
