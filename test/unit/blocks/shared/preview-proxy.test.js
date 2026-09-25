import { expect } from '@esm-bundle/chai';
import { ensurePreviewProxySession, getPreviewProxyDetails, toPreviewProxyUrl } from '../../../../blocks/shared/preview-proxy.js';

describe('getPreviewProxyDetails', () => {
  it('rewrites a relative path using fallback org/site/branch', () => {
    const details = getPreviewProxyDetails('/tools/plugins/tool/index.html', { org: 'org', site: 'site', branch: 'feat' });
    expect(details.url).to.equal('https://feat--site--org.preview.da.live/tools/plugins/tool/index.html');
    expect(details.org).to.equal('org');
    expect(details.site).to.equal('site');
    expect(details.branch).to.equal('feat');
    expect(details.pathname).to.equal('/tools/plugins/tool/index.html');
  });

  it('defaults branch to main when no fallback branch is given', () => {
    const details = getPreviewProxyDetails('/x', { org: 'org', site: 'site' });
    expect(details.url).to.equal('https://main--site--org.preview.da.live/x');
  });

  it('returns the raw input for a relative path with no org/site fallback', () => {
    const details = getPreviewProxyDetails('/tools/plugins/tool/index.html');
    expect(details.url).to.equal('/tools/plugins/tool/index.html');
    expect(details.org).to.be.undefined;
  });

  it('rewrites an aem.live URL, preserving query and hash', () => {
    const details = getPreviewProxyDetails('https://main--site--org.aem.live/path?a=1#frag');
    expect(details.url).to.equal('https://main--site--org.preview.da.live/path?a=1#frag');
    expect(details.org).to.equal('org');
    expect(details.site).to.equal('site');
    expect(details.branch).to.equal('main');
  });

  it('rewrites an aem.page URL', () => {
    const details = getPreviewProxyDetails('https://feat--site--org.aem.page/path');
    expect(details.url).to.equal('https://feat--site--org.preview.da.live/path');
  });

  it('rewrites an hlx.live URL', () => {
    const details = getPreviewProxyDetails('https://feat--site--org.hlx.live/path');
    expect(details.url).to.equal('https://feat--site--org.preview.da.live/path');
  });

  it('rewrites an hlx.page URL', () => {
    const details = getPreviewProxyDetails('https://feat--site--org.hlx.page/path');
    expect(details.url).to.equal('https://feat--site--org.preview.da.live/path');
  });

  it('parses an already-proxied preview.da.live URL', () => {
    const details = getPreviewProxyDetails('https://main--site--org.preview.da.live/path');
    expect(details.org).to.equal('org');
    expect(details.site).to.equal('site');
    expect(details.branch).to.equal('main');
    expect(details.pathname).to.equal('/path');
  });

  it('parses an already-proxied stage-preview.da.live URL', () => {
    const details = getPreviewProxyDetails('https://main--site--org.stage-preview.da.live/path');
    expect(details.org).to.equal('org');
    expect(details.site).to.equal('site');
    expect(details.branch).to.equal('main');
  });

  it('rewrites a content.da.live URL', () => {
    const details = getPreviewProxyDetails('https://content.da.live/org/site/path/to/page?a=1', { branch: 'feat' });
    expect(details.url).to.equal('https://feat--site--org.preview.da.live/path/to/page?a=1');
    expect(details.org).to.equal('org');
    expect(details.site).to.equal('site');
  });

  it('rewrites an admin.da.live URL', () => {
    const details = getPreviewProxyDetails('https://admin.da.live/source/org/site/path/to/page', { branch: 'feat' });
    expect(details.url).to.equal('https://feat--site--org.preview.da.live/path/to/page');
    expect(details.org).to.equal('org');
    expect(details.site).to.equal('site');
  });

  it('uses a custom getUrl origin builder when provided', () => {
    const getUrl = (org, site, branch) => `https://${branch}--${site}--${org}.custom-domain.test`;
    const details = getPreviewProxyDetails('https://main--site--org.aem.live/path?a=1', { getUrl });
    expect(details.url).to.equal('https://main--site--org.custom-domain.test/path?a=1');
  });

  it('returns the raw input for a hash-only reference', () => {
    expect(getPreviewProxyDetails('#S2_Icon_Foo').url).to.equal('#S2_Icon_Foo');
  });

  it('returns the raw input for an svg fragment reference', () => {
    expect(getPreviewProxyDetails('/icons/foo.svg#icon').url).to.equal('/icons/foo.svg#icon');
  });

  it('returns the raw input for non-string or empty input', () => {
    expect(getPreviewProxyDetails(undefined).url).to.be.undefined;
    expect(getPreviewProxyDetails('').url).to.equal('');
  });

  it('returns the raw input for an unrecognized absolute URL', () => {
    const details = getPreviewProxyDetails('https://example.com/path');
    expect(details.url).to.equal('https://example.com/path');
  });

  it('returns the raw input for an unparsable URL', () => {
    const details = getPreviewProxyDetails('not a url');
    expect(details.url).to.equal('not a url');
  });
});

describe('toPreviewProxyUrl', () => {
  it('returns just the rewritten url', () => {
    const url = toPreviewProxyUrl('https://main--site--org.aem.live/path');
    expect(url).to.equal('https://main--site--org.preview.da.live/path');
  });
});

describe('ensurePreviewProxySession', () => {
  let savedAdobeIMS;
  let savedFetch;

  beforeEach(() => {
    savedAdobeIMS = window.adobeIMS;
    savedFetch = window.fetch;
  });

  afterEach(() => {
    window.fetch = savedFetch;
    if (savedAdobeIMS === undefined) delete window.adobeIMS; else window.adobeIMS = savedAdobeIMS;
  });

  it('is a no-op when the url cannot be resolved to an org/site', async () => {
    window.adobeIMS = { getAccessToken: () => ({ token: 'T1' }) };
    let called = false;
    window.fetch = async () => {
      called = true;
      return new Response('', { status: 200 });
    };

    await ensurePreviewProxySession('https://example.com/path');

    expect(called).to.be.false;
  });

  it('is a no-op when there is no IMS token', async () => {
    delete window.adobeIMS;
    let called = false;
    window.fetch = async () => {
      called = true;
      return new Response('', { status: 200 });
    };

    await ensurePreviewProxySession('https://main--site--org.aem.live/path');

    expect(called).to.be.false;
  });

  it('authenticates the origin resolved from an absolute AEM URL', async () => {
    window.adobeIMS = { getAccessToken: () => ({ token: 'T1' }) };
    const calls = [];
    window.fetch = async (url, opts) => {
      calls.push({ url, headers: opts?.headers });
      return new Response('', { status: 200 });
    };

    await ensurePreviewProxySession('https://feat--site--org.aem.live/path');

    expect(calls).to.have.lengthOf(1);
    expect(calls[0].url).to.equal('https://feat--site--org.preview.da.live/gimme_cookie');
    expect(calls[0].headers.Authorization).to.equal('Bearer T1');
  });

  it('authenticates a relative path using fallback org/site/branch', async () => {
    window.adobeIMS = { getAccessToken: () => ({ token: 'T1' }) };
    const calls = [];
    window.fetch = async (url) => {
      calls.push(url);
      return new Response('', { status: 200 });
    };

    await ensurePreviewProxySession('/tools/plugins/tool/index.html', { org: 'org', site: 'site', branch: 'feat' });

    expect(calls).to.deep.equal(['https://feat--site--org.preview.da.live/gimme_cookie']);
  });

  it('is a no-op for a relative path with no org/site fallback', async () => {
    window.adobeIMS = { getAccessToken: () => ({ token: 'T1' }) };
    let called = false;
    window.fetch = async () => {
      called = true;
      return new Response('', { status: 200 });
    };

    await ensurePreviewProxySession('/tools/plugins/tool/index.html');

    expect(called).to.be.false;
  });

  it('uses a custom getUrl origin builder when provided', async () => {
    window.adobeIMS = { getAccessToken: () => ({ token: 'T1' }) };
    const calls = [];
    window.fetch = async (url) => {
      calls.push(url);
      return new Response('', { status: 200 });
    };
    const getUrl = (org, site, branch) => `https://${branch}--${site}--${org}.stage-preview.da.live`;

    await ensurePreviewProxySession('https://feat--site--org.aem.live/path', { getUrl });

    expect(calls).to.deep.equal(['https://feat--site--org.stage-preview.da.live/gimme_cookie']);
  });
});
