/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx, getNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { hashChange } = await import(`${getNx()}/utils/utils.js`);
await import('../../../../../blocks/canvas/ew-panel-extensions/ew-panel-extensions.js');

const nextUpdate = () => new Promise((resolve) => { setTimeout(resolve); });

describe('ew-panel-extension page context', () => {
  let el;

  beforeEach(() => {
    hashChange._set({ org: 'example-org', site: 'example-site', path: 'page-a' });
    el = document.createElement('ew-panel-extension');
    el._handlePluginLoad = () => {};
  });

  afterEach(() => {
    el.remove();
    hashChange._set({});
  });

  it('remounts a configured extension iframe when the page path changes', async () => {
    el.extension = {
      name: 'configured-tool',
      title: 'Configured tool',
      sources: ['about:blank'],
    };
    document.body.append(el);
    await nextUpdate();
    const first = el.shadowRoot.querySelector('iframe');

    hashChange._set({ org: 'example-org', site: 'example-site', path: 'page-b' });
    await nextUpdate();

    const second = el.shadowRoot.querySelector('iframe');
    expect(second).to.exist;
    expect(second).to.not.equal(first);
  });

  it('retains a first-party extension element when the page path changes', async () => {
    el.extension = {
      name: 'templates',
      title: 'Templates',
      ootb: true,
      sources: [],
    };
    document.body.append(el);
    await nextUpdate();
    const first = el.shadowRoot.querySelector('ew-panel-library');

    hashChange._set({ org: 'example-org', site: 'example-site', path: 'page-b' });
    await nextUpdate();

    expect(el.shadowRoot.querySelector('ew-panel-library')).to.equal(first);
  });

  it('mounts configured extension iframes through the DA preview proxy', async () => {
    el.extension = {
      name: 'configured-tool',
      title: 'Configured tool',
      sources: ['https://main--example-site--example-org.aem.live/tools/plugins/tool/index.html'],
    };
    document.body.append(el);
    await nextUpdate();
    await nextUpdate();

    const iframe = el.shadowRoot.querySelector('iframe');
    expect(iframe).to.exist;
    expect(iframe.getAttribute('src')).to.equal('https://main--example-site--example-org.stage-preview.da.live/tools/plugins/tool/index.html');
  });

  it('authenticates the same preview proxy origin the iframe loads', async () => {
    const savedAdobeIMS = window.adobeIMS;
    window.adobeIMS = { getAccessToken: () => ({ token: 'T1' }) };
    const savedFetch = window.fetch;
    const cookieRequests = [];
    window.fetch = async (url, opts) => {
      if (typeof url === 'string' && url.includes('/gimme_cookie')) {
        cookieRequests.push(url);
        return new Response('', { status: 200 });
      }
      return savedFetch(url, opts);
    };

    el.extension = {
      name: 'configured-tool',
      title: 'Configured tool',
      sources: ['https://main--example-site--example-org.aem.live/tools/plugins/tool/index.html'],
    };
    document.body.append(el);

    try {
      await nextUpdate();
      await nextUpdate();
    } finally {
      window.fetch = savedFetch;
      if (savedAdobeIMS === undefined) delete window.adobeIMS; else window.adobeIMS = savedAdobeIMS;
    }

    expect(cookieRequests.length).to.be.greaterThan(0);
    cookieRequests.forEach((url) => {
      expect(url).to.equal('https://main--example-site--example-org.stage-preview.da.live/gimme_cookie');
    });
  });
});
