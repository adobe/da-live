/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';

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
});
