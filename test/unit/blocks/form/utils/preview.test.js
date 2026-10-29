import { expect } from '@esm-bundle/chai';
import '../../../setup-nx.js';
import { getLivePreviewUrl } from '../../../../../blocks/shared/constants.js';
import { loadPreviewOrigin } from '../../../../../blocks/form/utils/preview.js';

const site = { owner: 'example', repo: 'site' };

describe('form preview origin', () => {
  let requests;
  let savedFetch;
  let savedIms;
  let savedWarn;

  beforeEach(() => {
    requests = [];
    savedFetch = window.fetch;
    savedIms = window.adobeIMS;
    savedWarn = console.warn;
    console.warn = () => {};
    window.fetch = async (href, opts) => {
      requests.push({ href: String(href), authorization: opts?.headers?.Authorization });
      return new Response('', { status: 200 });
    };
  });

  afterEach(() => {
    window.fetch = savedFetch;
    window.adobeIMS = savedIms;
    console.warn = savedWarn;
    localStorage.removeItem('nx-ims');
  });

  it('returns the live preview origin without signing in when signed out', async () => {
    expect(await loadPreviewOrigin(site)).to.equal(getLivePreviewUrl('example', 'site'));
    expect(requests).to.deep.equal([]);
  });

  it('signs in to the live preview before returning its origin', async () => {
    localStorage.setItem('nx-ims', true);
    window.adobeIMS = { getAccessToken: () => ({ token: 'token' }) };
    expect(await loadPreviewOrigin(site)).to.equal(getLivePreviewUrl('example', 'site'));
    expect(requests).to.deep.include({
      href: `${getLivePreviewUrl('example', 'site')}/gimme_cookie`,
      authorization: 'Bearer token',
    });
  });
});
