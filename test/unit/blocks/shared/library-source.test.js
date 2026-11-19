import { expect } from '@esm-bundle/chai';
import { stub } from 'sinon';
import { fetchLibrarySource } from '../../../../blocks/shared/library-source.js';

describe('library source fetching', () => {
  let savedFetch;
  let savedIMS;
  let storage;
  let calls;

  beforeEach(() => {
    savedFetch = window.fetch;
    savedIMS = window.adobeIMS;
    storage = stub(Storage.prototype, 'getItem').callThrough();
    storage.withArgs('nx-ims').returns('true');
    window.adobeIMS = { getAccessToken: () => ({ token: 'library-token' }) };
    calls = [];
    window.fetch = async (url, opts) => {
      calls.push({ url, opts });
      return new Response('');
    };
  });

  afterEach(() => {
    window.fetch = savedFetch;
    if (savedIMS === undefined) delete window.adobeIMS; else window.adobeIMS = savedIMS;
    storage.restore();
  });

  [
    'https://feat--site--org.aem.live/library/page',
    'https://feat--site--org.aem.page/library/page.html',
    'https://feat--site--org.aem.page/library/page.plain.html',
    'https://feat--site--org.hlx.page/library/page',
    'https://feat--site--org.preview.da.live/library/page',
    'https://feat--site--org.stage-preview.da.live/library/page',
    'https://content.da.live/org/site/library/page',
    'https://stage-content.da.live/org/site/library/page',
    'https://admin.da.live/source/org/site/library/page.html',
    'https://stage-admin.da.live/source/org/site/library/page.html',
    '/library/page',
  ].forEach((input) => {
    it(`loads authenticated source HTML for ${input}`, async () => {
      await fetchLibrarySource(input, { context: { org: 'org', site: 'site' } });
      expect(calls.map(({ url }) => url)).to.deep.equal([
        'https://admin.da.live/source/org/site/library/page.html',
      ]);
      expect(calls[0].opts.headers.Authorization).to.equal('Bearer library-token');
      expect(calls[0].opts.credentials).to.equal(undefined);
    });
  });

  [401, 403, 500].forEach((status) => {
    it(`does not fall back or redirect on an Admin ${status}`, async () => {
      window.fetch = async (url, opts) => {
        calls.push({ url, opts });
        return new Response('', { status });
      };
      const { resp, usedFallback } = await fetchLibrarySource('https://main--site--org.aem.live/library.json');
      expect(resp.status).to.equal(status);
      expect(usedFallback).to.be.false;
      expect(calls).to.have.lengthOf(1);
      expect(calls[0].opts.noRedirect).to.be.true;
    });
  });

  it('falls back to an AEM-only index on 404 without sending the DA bearer to AEM', async () => {
    window.fetch = async (url, opts) => {
      calls.push({ url, opts });
      return new Response('', { status: calls.length === 1 ? 404 : 200 });
    };
    const input = 'https://main--site--org.aem.live/library.json?sheet=blocks';
    const { resp, usedFallback } = await fetchLibrarySource(input);
    expect(resp.ok).to.be.true;
    expect(usedFallback).to.be.true;
    expect(calls.map(({ url }) => url)).to.deep.equal([
      'https://admin.da.live/source/org/site/library.json?sheet=blocks', input,
    ]);
    expect(calls[0].opts.headers.Authorization).to.equal('Bearer library-token');
    expect(calls[1].opts.headers.Authorization).to.equal(undefined);
    expect(calls[1].opts.credentials).to.equal(undefined);
  });
});
