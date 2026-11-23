import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('DaTitle readOnly hook', () => {
  let savedFetch;
  let el;
  let fetched;

  before(async () => {
    fetched = [];
    savedFetch = window.fetch;
    window.fetch = async (url) => {
      fetched.push(String(url));
      if (String(url).endsWith('.css')) return new Response('', { status: 200, headers: { 'Content-Type': 'text/css' } });
      if (String(url).endsWith('.svg')) return new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>', { headers: { 'Content-Type': 'image/svg+xml' } });
      return new Response('{}', { status: 200 });
    };
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    await import('../../../../../blocks/edit/da-title/da-title.js');
  });

  after(() => { window.fetch = savedFetch; });

  beforeEach(() => { fetched = []; });
  afterEach(() => el?.remove());

  const details = {
    org: 'demo',
    site: 'wknd',
    path: '/data',
    fullpath: '/demo/wknd/data.json',
    parent: '/demo/wknd',
    parentName: 'wknd',
    name: 'data',
    view: 'sheet',
  };

  async function fixture(readOnly) {
    el = document.createElement('da-title');
    if (readOnly !== undefined) el.readOnly = readOnly;
    el.details = details;
    el.permissions = ['read', 'write'];
    document.body.append(el);
    await nextFrame();
    await nextFrame();
    return el;
  }

  it('offers no actions and no preparation even with a writer ACL', async () => {
    await fixture(true);
    expect(el._actions.available).to.deep.equal([]);
    expect(el.shadowRoot.querySelector('.da-title-actions')).to.equal(null);
    expect(el.shadowRoot.querySelector('da-prepare')).to.equal(null);
    expect(el.shadowRoot.querySelector('h1').textContent).to.equal('data');
  });

  it('does not fetch configs and ignores save requests', async () => {
    await fixture(true);
    await el.handleAction('save');
    expect(el._isSending).not.to.equal(true);
    expect(fetched.filter((url) => url.includes('/config/') || url.includes('/source/'))).to.deep.equal([]);
  });

  it('keeps the native actions when not read-only', async () => {
    await fixture(false);
    expect(el._actions.available).to.include('save');
  });

  it('re-evaluates when toggled after details are set', async () => {
    await fixture(false);
    el.readOnly = true;
    await nextFrame();
    expect(el._actions.available).to.deep.equal([]);
  });
});
