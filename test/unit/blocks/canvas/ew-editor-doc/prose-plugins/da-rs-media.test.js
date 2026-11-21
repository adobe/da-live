import { expect } from '@esm-bundle/chai';
import { createDaRsImageView, createDaRsMediaRenderer } from '../../../../../../blocks/canvas/ew-editor-doc/prose-plugins/daRsMedia.js';
import { MEDIA_PLACEHOLDER } from '../../../../../../blocks/shared/branch-selector/branch-media.js';
import { DA_ORIGIN } from '../../../../../../blocks/shared/constants.js';
import { invalidateDaRsDiscovery } from '../../../../../../blocks/shared/da-rs-provider.js';

describe('bound Canvas media', () => {
  let originalUrl;
  let originalFetch;
  let createObjectURL;
  let revokeObjectURL;
  beforeEach(() => {
    originalUrl = window.location.href;
    originalFetch = window.fetch;
    createObjectURL = URL.createObjectURL;
    revokeObjectURL = URL.revokeObjectURL;
    const url = new URL(originalUrl);
    url.searchParams.set('da-source', 'da-rs');
    url.hash = '#/demo/work/page';
    window.history.replaceState(null, '', url);
    invalidateDaRsDiscovery();
  });
  afterEach(() => {
    window.fetch = originalFetch;
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    window.history.replaceState(null, '', originalUrl);
    invalidateDaRsDiscovery();
  });

  it('does not expose authored remote URLs or CSS to the browser', () => {
    const type = {};
    const image = createDaRsImageView({
      type,
      attrs: { src: 'https://outside.test/image.png', style: 'background:url(https://outside.test/track)' },
    });
    expect(image.dom.getAttribute('src')).to.equal(MEDIA_PLACEHOLDER);
    expect(image.dom.hasAttribute('style')).to.equal(false);
    expect(image.dom.dataset.daRsSource).to.equal('https://outside.test/image.png');
  });

  it('loads portable media from authenticated bound Source and releases its blob URL', async () => {
    const calls = [];
    window.fetch = async (url, opts) => {
      calls.push({ url, opts });
      if (url.includes('/ping/')) return new Response('', { headers: { 'x-api-upgrade-available': 'true' } });
      return new Response('png', { headers: { 'Content-Type': 'image/png' } });
    };
    let done;
    const loaded = new Promise((resolve) => { done = resolve; });
    let revoked;
    URL.createObjectURL = () => {
      done();
      return 'blob:local-image';
    };
    URL.revokeObjectURL = (url) => { revoked = url; };
    const image = createDaRsImageView({ type: {}, attrs: { src: './media_abc.png' } });
    const dom = document.createElement('div');
    dom.append(image.dom);
    const renderer = createDaRsMediaRenderer({ org: 'demo', repo: 'work', path: 'demo/work/page' });
    renderer.update({ dom });
    await loaded;
    expect(image.dom.getAttribute('src')).to.equal('blob:local-image');
    expect(calls[1].url).to.equal(`${DA_ORIGIN}/demo/sites/work/source/media_abc.png`);
    expect(calls[1].opts.redirect).to.equal('error');
    renderer.destroy();
    expect(revoked).to.equal('blob:local-image');
    expect(image.dom.getAttribute('src')).to.equal(MEDIA_PLACEHOLDER);
  });
});
