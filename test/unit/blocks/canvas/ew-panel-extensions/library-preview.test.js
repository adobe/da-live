import { expect } from '@esm-bundle/chai';
import { setNx, getNx2Api } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

await import('../../../../../blocks/canvas/ew-panel-extensions/ew-panel-library.js');
await import('../../../../../blocks/canvas/ew-block-library-modal/ew-block-library-modal.js');
const { status } = await getNx2Api();

function cookieGate() {
  let release;
  let notify;
  const response = new Promise((resolve) => { release = () => resolve(new Response('')); });
  const ready = new Promise((resolve) => { notify = resolve; });
  return { response, ready, release, notify };
}

[
  { tag: 'ew-panel-library', open: '_openPreview', preview: '_preview' },
  { tag: 'ew-block-library-modal', open: '_loadPreview', preview: '_previewInfo' },
].forEach(({ tag, open, preview }) => {
  describe(`${tag} preview access`, () => {
    let el;
    let savedFetch;
    let savedIMS;
    let savedNxIms;
    let savedGet;
    let statusCalls;

    beforeEach(() => {
      savedFetch = window.fetch;
      savedIMS = window.adobeIMS;
      savedNxIms = localStorage.getItem('nx-ims');
      savedGet = status.get;
      localStorage.setItem('nx-ims', 'true');
      window.adobeIMS = { getAccessToken: () => ({ token: 'test-token' }) };
      statusCalls = [];
      status.get = async (path) => {
        statusCalls.push(path);
        return new Response(JSON.stringify({ preview: { status: 200 } }));
      };
      el = document.createElement(tag);
      el._hashState = { org: 'org', site: 'site' };
    });

    afterEach(() => {
      el.remove();
      window.fetch = savedFetch;
      status.get = savedGet;
      if (savedIMS === undefined) delete window.adobeIMS; else window.adobeIMS = savedIMS;
      if (savedNxIms === null) localStorage.removeItem('nx-ims');
      else localStorage.setItem('nx-ims', savedNxIms);
    });

    it('waits for the matching cookie before assigning a same-org iframe URL', async () => {
      const gate = cookieGate();
      const calls = [];
      window.fetch = (url, opts) => {
        calls.push({ url, opts });
        gate.notify();
        return gate.response;
      };
      const pending = el[open]({ name: 'Hero', path: 'https://feat--shared--org.aem.page/hero?foo=bar#preview' });
      await gate.ready;
      expect(el[preview]).to.equal(undefined);
      gate.release();
      await pending;
      expect(calls).to.have.lengthOf(1);
      expect(calls[0].url).to.equal('https://feat--shared--org.stage-preview.da.live/gimme_cookie');
      expect(calls[0].opts.credentials).to.equal('include');
      expect(el[preview].url).to.equal('https://feat--shared--org.stage-preview.da.live/hero?foo=bar#preview');
      expect(el[preview].ok).to.be.true;
    });

    it('keeps cross-org preview URLs direct without cookie or DA status requests', async () => {
      const calls = [];
      window.fetch = async (url) => {
        calls.push(url);
        return new Response('');
      };
      const path = 'https://feat--shared--other.aem.live/hero?foo=bar#preview';
      await el[open]({ name: 'Hero', path });
      expect(el[preview].url).to.equal(path);
      expect(el[preview].ok).to.equal(null);
      expect(calls).to.deep.equal([]);
      expect(statusCalls).to.deep.equal([]);
    });

    it('does not restore a preview after the component disconnects during cookie exchange', async () => {
      document.body.append(el);
      await el.updateComplete;
      el._hashState = { org: 'org', site: 'site' };
      const gate = cookieGate();
      window.fetch = () => {
        gate.notify();
        return gate.response;
      };
      const pending = el[open]({ name: 'Hero', path: 'https://main--site--org.aem.page/hero' });
      await gate.ready;
      el.remove();
      gate.release();
      await pending;
      expect(el[preview]).to.equal(undefined);
      expect(statusCalls).to.deep.equal([]);
    });

    it('does not overwrite a newer preview when an earlier cookie exchange resolves last', async () => {
      const first = cookieGate();
      const second = cookieGate();
      window.fetch = (url) => {
        const gate = url.includes('--first--') ? first : second;
        gate.notify();
        return gate.response;
      };
      const stale = el[open]({ name: 'First', path: 'https://main--first--org.aem.page/hero' });
      await first.ready;
      const fresh = el[open]({ name: 'Second', path: 'https://main--second--org.aem.page/hero' });
      await second.ready;
      second.release();
      await fresh;
      first.release();
      await stale;
      expect(el[preview].name).to.equal('Second');
      expect(el[preview].url).to.equal('https://main--second--org.stage-preview.da.live/hero');
      expect(statusCalls).to.deep.equal(['/org/second/hero']);
    });

    it('does not overwrite newer preview status when an earlier status resolves last', async () => {
      window.fetch = async () => new Response('');
      const gate = cookieGate();
      status.get = (path) => {
        if (path.includes('/first/')) {
          gate.notify();
          return gate.response;
        }
        return Promise.resolve(new Response(JSON.stringify({ preview: { status: 200 } })));
      };
      const stale = el[open]({ name: 'First', path: 'https://main--first--org.aem.page/hero' });
      await gate.ready;
      await el[open]({ name: 'Second', path: 'https://main--second--org.aem.page/hero' });
      gate.release();
      await stale;
      expect(el[preview].name).to.equal('Second');
      expect(el[preview].ok).to.be.true;
    });
  });
});

describe('ew-block-library-modal access states', () => {
  let el;

  beforeEach(async () => {
    el = document.createElement('ew-block-library-modal');
    document.body.append(el);
    await el.updateComplete;
  });

  afterEach(() => el.remove());

  it('shows DA and cross-org Sidekick guidance when library access is denied', async () => {
    const blocks = [];
    blocks.authError = true;
    el.blocks = blocks;
    await el.updateComplete;
    const text = el.shadowRoot.querySelector('.modal-state').textContent;
    expect(text).to.include('signed in to DA');
    expect(text).to.include('AEM Sidekick');
  });

  it('shows access guidance for denied variant HTML', async () => {
    const variants = [];
    variants.authError = true;
    el.blocks = [{ name: 'Hero', path: '/hero', loadVariants: Promise.resolve(variants) }];
    await el.updateComplete;
    el._expandedPath = '/hero';
    el._variantsByPath.set('/hero', variants);
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.modal-tree-loading').textContent).to.include('Library access was denied');
  });

  it('does not restore a selection superseded while its variants were loading', async () => {
    let release;
    const variants = new Promise((resolve) => { release = resolve; });
    el._loadPreview = async () => {};
    const stale = el._selectBlock({ path: '/first', loadVariants: variants });
    await el._selectBlock({ path: '/second', loadVariants: Promise.resolve([]) });
    release([]);
    await stale;
    expect(el._selectedPath).to.equal('/second');
    expect(el._expandedPath).to.equal('/second');
  });
});
