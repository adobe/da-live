import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: init } = await import('../../../../blocks/start/start.js');

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('start block', () => {
  let el;
  let originalHref;
  let savedIms;

  beforeEach(() => {
    originalHref = window.location.href;
    savedIms = window.adobeIMS;
    el = document.createElement('div');
    document.body.append(el);
  });

  afterEach(() => {
    el.remove();
    window.adobeIMS = savedIms;
    history.replaceState(null, '', originalHref);
  });

  it('renders the current start page without the onboarding flag', async () => {
    await init(el);
    expect(el.querySelector('da-start')).to.exist;
    expect(el.querySelector('da-onboarding')).to.be.null;
  });

  it('renders the onboarding page with ?onboarding=true', async () => {
    history.replaceState(null, '', '?onboarding=true');
    await init(el);
    expect(el.querySelector('da-onboarding')).to.exist;
    expect(el.querySelector('da-start')).to.be.null;
  });

  it('ignores other onboarding values', async () => {
    history.replaceState(null, '', '?onboarding=false');
    await init(el);
    expect(el.querySelector('da-start')).to.exist;
  });

  it('keeps the current start form behavior', async () => {
    window.adobeIMS = { isSignedInUser: () => false };
    await init(el);
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
