import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: init } = await import('../../../../blocks/media/media.js');

const AEM_API = 'https://api.aem.live';
const HLX_ADMIN = 'https://admin.hlx.page';
const BLOB_URL = 'blob:hlx6-media';

function makeFetchMock({ hlx6Paths = [] } = {}) {
  const calls = [];

  const fetchMock = (url) => {
    const requestUrl = url.toString();
    calls.push(requestUrl);

    if (requestUrl.startsWith(`${HLX_ADMIN}/ping/`)) {
      const path = requestUrl.slice(`${HLX_ADMIN}/ping`.length);
      const headers = new Headers();
      if (hlx6Paths.some((candidate) => path.startsWith(candidate))) {
        headers.set('x-api-upgrade-available', 'true');
      }
      return Promise.resolve(new Response('', { status: 200, headers }));
    }

    if (requestUrl.startsWith(AEM_API)) {
      return Promise.resolve(new Response(new Blob(['image'], { type: 'image/png' }), { status: 200 }));
    }

    return Promise.resolve(new Response('', { status: 404 }));
  };

  return { calls, fetchMock };
}

describe('media init', () => {
  let el;
  let savedFetch;
  let savedCreateObjectURL;

  beforeEach(() => {
    savedFetch = window.fetch;
    savedCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = () => BLOB_URL;
    el = document.createElement('div');
    document.body.appendChild(el);
  });

  afterEach(() => {
    window.fetch = savedFetch;
    URL.createObjectURL = savedCreateObjectURL;
    localStorage.removeItem('hlx6-upgrade');
    el.remove();
  });

  async function expectHlx6MediaUrl(path) {
    const { calls, fetchMock } = makeFetchMock({ hlx6Paths: ['/rofe/media-hlx6'] });
    window.fetch = fetchMock;
    history.pushState(null, '', `/media#/rofe/media-hlx6/${path}`);

    await init(el);

    const daMedia = el.querySelector('da-media');
    const daTitle = el.querySelector('da-title');
    expect(daMedia).to.exist;
    expect(daMedia.details.contentUrl).to.equal(BLOB_URL);
    expect(daMedia.details).to.not.equal(daTitle.details);
    expect(calls).to.include(`${AEM_API}/rofe/sites/media-hlx6/source/${path}`);
  }

  it('loads HLX6 images through the source API', async () => {
    await expectHlx6MediaUrl('photo.png');
  });

  it('loads HLX6 videos through the source API', async () => {
    await expectHlx6MediaUrl('movie.mp4');
  });
});
