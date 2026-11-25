import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { decorateArea } = await import('../../../scripts/scripts.js');

describe('startup branding', () => {
  async function loadConfig(nx2) {
    const frame = document.createElement('iframe');
    const fixtureHref = new URL('/test/fixtures/startup-config.js', window.location.href).href;
    const imports = {
      '/nx/scripts/nexter.js': fixtureHref,
      '/nx2/scripts/nx.js': fixtureHref,
      '/blocks/shared/utils.js': fixtureHref,
    };
    const ready = new Promise((resolve, reject) => {
      frame.addEventListener('config-ready', ({ detail }) => resolve(detail), { once: true });
      frame.addEventListener('config-error', ({ detail }) => reject(new Error(detail)), { once: true });
    });
    frame.srcdoc = `
      <!doctype html>
      <html>
        <head>
          ${nx2 ? '<meta name="nxver" content="2">' : ''}
          <script type="importmap">${JSON.stringify({ imports })}</script>
        </head>
        <body>
          <script type="module">
            try {
              await import('/scripts/scripts.js');
              const { getConfig } = await import('${fixtureHref}');
              frameElement.dispatchEvent(new CustomEvent('config-ready', { detail: getConfig() }));
            } catch (error) {
              frameElement.dispatchEvent(new CustomEvent('config-error', { detail: error.message }));
            }
          </script>
        </body>
      </html>`;
    document.body.append(frame);
    try {
      return await ready;
    } finally {
      frame.remove();
    }
  }

  it('configures the product logo and label for NX2', async () => {
    const config = await loadConfig(true);
    expect(config.navBrand).to.deep.equal({
      logoHref: new URL('/img/logos/aem.svg', window.location.href).href,
      label: 'Adobe Experience Manager',
    });
  });

  it('preserves legacy NX branding', async () => {
    const config = await loadConfig(false);
    expect(config).not.to.have.property('navBrand');
  });
});

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
