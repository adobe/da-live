import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { handleRoute } = await import('../../../../blocks/permissions/permissions.js');

const HLX6_KEY = 'hlx6-upgrade';

// isHlx6 caches per /org/site for the page's lifetime, so every test uses its own site names.
function stubPing(pingFor) {
  const pinged = [];
  window.fetch = async (url) => {
    const href = String(url);
    if (href.includes('/ping/')) {
      const path = href.split('/ping')[1];
      pinged.push(path);
      return pingFor(path);
    }
    return new Response('', { status: 404 });
  };
  return pinged;
}

const plain = () => new Response('', { status: 200 });
const upgraded = () => new Response('', { status: 200, headers: { 'x-api-upgrade-available': 'true' } });

describe('permissions handleRoute', () => {
  let el;
  let savedFetch;

  beforeEach(() => {
    el = document.createElement('div');
    savedFetch = window.fetch;
  });

  afterEach(() => {
    window.fetch = savedFetch;
    localStorage.removeItem(HLX6_KEY);
  });

  it('returns the Helix 6 user-admin URL with encoded org and site, and does not mount', async () => {
    stubPing(upgraded);
    const redirect = await handleRoute(el, { org: 'my org', site: 'hlx6site' });

    expect(redirect).to.equal('https://tools.aem.live/tools/user-admin/index.html?org=my%20org&site=hlx6site');
    expect(el.querySelector('da-permissions')).to.equal(null);
  });

  it('mounts da-permissions with org/site when not Helix 6', async () => {
    stubPing(plain);
    const redirect = await handleRoute(el, { org: 'o', site: 'plainsite' });

    expect(redirect).to.equal(null);
    const cmp = el.querySelector('da-permissions');
    expect(cmp.org).to.equal('o');
    expect(cmp.site).to.equal('plainsite');
  });

  it('does not probe Helix 6 when site is null, and mounts with site null', async () => {
    const pinged = stubPing(upgraded);
    const redirect = await handleRoute(el, { org: 'o', site: null });

    expect(redirect).to.equal(null);
    expect(pinged).to.deep.equal([]);
    const cmp = el.querySelector('da-permissions');
    expect(cmp.org).to.equal('o');
    expect(cmp.site).to.equal(null);
  });

  it('mounts with org null and site null when details is null', async () => {
    const pinged = stubPing(upgraded);
    await handleRoute(el, null);

    expect(pinged).to.deep.equal([]);
    const cmp = el.querySelector('da-permissions');
    expect(cmp.org).to.equal(null);
    expect(cmp.site).to.equal(null);
  });

  it('ignores a stale route: an earlier Helix 6 probe resolving late neither redirects nor remounts', async () => {
    let resolveA;
    stubPing((path) => {
      if (path === '/o/staleA1') return new Promise((resolve) => { resolveA = resolve; });
      return plain();
    });

    const promiseA = handleRoute(el, { org: 'o', site: 'staleA1' });
    await handleRoute(el, { org: 'o', site: 'freshB1' });
    expect(el.querySelector('da-permissions').site).to.equal('freshB1');

    resolveA(upgraded());
    expect(await promiseA).to.equal(null);
    expect(el.querySelector('da-permissions').site).to.equal('freshB1');
  });

  it('a stale route resolving as not Helix 6 also does not remount with the old site', async () => {
    let resolveA;
    stubPing((path) => {
      if (path === '/o/staleA2') return new Promise((resolve) => { resolveA = resolve; });
      return plain();
    });

    const promiseA = handleRoute(el, { org: 'o', site: 'staleA2' });
    await handleRoute(el, { org: 'o', site: 'freshB2' });

    resolveA(plain());
    await promiseA;
    expect(el.querySelector('da-permissions').site).to.equal('freshB2');
  });

  it('reuses the same element across route changes', async () => {
    stubPing(plain);
    await handleRoute(el, { org: 'o', site: null });
    const first = el.querySelector('da-permissions');

    await handleRoute(el, { org: 'o2', site: null });
    const second = el.querySelector('da-permissions');

    expect(second).to.equal(first);
    expect(second.org).to.equal('o2');
  });
});
