import { expect } from '@esm-bundle/chai';
import { setNx, getNx2Api } from '../../../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { savePreview, sendToTarget } = await import('../../../../../../../blocks/edit/da-prepare/actions/target/utils.js');

describe('target/utils savePreview', () => {
  it('Strips the .html extension before previewing', async () => {
    const { aem } = await getNx2Api();
    const origPreview = aem.preview;
    const previewed = [];
    aem.preview = (path) => {
      previewed.push(path);
      return { ok: true, json: () => ({ preview: { url: 'https://main--site--org.aem.page/testpage' } }) };
    };

    try {
      const result = await savePreview('org', 'site', '/testpage.html');

      expect(previewed).to.deep.equal(['/org/site/testpage']);
      expect(result.preview.url).to.equal('https://main--site--org.aem.page/testpage');
    } finally {
      aem.preview = origPreview;
    }
  });

  it('Leaves extensionless paths untouched', async () => {
    const { aem } = await getNx2Api();
    const origPreview = aem.preview;
    const previewed = [];
    aem.preview = (path) => {
      previewed.push(path);
      return { ok: true, json: () => ({ preview: { url: 'https://main--site--org.aem.page/folder' } }) };
    };

    try {
      await savePreview('org', 'site', '/folder');

      expect(previewed).to.deep.equal(['/org/site/folder']);
    } finally {
      aem.preview = origPreview;
    }
  });

  it('Returns an error when the preview fails', async () => {
    const { aem } = await getNx2Api();
    const origPreview = aem.preview;
    aem.preview = () => ({ ok: false });

    try {
      const result = await savePreview('org', 'site', '/testpage.html');
      expect(result).to.deep.equal({ error: 'Couldn\'t preview.' });
    } finally {
      aem.preview = origPreview;
    }
  });
});

describe('target/utils sendToTarget', () => {
  let savedFetch;
  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => { window.fetch = savedFetch; });

  it('Fetches the previewed content through the da-etc cors proxy with a cache-buster', async () => {
    let captured;
    window.fetch = (url, opts) => {
      captured = { url, opts };
      // A locked-down preview host returns 401; the proxy relays it through.
      return Promise.resolve(new Response('access-not-allowed', { status: 401 }));
    };

    const aemPath = 'https://main--site--org.aem.page/demo';
    const result = await sendToTarget('org', 'send1', 'name', aemPath, 'Joe');

    expect(captured.url).to.contain('/cors?url=');
    expect(captured.url).to.contain(encodeURIComponent(aemPath));
    expect(captured.url).to.contain(encodeURIComponent('nocache='));
    // A 401 from the delivery host surfaces as a clean error, not a hang/throw.
    expect(result).to.deep.equal({ error: 'Could not fetch from AEM.' });
  });

  it('Falls back to an unauthenticated fetch when the site-token exchange fails', async () => {
    // In this test env initIms() resolves to undefined, so getAemSiteToken
    // rejects. sendToTarget must swallow that and still attempt the fetch
    // rather than throwing (which would leave the dialog hung).
    let captured;
    window.fetch = (url, opts) => {
      captured = { url, opts };
      return Promise.resolve(new Response('nope', { status: 401 }));
    };

    const result = await sendToTarget('org', 'send2', 'name', 'https://main--site--org.aem.page/p', 'Joe');

    // No Authorization header was attached (token exchange failed → fallback).
    expect(captured.opts?.headers?.Authorization).to.equal(undefined);
    expect(result).to.deep.equal({ error: 'Could not fetch from AEM.' });
  });
});
