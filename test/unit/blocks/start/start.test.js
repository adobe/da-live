import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: init } = await import('../../../../blocks/start/start.js');

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('start block', () => {
  let el;
  let savedIms;

  beforeEach(() => {
    savedIms = window.adobeIMS;
    el = document.createElement('div');
    document.body.append(el);
  });

  afterEach(() => {
    el.remove();
    window.adobeIMS = savedIms;
  });

  it('keeps the current start form behavior', async () => {
    window.adobeIMS = { isSignedInUser: () => false };
    init(el);
    const start = el.querySelector('da-start');
    await start.updateComplete;
    const input = start.shadowRoot.querySelector('input');
    const go = start.shadowRoot.querySelector('.go-button');

    input.value = 'https://gitlab.com/adobe/geometrixx';
    input.dispatchEvent(new Event('input'));
    await start.updateComplete;
    expect(go.disabled).to.be.true;

    input.value = 'https://github.com/adobe/geometrixx';
    input.dispatchEvent(new Event('input'));
    await start.updateComplete;
    expect(go.disabled).to.be.false;
    expect(start.org).to.equal('adobe');
    expect(start.site).to.equal('geometrixx');

    go.click();
    await nextFrame();
    await start.updateComplete;
    expect(start.shadowRoot.querySelector('.error-text').textContent).to.equal('You need to sign in first.');
    expect(start.activeStep).to.equal(1);
  });
});
