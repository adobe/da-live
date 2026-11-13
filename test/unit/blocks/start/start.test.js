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

  ['rgb(20, 20, 20)', 'rgb(240, 240, 240)'].forEach((color) => {
    it(`leaves the background transparent and inherits shell text color ${color}`, async () => {
      container = document.createElement('div');
      container.style.color = color;
      ['red-100', 'pink-200', 'indigo-200', 'blue-200', 'gray-25'].forEach((token) => {
        container.style.setProperty(`--s2-${token}`, color);
      });
      document.body.append(container);
      await init(container);
      const start = container.querySelector('da-start');
      await start.updateComplete;

      expect(getComputedStyle(container).backgroundImage).to.contain('radial-gradient');
      expect(start.shadowRoot.querySelector('.background, .gradient')).to.be.null;
      expect(getComputedStyle(start).backgroundColor).to.equal('rgba(0, 0, 0, 0)');
      expect(start.shadowRoot.querySelector('.step-1-panel form')).not.to.be.null;
      expect(getComputedStyle(start).color).to.equal(color);
      expect(getComputedStyle(start.shadowRoot.querySelector('label')).color).to.equal(color);
    });
  });
});
