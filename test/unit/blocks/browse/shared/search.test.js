import { expect } from '@esm-bundle/chai';
import { spy, stub, useFakeTimers } from 'sinon';
import { setNx, getNx2Api } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
const { getLocales, getSearchScope, timeoutWrapper } = await import('../../../../../blocks/browse/shared/search.js');

describe('shared browse search helpers', () => {
  describe('getLocales', () => {
    it('always excludes langstore without configured languages', () => {
      [undefined, {}, { languages: { data: [{}] } }].forEach((translate) => {
        expect([...getLocales(translate)]).to.deep.equal(['langstore']);
      });
    });

    it('extracts unique top-level locale directories and ignores empty entries', () => {
      const translate = {
        languages: {
          data: [
            { locales: ' /en/products, /fr/, , /en/other' },
            { locales: '/de_DE, /langstore' },
            {},
          ],
        },
      };
      expect([...getLocales(translate)]).to.deep.equal(['langstore', 'en', 'fr', 'de_DE']);
    });
  });

  describe('getSearchScope', () => {
    let fetchStub;

    before(async () => {
      const initialFetch = stub(window, 'fetch').resolves(new Response('', { status: 200 }));
      try {
        const { isHlx6 } = await getNx2Api();
        await isHlx6('org', 'site');
      } finally {
        initialFetch.restore();
      }
    });

    beforeEach(() => {
      fetchStub = stub(window, 'fetch');
    });

    afterEach(() => {
      fetchStub.restore();
    });

    it('does not fetch configuration or read items outside a site root', async () => {
      const getBrowseItems = spy();
      await Promise.all(['/org', '/org/site/folder'].map(async (startPath) => {
        const scope = await getSearchScope({ startPath, getBrowseItems });
        expect(scope).to.deep.equal({ paths: [startPath], files: [] });
      }));
      expect(fetchStub.called).to.be.false;
      expect(getBrowseItems.called).to.be.false;
    });

    it('retains the root fallback when translation configuration is unavailable', async () => {
      fetchStub.resolves(new Response('', { status: 404 }));
      const getBrowseItems = spy();
      expect(await getSearchScope({ startPath: '/org/site', getBrowseItems })).to.deep.equal({ paths: ['/org/site'], files: [] });
      expect(getBrowseItems.called).to.be.false;
    });

    it('retains the root fallback when browse items are not yet available', async () => {
      fetchStub.resolves(new Response('{}'));
      expect(await getSearchScope({ startPath: '/org/site', getBrowseItems: () => undefined })).to.deep.equal({ paths: ['/org/site'], files: [] });
    });

    it('excludes locale folders and separates crawl paths from individual files', async () => {
      fetchStub.resolves(new Response(JSON.stringify({ languages: { data: [{ locales: '/en, /fr' }] } })));
      const items = [
        { name: 'langstore', path: '/org/site/langstore' },
        { name: 'en', path: '/org/site/en' },
        { name: 'fr', path: '/org/site/fr' },
        { name: 'products', path: '/org/site/products' },
        { name: 'index', path: '/org/site/index.html', ext: 'html' },
      ];
      const result = await getSearchScope({ startPath: '/org/site', getBrowseItems: () => items });
      expect(result).to.deep.equal({ paths: ['/org/site/products'], files: [items[4]] });
      expect(result.files[0]).to.equal(items[4]);
    });

    it('reads the latest browse items after asynchronous configuration loading', async () => {
      let finish;
      const configuration = new Promise((resolve) => { finish = resolve; });
      fetchStub.returns(configuration);
      let items;
      const getBrowseItems = spy(() => items);
      const pending = getSearchScope({ startPath: '/org/site', getBrowseItems });
      expect(getBrowseItems.called).to.be.false;
      items = [{ name: 'products', path: '/org/site/products' }];
      finish(new Response('{}'));
      expect(await pending).to.deep.equal({ paths: ['/org/site/products'], files: [] });
      expect(getBrowseItems.calledOnce).to.be.true;
    });

    it('propagates invalid configuration rather than silently broadening the scope', async () => {
      fetchStub.resolves(new Response('{invalid'));
      const getBrowseItems = spy();
      let failure;
      try {
        await getSearchScope({ startPath: '/org/site', getBrowseItems });
      } catch (error) {
        failure = error;
      }
      expect(failure).to.be.instanceOf(SyntaxError);
      expect(getBrowseItems.called).to.be.false;
    });
  });

  describe('timeoutWrapper', () => {
    let clock;

    beforeEach(() => {
      clock = useFakeTimers();
    });

    afterEach(() => {
      clock.restore();
    });

    it('returns successful results unchanged and clears the timer', async () => {
      const result = { path: '/org/site/page.html' };
      const fn = stub().resolves(result);
      expect(await timeoutWrapper({ fn })).to.equal(result);
      expect(fn.calledOnce).to.be.true;
      expect(clock.countTimers()).to.equal(0);
    });

    it('preserves the default 30-second timeout boundary', async () => {
      let settled = false;
      const pending = timeoutWrapper({ fn: () => new Promise(() => {}) });
      pending.then(() => { settled = true; });
      await clock.tickAsync(29999);
      expect(settled).to.be.false;
      await clock.tickAsync(1);
      expect(await pending).to.deep.equal({ error: 'timeout' });
    });

    it('honors explicit timeouts without changing a result that arrives later', async () => {
      let finish;
      const operation = new Promise((resolve) => { finish = resolve; });
      const pending = timeoutWrapper({ fn: () => operation, timeout: 100 });
      await clock.tickAsync(100);
      expect(await pending).to.deep.equal({ error: 'timeout' });
      finish({ path: '/org/site/late.html' });
      await clock.tickAsync(0);
      expect(await pending).to.deep.equal({ error: 'timeout' });
      expect(clock.countTimers()).to.equal(0);
    });

    it('preserves rejected-operation results and clears the timer', async () => {
      expect(await timeoutWrapper({ fn: () => Promise.reject(new Error('fetch failed')) })).to.deep.equal({ error: 'bad result' });
      expect(clock.countTimers()).to.equal(0);
    });

    it('propagates synchronous callback errors without starting a timer', async () => {
      const error = new Error('invalid callback');
      let failure;
      try {
        await timeoutWrapper({ fn: () => { throw error; } });
      } catch (caught) {
        failure = caught;
      }
      expect(failure).to.equal(error);
      expect(clock.countTimers()).to.equal(0);
    });
  });
});
