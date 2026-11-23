import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../scripts/utils.js';
import { DA_ORIGIN } from '../../../../blocks/shared/constants.js';
import { invalidateDaRsDiscovery } from '../../../../blocks/shared/da-rs-provider.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
const { default: init } = await import('../../../../blocks/media/media.js');

const NATIVE_CAPS = {
  apiVersion: 1,
  transport: 'helix6',
  contentProfile: 'native-da',
  readOnly: false,
  openKinds: ['page', 'sheet', 'image', 'asset'],
  collaboration: true,
  branching: true,
  generation: null,
};

describe('bound standalone media', () => {
  let originalUrl;
  let originalFetch;
  let originalCreate;
  let calls;
  beforeEach(() => {
    originalUrl = window.location.href;
    originalFetch = window.fetch;
    originalCreate = URL.createObjectURL;
    window.history.replaceState(null, '', '/media?da-source=da-rs#/demo/work/pic.png');
    invalidateDaRsDiscovery();
    calls = [];
    URL.createObjectURL = () => 'blob:bound-media';
  });
  afterEach(() => {
    window.fetch = originalFetch;
    URL.createObjectURL = originalCreate;
    window.history.replaceState(null, '', originalUrl);
    invalidateDaRsDiscovery();
  });

  [true, false].forEach((upgraded) => {
    it(`loads ${upgraded ? 'H6' : 'legacy'} media from the bound Source origin`, async () => {
      window.fetch = async (target, options) => {
        calls.push({ target, options });
        if (target.includes('/ping/')) {
          return new Response('', { headers: upgraded ? { 'x-api-upgrade-available': 'true' } : {} });
        }
        if (target.endsWith('/source-capabilities')) return Response.json(NATIVE_CAPS);
        return new Response('png', { headers: { 'Content-Type': 'image/png' } });
      };
      const el = document.createElement('div');
      await init(el);
      const expected = upgraded ? '/demo/sites/work/source/pic.png' : '/source/demo/work/pic.png';
      expect(calls.map(({ target }) => target)).to.deep.equal([
        `${DA_ORIGIN}/ping/demo/work`,
        ...(upgraded ? [`${DA_ORIGIN}/demo/sites/work/source-capabilities`] : []),
        `${DA_ORIGIN}${expected}`,
      ]);
      expect(el.querySelector('da-media').details.contentUrl).to.equal('blob:bound-media');
    });
  });

  it('refuses non-image media bytes without falling back to delivery', async () => {
    window.fetch = async (target) => {
      calls.push(target);
      if (target.includes('/ping/')) return new Response('', { headers: { 'x-api-upgrade-available': 'true' } });
      if (target.endsWith('/source-capabilities')) return Response.json(NATIVE_CAPS);
      return new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } });
    };
    let failed = false;
    try { await init(document.createElement('div')); } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
    expect(calls).to.have.length(3);
  });
});

describe('imported standalone media', () => {
  const IMPORTED = {
    apiVersion: 1,
    transport: 'helix6',
    contentProfile: 'aem-import',
    readOnly: true,
    openKinds: ['image', 'sheet'],
    collaboration: false,
    branching: false,
    generation: 'g-test',
  };
  let originalUrl;
  let originalFetch;
  let originalRevoke;
  let calls;
  let revoked;

  const stub = (kind = 'image', type = 'image/png', status = 200, body = 'bytes') => async (target) => {
    calls.push(target);
    if (target.includes('/ping/')) return new Response('', { headers: { 'x-api-upgrade-available': 'true' } });
    if (target.endsWith('/source-capabilities')) return Response.json(IMPORTED);
    if (target.startsWith('/blocks/edit/img/') && target.endsWith('.svg')) {
      return new Response('<svg xmlns="http://www.w3.org/2000/svg"/>');
    }
    return new Response(body, { status, headers: { 'Content-Type': type, 'X-DA-Source-Kind': kind } });
  };

  beforeEach(() => {
    originalUrl = window.location.href;
    originalFetch = window.fetch;
    originalRevoke = URL.revokeObjectURL;
    calls = [];
    revoked = [];
    URL.revokeObjectURL = (url) => {
      revoked.push(url);
      originalRevoke.call(URL, url);
    };
    invalidateDaRsDiscovery();
  });
  afterEach(() => {
    window.fetch = originalFetch;
    URL.revokeObjectURL = originalRevoke;
    window.history.replaceState(null, '', originalUrl);
    invalidateDaRsDiscovery();
  });

  const open = (hash) => {
    window.history.replaceState(null, '', `/media?da-source=da-rs#${hash}`);
    const el = document.createElement('div');
    return init(el).then(() => el);
  };

  it('opens an imported image read-only and revokes its object URL', async () => {
    window.fetch = stub('image', 'image/svg+xml', 200, '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
    const el = await open('/demo/wknd/hero.svg');
    document.body.append(el);
    try {
      const media = el.querySelector('da-media');
      await media.updateComplete;
      expect(el.querySelector('da-title').readOnly).to.equal(true);
      const { contentUrl } = media.details;
      expect(contentUrl).to.match(/^blob:/);
      expect(media.shadowRoot.querySelector('img').src).to.equal(contentUrl);
      expect(revoked).to.deep.equal([]);
      media.remove();
      expect(revoked).to.deep.equal([contentUrl]);
    } finally {
      el.remove();
    }
  });

  it('refuses a branch-qualified imported image without fetching its bytes', async () => {
    window.fetch = stub();
    const el = await open('/demo/wknd~draft/hero.png');
    expect(el.querySelector('[role="alert"]')).to.exist;
    expect(el.querySelector('da-media')).to.equal(null);
    expect(calls).to.deep.equal([
      `${DA_ORIGIN}/ping/demo/wknd`, `${DA_ORIGIN}/demo/sites/wknd/source-capabilities`,
    ]);
  });

  it('requests the original imported image using the bound provider and one URL encoding', async () => {
    window.fetch = stub('image', 'image/jpeg');
    const el = await open('/demo/wknd/machine%20_96017153.jpeg');
    expect(calls).to.deep.equal([
      `${DA_ORIGIN}/ping/demo/wknd`,
      `${DA_ORIGIN}/demo/sites/wknd/source-capabilities`,
      `${DA_ORIGIN}/demo/sites/wknd/source/machine%20_96017153.jpeg`,
    ]);
    expect(window.location.search).to.equal('?da-source=da-rs');
    expect(el.querySelector('da-title').readOnly).to.equal(true);
    const { details } = el.querySelector('da-media');
    expect(details.fullpath).to.equal('/demo/wknd/machine _96017153.jpeg');
    URL.revokeObjectURL(details.contentUrl);
  });

  it('rejects traversal before any provider request on an imported media deep link', async () => {
    window.fetch = stub();
    let error;
    try {
      await open('/demo/wknd/%2e%2e/machine%20_96017153.jpeg');
    } catch (err) {
      error = err;
    }
    expect(error).to.be.instanceOf(TypeError);
    expect(calls).to.deep.equal([]);
  });

  ['guide.pdf', 'clip.mp4', 'doc.html'].forEach((name) => {
    it(`refuses ${name} without fetching its bytes`, async () => {
      window.fetch = stub();
      const el = await open(`/demo/wknd/${name}`);
      expect(el.querySelector('[role="alert"]')).to.exist;
      expect(el.querySelector('da-media')).to.equal(null);
      expect(calls.some((target) => target.includes('/source/'))).to.equal(false);
    });
  });

  it('does not render an unsupported open response as an image', async () => {
    window.fetch = stub('page', 'text/html', 409);
    let failed = false;
    try {
      await open('/demo/wknd/hero.png');
    } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
  });

  it('rejects an image response with a mismatched kind', async () => {
    window.fetch = stub('asset', 'image/png');
    let failed = false;
    try {
      await open('/demo/wknd/hero.png');
    } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
  });
});
