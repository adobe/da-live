import { expect } from '@esm-bundle/chai';

const { setNx, getNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: init, handleRoute } = await import('../../../../blocks/config/config.js');
const { hashChange } = await import(`${getNx()}/utils/utils.js`);

describe('config handleRoute', () => {
  let el;
  let savedFetch;

  beforeEach(() => {
    el = document.createElement('div');
    savedFetch = window.fetch;
    window.fetch = async () => new Response('', { status: 404 });
  });

  afterEach(() => {
    window.fetch = savedFetch;
  });

  it('mounts da-config with org and site', async () => {
    const cmp = await handleRoute(el, { org: 'o', site: 's' });
    expect(el.querySelector('da-config')).to.equal(cmp);
    expect(cmp.org).to.equal('o');
    expect(cmp.site).to.equal('s');
  });

  it('reuses the mounted element on later routes', async () => {
    const first = await handleRoute(el, { org: 'o', site: 's' });
    const second = await handleRoute(el, { org: 'o', site: null });
    expect(second).to.equal(first);
    expect(el.querySelectorAll('da-config')).to.have.length(1);
    expect(second.site).to.equal(null);
  });

  it('mounts with nulls when there is no route', async () => {
    const cmp = await handleRoute(el, null);
    expect(cmp.org).to.equal(null);
    expect(cmp.site).to.equal(null);
  });
});

describe('config init', () => {
  let savedFetch;
  beforeEach(() => {
    savedFetch = window.fetch;
    window.fetch = async () => new Response('', { status: 404 });
  });
  afterEach(() => { window.fetch = savedFetch; });

  it('clears the block and follows the hash', async () => {
    const el = document.createElement('div');
    el.append(document.createElement('p'));
    init(el);
    hashChange._set({ org: 'h1', site: 'x' });
    // Polls every 10ms for up to 500ms.
    for (let i = 0; i < 50 && !el.querySelector('da-config')?.org; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => { setTimeout(resolve, 10); });
    }
    const cmp = el.querySelector('da-config');
    expect([el.querySelector('p'), cmp?.org, cmp?.site]).to.deep.equal([null, 'h1', 'x']);
  });
});
