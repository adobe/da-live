import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: init } = await import('../../../../blocks/start/start.js');

describe('start page appearance', () => {
  let container;
  let sheets;

  beforeEach(() => {
    sheets = [...document.adoptedStyleSheets];
  });

  afterEach(() => {
    container.remove();
    document.adoptedStyleSheets = sheets;
  });

  ['light', 'dark'].forEach((scheme) => {
    it(`replaces the old background with the legacy landing gradient in ${scheme} mode`, async () => {
      container = document.createElement('div');
      container.style.colorScheme = scheme;
      ['red-100', 'pink-200', 'blue-200', 'gray-25'].forEach((token) => {
        container.style.setProperty(`--s2-${token}`, 'white');
      });
      document.body.append(container);
      await init(container);
      const start = container.querySelector('da-start');
      await start.updateComplete;

      expect(getComputedStyle(container).backgroundImage).to.contain('radial-gradient');
      expect(start.shadowRoot.querySelector('.background, .gradient')).to.be.null;
      expect(getComputedStyle(start).backgroundColor).to.equal('rgba(0, 0, 0, 0)');
    });
  });
});
