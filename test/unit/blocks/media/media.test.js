import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: init } = await import('../../../../blocks/media/media.js');

const HLX_ADMIN = 'https://admin.hlx.page';
const CON_ORIGIN = 'https://content.da.live';
const PREVIEW_DOMAIN = 'preview.da.live';

function makeFetchMock({ hlx6Paths = [] } = {}) {
  return (url) => {
    if (url.startsWith(`${HLX_ADMIN}/ping/`)) {
      const path = url.slice(`${HLX_ADMIN}/ping`.length);
      const headers = new Headers();
      if (hlx6Paths.some((p) => path.startsWith(p))) {
        headers.set('x-api-upgrade-available', 'true');
      }
      return Promise.resolve(new Response('', { status: 200, headers }));
    }
    if (url.includes('.gimme_cookie')) {
      return Promise.resolve(new Response('', { status: 200 }));
    }
    return Promise.resolve(new Response('', { status: 404 }));
  };
}

describe('media init', () => {
  let el;
  let savedFetch;

  beforeEach(() => {
    savedFetch = window.fetch;
    el = document.createElement('div');
    document.body.appendChild(el);
  });

  afterEach(() => {
    window.fetch = savedFetch;
    el.remove();
  });

  it('rewrites contentUrl to preview.da.live for hlx6 image repos', async () => {
    window.fetch = makeFetchMock({ hlx6Paths: ['/rofe/media-hlx6a'] });
    history.pushState(null, '', '/media#/rofe/media-hlx6a/photo.png');

    await init(el);

    const daMedia = el.querySelector('da-media');
    expect(daMedia).to.exist;
    expect(daMedia.details.contentUrl).to.equal(`https://main--media-hlx6a--rofe.${PREVIEW_DOMAIN}/photo.png`);
  });

  it('keeps content.da.live contentUrl for non-hlx6 repos', async () => {
    window.fetch = makeFetchMock({ hlx6Paths: [] });
    history.pushState(null, '', '/media#/rofe/media-legacy1/photo.png');

    await init(el);

    const daMedia = el.querySelector('da-media');
    expect(daMedia).to.exist;
    expect(daMedia.details.contentUrl).to.include(CON_ORIGIN);
    expect(daMedia.details.contentUrl).to.not.include(PREVIEW_DOMAIN);
  });

  it('uses different contentUrl object for hlx6 to avoid mutating pathDetails cache', async () => {
    window.fetch = makeFetchMock({ hlx6Paths: ['/rofe/media-hlx6b'] });
    history.pushState(null, '', '/media#/rofe/media-hlx6b/img.jpg');

    await init(el);

    const daMedia = el.querySelector('da-media');
    const daTitle = el.querySelector('da-title');
    expect(daMedia.details).to.not.equal(daTitle.details);
    expect(daMedia.details.contentUrl).to.include(PREVIEW_DOMAIN);
    expect(daTitle.details.contentUrl).to.include(CON_ORIGIN);
  });
});
