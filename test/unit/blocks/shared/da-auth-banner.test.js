import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { showAuthBanner } = await import('../../../../blocks/shared/da-auth-banner/da-auth-banner.js');

const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });

describe('da-auth-banner', () => {
  let savedIMS;

  beforeEach(() => {
    savedIMS = window.adobeIMS;
    document.querySelectorAll('da-auth-banner').forEach((el) => el.remove());
  });

  afterEach(() => {
    if (savedIMS === undefined) delete window.adobeIMS; else window.adobeIMS = savedIMS;
    document.querySelectorAll('da-auth-banner').forEach((el) => el.remove());
  });

  it('showAuthBanner mounts a single banner element', () => {
    const a = showAuthBanner();
    const b = showAuthBanner();
    expect(a).to.equal(b);
    expect(document.querySelectorAll('da-auth-banner').length).to.equal(1);
  });

  it('Renders as a modal that blocks the page', async () => {
    const banner = showAuthBanner();
    await banner.updateComplete;
    const dlg = banner.shadowRoot.querySelector('dialog');
    expect(dlg).to.exist;
    expect(dlg.open).to.equal(true);
  });

  it('Sign-in button calls handleSignIn which invokes adobeIMS.signIn', async () => {
    let signInCalls = 0;
    window.adobeIMS = { signIn: () => { signInCalls += 1; } };

    const banner = showAuthBanner();
    await banner.updateComplete;
    banner.shadowRoot.querySelector('.da-auth-action').click();
    await wait(50);
    expect(signInCalls).to.equal(1);
  });
});
