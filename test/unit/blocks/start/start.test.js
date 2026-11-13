import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: init } = await import('../../../../blocks/start/start.js');

describe('start page appearance', () => {
  let container;

  afterEach(() => {
    container.remove();
  });

  ['rgb(20, 20, 20)', 'rgb(240, 240, 240)'].forEach((color) => {
    it(`leaves the background transparent and inherits shell text color ${color}`, async () => {
      container = document.createElement('div');
      container.style.color = color;
      document.body.append(container);
      init(container);
      const start = container.querySelector('da-start');
      await start.updateComplete;

      expect(start.shadowRoot.querySelector('.background, .gradient')).to.be.null;
      expect(getComputedStyle(start).backgroundColor).to.equal('rgba(0, 0, 0, 0)');
      expect(start.shadowRoot.querySelector('.step-1-panel form')).not.to.be.null;
      expect(getComputedStyle(start).color).to.equal(color);
      expect(getComputedStyle(start.shadowRoot.querySelector('label')).color).to.equal(color);
    });
  });
});
