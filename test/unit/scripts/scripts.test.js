import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { decorateArea } = await import('../../../scripts/scripts.js');

describe('decorateArea', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    window.location.hash = '';
  });

  it('eager-loads a light-background image in light-scheme', () => {
    container.classList.add('light-scheme');
    container.innerHTML = '<img alt="light-background" loading="lazy" />';
    decorateArea({ area: container });

    const img = container.querySelector('img');
    expect(img.hasAttribute('loading')).to.be.false;
    expect(img.fetchPriority).to.equal('high');
  });

  it('eager-loads a dark-background image in dark-scheme', () => {
    container.classList.add('dark-scheme');
    container.innerHTML = '<img alt="dark-background" loading="lazy" />';
    decorateArea({ area: container });

    const img = container.querySelector('img');
    expect(img.hasAttribute('loading')).to.be.false;
    expect(img.fetchPriority).to.equal('high');
  });

  it('falls back to the first img when no scheme-specific image exists', () => {
    container.innerHTML = '<img src="hero.jpg" loading="lazy" />';
    decorateArea({ area: container });

    const img = container.querySelector('img');
    expect(img.hasAttribute('loading')).to.be.false;
    expect(img.fetchPriority).to.equal('high');
  });

  it('does nothing when there are no images', () => {
    container.innerHTML = '<div>No images here</div>';
    decorateArea({ area: container });
    expect(container.querySelector('img')).to.be.null;
  });

  it('skips eager-load for images inside .browse when there is a hash', () => {
    window.location.hash = '#some-path';
    container.innerHTML = '<div class="browse"><img src="bg.jpg" loading="lazy" /></div>';
    decorateArea({ area: container });

    const img = container.querySelector('img');
    expect(img.getAttribute('loading')).to.equal('lazy');
    expect(img.fetchPriority).to.not.equal('high');
  });

  it('eager-loads images inside .browse when there is no hash', () => {
    window.location.hash = '';
    container.innerHTML = '<div class="browse"><img src="bg.jpg" loading="lazy" /></div>';
    decorateArea({ area: container });

    const img = container.querySelector('img');
    expect(img.hasAttribute('loading')).to.be.false;
    expect(img.fetchPriority).to.equal('high');
  });

  it('eager-loads images outside .browse regardless of hash', () => {
    window.location.hash = '#some-path';
    container.innerHTML = '<div><img src="hero.jpg" loading="lazy" /></div>';
    decorateArea({ area: container });

    const img = container.querySelector('img');
    expect(img.hasAttribute('loading')).to.be.false;
    expect(img.fetchPriority).to.equal('high');
  });

  it('prefers light-background over generic img', () => {
    container.classList.add('light-scheme');
    container.innerHTML = `
      <img src="generic.jpg" loading="lazy" />
      <img alt="light-background" loading="lazy" />
    `;
    decorateArea({ area: container });

    const generic = container.querySelector('img[src="generic.jpg"]');
    const light = container.querySelector('img[alt="light-background"]');
    expect(generic.getAttribute('loading')).to.equal('lazy');
    expect(light.hasAttribute('loading')).to.be.false;
    expect(light.fetchPriority).to.equal('high');
  });
});
