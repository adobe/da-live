import { expect } from '@esm-bundle/chai';
import { setNx, getNx2Api } from '../../../../../scripts/utils.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

await import('../../../../../blocks/canvas/ew-panel-extensions/ew-panel-library.js');
await import('../../../../../blocks/canvas/ew-block-library-modal/ew-block-library-modal.js');
const { status } = await getNx2Api();
const { resetBlockLibraryCache } = await import('../../../../../blocks/canvas/ew-panel-extensions/helpers.js');

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
      resetBlockLibraryCache();
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
      canvasBus.branchState.emit({ path: null, status: 'pending' });
      window.fetch = savedFetch;
      status.get = savedGet;
      if (savedIMS === undefined) delete window.adobeIMS; else window.adobeIMS = savedIMS;
      if (savedNxIms === null) localStorage.removeItem('nx-ims');
      else localStorage.setItem('nx-ims', savedNxIms);
    });

    it('waits for the matching cookie before assigning a same-org iframe URL', async () => {
      canvasBus.branchState.emit({
        org: 'org',
        site: 'site',
        path: '/org/site/page',
        status: 'ready',
        branch: 'feat',
      });
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
      expect(calls).to.have.lengthOf(2);
      expect(calls[0].url).to.equal('https://feat--shared--org.stage-preview.da.live/gimme_cookie');
      expect(calls[0].opts.credentials).to.equal('include');
      expect(calls[1].opts.method).to.equal('HEAD');
      expect(calls[1].opts.cache).to.equal('no-store');
      expect(el[preview].url).to.equal('https://feat--shared--org.stage-preview.da.live/hero?foo=bar#preview');
      expect(el[preview].ok).to.be.true;
    });

    [401, 403].forEach((statusCode) => {
      it(`recovers a lost cookie on reopen after a preview HEAD ${statusCode}`, async () => {
        const calls = [];
        let cookieValid = false;
        let cookieRequests = 0;
        const gate = cookieGate();
        window.fetch = async (url, opts) => {
          calls.push({ url, opts });
          if (url.endsWith('/gimme_cookie')) {
            cookieRequests += 1;
            if (cookieRequests === 2) {
              gate.notify();
              await gate.response;
            }
            cookieValid = true;
            return new Response('');
          }
          return new Response('', { status: cookieValid ? 200 : statusCode });
        };
        const item = { name: 'Hero', path: 'https://main--site--org.aem.page/hero' };
        await el[open](item);
        expect(cookieRequests).to.equal(1);
        // Keep the IMS token and helper caches intact, but discard the browser cookie.
        cookieValid = false;
        el[preview] = undefined;
        const pending = el[open](item);
        await gate.ready;
        const beforeRenewal = el[preview];
        gate.release();
        await pending;
        expect(beforeRenewal).to.equal(undefined);
        expect(cookieRequests).to.equal(2);
        expect(el[preview].url).to.equal('https://main--site--org.stage-preview.da.live/hero');
        expect(el[preview].ok).to.equal(true);
        const checks = calls.filter((call) => call.opts?.method === 'HEAD');
        expect(checks).to.have.lengthOf(3);
        expect(checks.every((call) => call.opts.credentials === 'include' && call.opts.cache === 'no-store')).to.equal(true);
      });
    });

    it('revalidates healthy preview sessions without another cookie exchange', async () => {
      const calls = [];
      window.fetch = async (url, opts) => {
        calls.push({ url, opts });
        return new Response('');
      };
      const item = { name: 'Hero', path: 'https://main--site--org.aem.page/hero' };
      await el[open](item);
      await el[open](item);
      expect(calls.filter((call) => call.url.endsWith('/gimme_cookie'))).to.have.lengthOf(1);
      expect(calls.filter((call) => call.opts?.method === 'HEAD')).to.have.lengthOf(2);
    });

    it('surfaces persistent preview denial without loading an unauthorized iframe', async () => {
      const calls = [];
      window.fetch = async (url, opts) => {
        calls.push({ url, opts });
        return new Response('', { status: url.endsWith('/gimme_cookie') ? 200 : 403 });
      };
      await el[open]({ name: 'Hero', path: 'https://main--site--org.aem.page/hero' });
      expect(el[preview].error).to.include('Library access was denied');
      expect(el[preview].url).to.equal(undefined);
      expect(statusCalls).to.deep.equal([]);
      expect(calls.filter((call) => call.opts?.method === 'HEAD')).to.have.lengthOf(2);
      expect(calls.filter((call) => call.url.endsWith('/gimme_cookie'))).to.have.lengthOf(2);
    });

    it('shows retry guidance when preview validation cannot reach the proxy', async () => {
      window.fetch = async (url, opts) => {
        if (opts?.method === 'HEAD') throw new Error('Network unavailable');
        return new Response('');
      };
      await el[open]({ name: 'Hero', path: 'https://main--site--org.aem.page/hero' });
      expect(el[preview].error).to.equal('Unable to check preview access. Please try again.');
      expect(el[preview].url).to.equal(undefined);
      expect(statusCalls).to.deep.equal([]);
    });

    it('does not restore a preview after disconnecting during its access check', async () => {
      document.body.append(el);
      await el.updateComplete;
      el._hashState = { org: 'org', site: 'site' };
      const gate = cookieGate();
      window.fetch = async (url, opts) => {
        if (opts?.method === 'HEAD') {
          gate.notify();
          return gate.response;
        }
        return new Response('');
      };
      const previousPreview = el[preview];
      const pending = el[open]({ name: 'Hero', path: 'https://main--site--org.aem.page/hero' });
      await gate.ready;
      el.remove();
      gate.release();
      await pending;
      expect(el[preview]).to.equal(previousPreview);
      expect(statusCalls).to.deep.equal([]);
    });

    [
      'https://feat--shared--other.aem.live/hero',
      'https://content.da.live/other/shared/hero',
    ].forEach((source) => {
      it(`uses rendered cross-org AEM previews without cookie or DA status requests for ${source}`, async () => {
        canvasBus.branchState.emit({
          org: 'org',
          site: 'site',
          path: '/org/site/page',
          status: 'ready',
          branch: 'Configured/Branch',
        });
        const calls = [];
        window.fetch = async (url) => {
          calls.push(url);
          return new Response('');
        };
        const path = `${source}?foo=bar#preview`;
        await el[open]({ name: 'Hero', path });
        expect(el[preview].url).to.equal('https://configured-branch--shared--other.aem.page/hero?foo=bar#preview');
        expect(el[preview].ok).to.equal(null);
        expect(calls).to.deep.equal([]);
        expect(statusCalls).to.deep.equal([]);
      });
    });

    [
      { label: 'DA-content', path: 'https://content.da.live/org/site/blocks/hero', site: 'site' },
      { label: 'absolute aem.page', path: 'https://main--site--org.aem.page/blocks/hero', site: 'site' },
      { label: 'absolute aem.live', path: 'https://main--site--org.aem.live/blocks/hero', site: 'site' },
      { label: 'same-org cross-site', path: 'https://main--shared--org.aem.page/blocks/hero', site: 'shared' },
      { label: 'already-proxied', path: 'https://main--site--org.preview.da.live/blocks/hero', site: 'site' },
      { label: 'relative', path: '/blocks/hero', site: 'site' },
    ].forEach(({ label, path, site }) => {
      it(`authenticates the resolved canvas branch before assigning the ${label} preview`, async () => {
        canvasBus.branchState.emit({
          org: 'org',
          site: 'site',
          path: '/org/site/page',
          status: 'ready',
          branch: 'Configured/Branch',
        });
        const gate = cookieGate();
        const calls = [];
        window.fetch = (url, opts) => {
          calls.push({ url, opts });
          gate.notify();
          return gate.response;
        };
        const pending = el[open]({ name: 'Hero', path: `${path}?foo=bar#preview` });
        await gate.ready;
        expect(el[preview]).to.equal(undefined);
        expect(calls[0].url).to.equal(`https://configured-branch--${site}--org.stage-preview.da.live/gimme_cookie`);
        gate.release();
        await pending;
        expect(el[preview].url).to.equal(`https://configured-branch--${site}--org.stage-preview.da.live/blocks/hero?foo=bar#preview`);
        expect(el[preview].ok).to.be.true;
        expect(calls).to.have.lengthOf(2);
        expect(calls[0].opts.credentials).to.equal('include');
        expect(calls[1].opts.method).to.equal('HEAD');
        expect(statusCalls).to.deep.equal([`/org/${site}/blocks/hero`]);
      });
    });

    it('does not request a cookie or load a guessed preview while branch resolution is pending', async () => {
      canvasBus.branchState.emit({
        org: 'org',
        site: 'site',
        path: '/org/site/page',
        status: 'pending',
      });
      const calls = [];
      window.fetch = async (url) => {
        calls.push(url);
        return new Response('');
      };
      await el[open]({ name: 'Hero', path: 'https://content.da.live/org/site/blocks/hero' });
      expect(el[preview].error).to.include('Preview branch unavailable.');
      expect(el[preview].url).to.equal(undefined);
      expect(calls).to.deep.equal([]);
      expect(statusCalls).to.deep.equal([]);
    });

    it('does not restore a preview after canvas context is cleared during cookie exchange', async () => {
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
      canvasBus.branchState.emit({ path: null, status: 'pending' });
      gate.release();
      await pending;
      expect(el[preview]?.url).to.equal(undefined);
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
      const previousPreview = el[preview];
      const pending = el[open]({ name: 'Hero', path: 'https://main--site--org.aem.page/hero' });
      await gate.ready;
      el.remove();
      gate.release();
      await pending;
      expect(el[preview]).to.equal(previousPreview);
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
