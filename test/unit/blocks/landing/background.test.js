import { expect } from '@esm-bundle/chai';
import '../../setup-nx.js';
import init from '../../../../blocks/landing/landing.js';

describe('landing background with Content', () => {
  let el;
  let container;

  beforeEach(() => {
    el = document.createElement('div');
    el.className = 'browse';
    container = document.createElement('div');
    container.innerHTML = '<div class="section"><div class="block-content"></div></div>';
    container.querySelector('.block-content').append(el);
    el.innerHTML = '<picture><img alt="Old background"></picture>';
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('replaces authored content with Landing inside a landing surface', async () => {
    const content = init(el);
    await content.updateComplete;
    expect(el.children.length).to.equal(1);
    expect(el.firstElementChild.className).to.equal('landing');
    expect(el.firstElementChild.firstElementChild).to.equal(content);
    expect(content.shadowRoot.querySelector('#welcome-heading').textContent).to.equal('Welcome to Experience Workspace');
    expect(el.querySelector('img, picture')).to.equal(null);
  });

  it('reuses the prepainted landing surface when mounting Content', async () => {
    const surface = document.createElement('div');
    surface.className = 'landing';
    el.replaceChildren(surface);
    const content = init(el);
    await content.updateComplete;
    expect(el.firstElementChild).to.equal(surface);
    expect(surface.children.length).to.equal(1);
    expect(surface.firstElementChild).to.equal(content);
  });
});
