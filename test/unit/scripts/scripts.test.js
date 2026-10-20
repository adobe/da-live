import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { decorateArea } = await import('../../../scripts/scripts.js');

describe('decorateArea', () => {
  let container;
  let originalHref;

  beforeEach(() => {
    originalHref = window.location.href;
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    window.history.replaceState(null, '', originalHref);
  });

  it('preserves preview navigation in sidebar fragments even without images', () => {
    window.history.replaceState(null, '', '/?landing=true&nx=lp&theme=light#/org/site');
    container.innerHTML = '<a href="/apps">Apps</a><a href="/marketplace">Marketplace</a><a href="https://www.aem.live/docs/ew/about">Learn</a>';
    decorateArea({ area: container });
    const [apps, marketplace, learn] = container.querySelectorAll('a');
    [apps, marketplace].forEach((link) => {
      expect(link.search).to.equal('?nx=lp&theme=light&landing=home');
    });
    expect(learn.href).to.equal('https://www.aem.live/docs/ew/about');
  });

  it('does not alter local anchors, downloads or brand assets', () => {
    window.history.replaceState(null, '', '/?landing=true&nx=lp');
    container.innerHTML = '<a href="#section">Section</a><a href="/export" download>Export</a><a href="/brand.svg">Author</a>';
    const links = [...container.querySelectorAll('a')];
    const hrefs = links.map((link) => link.getAttribute('href'));
    decorateArea({ area: container });
    expect(links.map((link) => link.getAttribute('href'))).to.deep.equal(hrefs);
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
      <picture><img src="generic.jpg" loading="lazy" /></picture>
      <picture><img alt="light" loading="lazy" /></picture>
    `;
    decorateArea({ area: container });

    const generic = container.querySelector('img[src="generic.jpg"]');
    const light = container.querySelector('picture[data-scheme="light"] img');
    expect(generic.getAttribute('loading')).to.equal('lazy');
    expect(light.hasAttribute('loading')).to.be.false;
    expect(light.fetchPriority).to.equal('high');
  });
});
