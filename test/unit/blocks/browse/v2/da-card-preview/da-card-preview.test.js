/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

await import('../../../../../../blocks/browse/v2/da-card-preview/da-card-preview.js');

describe('da-card-preview', () => {
  let el;
  let OriginalObserver;
  let trigger;

  beforeEach(() => {
    OriginalObserver = window.IntersectionObserver;
    window.IntersectionObserver = class {
      constructor(callback) { trigger = callback; }

      observe() { }

      disconnect() { }
    };
  });

  afterEach(() => {
    window.IntersectionObserver = OriginalObserver;
    el?.remove();
  });

  async function fixture(props) {
    el = document.createElement('da-card-preview');
    Object.assign(el, props);
    document.body.append(el);
    await el.updateComplete;
  }

  it('Renders the type icon for non-image files', async () => {
    await fixture({ ext: 'json', path: '/o/s/a.json' });
    expect(el.shadowRoot.querySelector('svg use')).to.exist;
    expect(el._imageObserver).to.be.undefined;
  });

  it('Shows a spinner when busy', async () => {
    await fixture({ ext: 'png', path: '/o/s/a.png', busy: true });
    expect(el.shadowRoot.querySelector('.spinner')).to.exist;
    expect(el.shadowRoot.querySelector('svg')).to.be.null;
  });

  it('Loads the image only once visible', async () => {
    await fixture({ ext: 'png', path: '/o/s/a.png' });
    let loaded = 0;
    el.loadImage = () => { loaded += 1; };
    trigger([{ isIntersecting: false }]);
    expect(loaded).to.equal(0);
    trigger([{ isIntersecting: true }]);
    expect(loaded).to.equal(1);
  });

  it('Shows the image and falls back to the icon on error without retrying', async () => {
    await fixture({ ext: 'png', path: '/o/s/a.png' });
    el._imageRequested = true;
    el._imageUrl = 'blob:preview';
    await el.updateComplete;
    const img = el.shadowRoot.querySelector('img');
    expect(img.getAttribute('src')).to.equal('blob:preview');
    img.dispatchEvent(new Event('error'));
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('img')).to.be.null;
    expect(el.shadowRoot.querySelector('svg')).to.exist;
  });

  it('Resets the image when the path changes', async () => {
    await fixture({ ext: 'png', path: '/o/s/a.png' });
    el._imageRequested = true;
    el._imageUrl = 'blob:preview';
    el.path = '/o/s/b.png';
    await el.updateComplete;
    expect(el._imageUrl).to.be.null;
    expect(el._imageRequested).to.be.false;
  });
});
