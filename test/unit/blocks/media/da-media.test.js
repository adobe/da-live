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
  let addEventListener;
  let observer;

  function setHash(path) {
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${path}`);
  }

  before(async () => {
    ({ default: init } = await import('../../../../blocks/media/media.js'));
  });

  beforeEach(() => {
    savedHash = window.location.hash;
    savedFetch = window.fetch;
    container = document.createElement('div');
    createObjectURL = sinon.stub(URL, 'createObjectURL').returns('blob:media-test');
    addEventListener = sinon.spy(window, 'addEventListener');
  });

  afterEach(() => {
    addEventListener.getCalls()
      .filter(({ args }) => args[0] === 'hashchange')
      .forEach(({ args }) => window.removeEventListener(...args));
    observer?.disconnect();
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}${savedHash}`);
    window.fetch = savedFetch;
    container.remove();
    sinon.restore();
  });

  function navigate(path) {
    return new Promise((resolve) => {
      observer = new MutationObserver(() => {
        observer.disconnect();
        resolve();
      });
      observer.observe(container, { childList: true });
      window.location.hash = path;
    });
  }

  ['frescopa-logo-1.svg', 'movie.mp4'].forEach((name) => {
    it(`Loads hlx6 ${name} from the authenticated source API`, async () => {
      const path = `/kptdobe/sample-content-hlx6-migrated/images/${name}`;
      const sourceUrl = `https://api.aem.live/kptdobe/sites/sample-content-hlx6-migrated/source/images/${name}`;
      const requests = [];
      setHash(path);
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
    setHash('/mediaorg/legacysite/images/logo.svg');
    window.fetch = async () => new Response('');

    await init(container);

    expect(container.querySelector('da-media').details.contentUrl)
      .to.equal('https://content.da.live/mediaorg/legacysite/images/logo.svg');
    expect(createObjectURL.called).to.equal(false);
  });

  it('Replaces the image and title when the hash changes without reloading', async () => {
    setHash('/mediaorg/legacysite/images/first.svg');
    window.fetch = async () => new Response('');
    await init(container);
    const firstMedia = container.querySelector('da-media');

    await navigate('/mediaorg/legacysite/images/second.png');

    const media = container.querySelector('da-media');
    expect(media).not.to.equal(firstMedia);
    expect(media.details.contentUrl)
      .to.equal('https://content.da.live/mediaorg/legacysite/images/second.png');
    expect(container.querySelector('da-title').details.name).to.equal('second.png');
    expect(container.children.length).to.equal(2);

    document.body.appendChild(media);
    await media.updateComplete;
    expect(media.shadowRoot.querySelector('img').getAttribute('src'))
      .to.equal('https://content.da.live/mediaorg/legacysite/images/second.png');
    expect(document.title).to.equal('View second.png - Experience Workspace');
    media.remove();
  });

  it('Loads the new authenticated image and releases the previous blob on navigation', async () => {
    const revokeObjectURL = sinon.stub(URL, 'revokeObjectURL');
    createObjectURL.onSecondCall().returns('blob:second-image');
    setHash('/mediaorg/hlx6navigation/images/first.svg');
    const requests = [];
    window.fetch = async (url) => {
      requests.push(url);
      if (url.includes('/ping/')) {
        return new Response('', { headers: { 'x-api-upgrade-available': 'true' } });
      }
      return new Response('media-data');
    };
    await init(container);
    sinon.stub(customElements.get('da-title').prototype, 'update');
    document.body.appendChild(container);

    await navigate('/mediaorg/hlx6navigation/images/second.png');

    expect(requests)
      .to.include('https://api.aem.live/mediaorg/sites/hlx6navigation/source/images/second.png');
    expect(container.querySelector('da-media').details.contentUrl).to.equal('blob:second-image');
    expect(revokeObjectURL.calledOnceWithExactly('blob:media-test')).to.equal(true);
  });

  it('Switches between image and video viewers on hash navigation', async () => {
    setHash('/mediaorg/legacysite/images/first.svg');
    window.fetch = async () => new Response('');
    sinon.stub(customElements.get('da-title').prototype, 'update');
    await init(container);
    document.body.appendChild(container);

    await navigate('/mediaorg/legacysite/videos/movie.mp4');
    let media = container.querySelector('da-media');
    await media.updateComplete;
    expect(media.shadowRoot.querySelector('video source').getAttribute('src'))
      .to.equal('https://content.da.live/mediaorg/legacysite/videos/movie.mp4');
    expect(document.title).to.equal('View movie.mp4 - Experience Workspace');

    await navigate('/mediaorg/legacysite/images/second.png');
    media = container.querySelector('da-media');
    await media.updateComplete;
    expect(media.shadowRoot.querySelector('video')).to.equal(null);
    expect(media.shadowRoot.querySelector('img').getAttribute('src'))
      .to.equal('https://content.da.live/mediaorg/legacysite/images/second.png');
  });

  it('Does not let an older image request replace a newer navigation', async () => {
    setHash('/mediaorg/hlx6race/images/first.svg');
    let resolveSlowResponse;
    window.fetch = async (url) => {
      if (url.includes('/ping/')) {
        return new Response('', { headers: { 'x-api-upgrade-available': 'true' } });
      }
      if (url.endsWith('/slow.svg')) {
        return new Promise((resolve) => { resolveSlowResponse = resolve; });
      }
      return new Response('media-data');
    };
    await init(container);
    const onHashChange = addEventListener.getCalls()
      .find(({ args }) => args[0] === 'hashchange').args[1];

    setHash('/mediaorg/hlx6race/images/slow.svg');
    const slowLoad = onHashChange();
    await nextFrame();
    expect(resolveSlowResponse).to.be.a('function');
    await navigate('/mediaorg/hlx6race/images/latest.png');
    const latestMedia = container.querySelector('da-media');

    resolveSlowResponse(new Response('older-media-data'));
    await slowLoad;

    expect(container.querySelector('da-media')).to.equal(latestMedia);
    expect(latestMedia.details.name).to.equal('latest.png');
    expect(container.querySelector('da-title').details.name).to.equal('latest.png');
    expect(createObjectURL.callCount).to.equal(2);
  });

  it('Switches between image and PDF viewers on hash navigation', async () => {
    const savedAdobeDC = window.AdobeDC;
    const savedStyleSheets = document.adoptedStyleSheets;
    const previewFile = sinon.stub();
    const previewed = new Promise((resolve) => { previewFile.callsFake(resolve); });
    window.AdobeDC = { View: sinon.stub().returns({ previewFile }) };
    try {
      setHash('/mediaorg/hlx6pdfnavigation/images/first.svg');
      window.fetch = async (url) => {
        if (url.includes('/ping/')) {
          return new Response('', { headers: { 'x-api-upgrade-available': 'true' } });
        }
        return new Response('media-data');
      };
      await init(container);

      await navigate('/mediaorg/hlx6pdfnavigation/docs/document.pdf');
      await previewed;
      expect(container.querySelector('da-media')).to.equal(null);
      expect(container.querySelector('#da-pdf-viewer')).to.exist;
      expect(previewFile.firstCall.args[0].metaData.fileName).to.equal('document.pdf');

      await navigate('/mediaorg/hlx6pdfnavigation/images/second.png');
      expect(container.querySelector('#da-pdf-viewer')).to.equal(null);
      expect(container.querySelector('da-media').details.name).to.equal('second.png');
      expect(container.children.length).to.equal(2);
    } finally {
      if (savedAdobeDC === undefined) delete window.AdobeDC;
      else window.AdobeDC = savedAdobeDC;
      document.adoptedStyleSheets = savedStyleSheets;
    }
  });

  it('Does not display an unsuccessful hlx6 response as media', async () => {
    setHash('/mediaorg/hlx6errors/images/missing.svg');
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
