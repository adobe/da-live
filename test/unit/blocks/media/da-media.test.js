/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

await import('../../../../blocks/media/da-media.js');

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('da-media', () => {
  let el;

  async function fixture(details) {
    const element = document.createElement('da-media');
    element.details = details;
    document.body.appendChild(element);
    await nextFrame();
    return element;
  }

  afterEach(() => {
    if (el && el.parentElement) el.remove();
    el = null;
  });

  it('Reads ext from details.name as the media type', async () => {
    el = await fixture({ name: 'banner.png', contentUrl: '/x.png' });
    expect(el._mediaType).to.equal('png');
  });

  it('Renders a <video> for mp4', async () => {
    el = await fixture({ name: 'movie.mp4', contentUrl: '/x.mp4' });
    expect(el.shadowRoot.querySelector('video')).to.exist;
    expect(el.shadowRoot.querySelector('source').getAttribute('type')).to.equal('video/mp4');
  });

  it('Renders the PDF placeholder for pdf', async () => {
    el = await fixture({ name: 'doc.pdf', contentUrl: '/x.pdf' });
    expect(el.shadowRoot.textContent).to.contain("I'm a PDF");
  });

  it('Renders an <img> for non-mp4/pdf media', async () => {
    el = await fixture({ name: 'image.png', contentUrl: '/x.png' });
    const img = el.shadowRoot.querySelector('img');
    expect(img).to.exist;
    expect(img.getAttribute('src')).to.equal('/x.png');
  });

  it('Sets the document title from details.name', async () => {
    el = await fixture({ name: 'doc.png', contentUrl: '/x.png' });
    expect(document.title).to.contain('View doc.png');
  });

  it('Releases blob URLs when the viewer is removed', async () => {
    const revokeObjectURL = sinon.stub(URL, 'revokeObjectURL');
    try {
      el = await fixture({ name: 'logo.svg', contentUrl: 'blob:media-test' });
      el.remove();
      expect(revokeObjectURL.calledOnceWithExactly('blob:media-test')).to.equal(true);
    } finally {
      revokeObjectURL.restore();
    }
  });

  it('Does not revoke regular media URLs when removed', async () => {
    const revokeObjectURL = sinon.stub(URL, 'revokeObjectURL');
    try {
      el = await fixture({ name: 'logo.svg', contentUrl: '/logo.svg' });
      el.remove();
      expect(revokeObjectURL.called).to.equal(false);
    } finally {
      revokeObjectURL.restore();
    }
  });
});

describe('media loading', () => {
  let init;
  let savedHash;
  let savedFetch;
  let container;
  let createObjectURL;

  before(async () => {
    ({ default: init } = await import('../../../../blocks/media/media.js'));
  });

  beforeEach(() => {
    savedHash = window.location.hash;
    savedFetch = window.fetch;
    container = document.createElement('div');
    createObjectURL = sinon.stub(URL, 'createObjectURL').returns('blob:media-test');
  });

  afterEach(() => {
    window.location.hash = savedHash;
    window.fetch = savedFetch;
    container.remove();
    sinon.restore();
  });

  ['frescopa-logo-1.svg', 'movie.mp4'].forEach((name) => {
    it(`Loads hlx6 ${name} from the authenticated source API`, async () => {
      const path = `/kptdobe/sample-content-hlx6-migrated/images/${name}`;
      const sourceUrl = `https://api.aem.live/kptdobe/sites/sample-content-hlx6-migrated/source/images/${name}`;
      const requests = [];
      window.location.hash = path;
      window.fetch = async (url) => {
        requests.push(url);
        if (url.includes('/ping/')) {
          return new Response('', { headers: { 'x-api-upgrade-available': 'true' } });
        }
        if (url === sourceUrl) return new Response('media-data');
        return new Response('', { status: 404 });
      };

      await init(container);

      expect(requests).to.include(sourceUrl);
      expect(createObjectURL.calledOnce).to.equal(true);
      expect(await createObjectURL.firstCall.args[0].text()).to.equal('media-data');
      expect(container.querySelector('da-media').details.contentUrl).to.equal('blob:media-test');
    });
  });

  it('Keeps the content URL for legacy media', async () => {
    window.location.hash = '/mediaorg/legacysite/images/logo.svg';
    window.fetch = async () => new Response('');

    await init(container);

    expect(container.querySelector('da-media').details.contentUrl)
      .to.equal('https://content.da.live/mediaorg/legacysite/images/logo.svg');
    expect(createObjectURL.called).to.equal(false);
  });

  it('Does not display an unsuccessful hlx6 response as media', async () => {
    window.location.hash = '/mediaorg/hlx6errors/images/missing.svg';
    window.fetch = async (url) => {
      if (url.includes('/ping/')) {
        return new Response('', { headers: { 'x-api-upgrade-available': 'true' } });
      }
      return new Response('Not found', { status: 404 });
    };

    let error;
    try {
      await init(container);
    } catch (err) {
      error = err;
    }

    expect(error?.message).to.equal('Could not load media: 404');
    expect(createObjectURL.called).to.equal(false);
    expect(container.querySelector('da-media')).to.equal(null);
  });
});
