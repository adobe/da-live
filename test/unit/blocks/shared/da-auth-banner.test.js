import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { showAuthBanner } = await import('../../../../blocks/shared/da-auth-banner/da-auth-banner.js');

const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });

describe('da-auth-banner', () => {
  let savedIMS;

  beforeEach(() => {
    savedIMS = window.adobeIMS;
    window.localStorage.removeItem('nx-ims');
    document.querySelectorAll('da-dialog.da-auth-banner').forEach((el) => el.remove());
  });

  afterEach(() => {
    if (savedIMS === undefined) delete window.adobeIMS; else window.adobeIMS = savedIMS;
    // The Sign-in button calls handleSignIn which sets nx-ims; always remove
    // it so the leaked flag doesn't trip later tests that don't configure setNx.
    window.localStorage.removeItem('nx-ims');
    document.querySelectorAll('da-dialog.da-auth-banner').forEach((el) => el.remove());
  });

  it('showAuthBanner mounts a single banner element', () => {
    const a = showAuthBanner();
    const b = showAuthBanner();
    expect(a).to.equal(b);
    expect(document.querySelectorAll('da-dialog.da-auth-banner').length).to.equal(1);
  });

  it('Mounts a da-dialog with the expected title and action label', async () => {
    const banner = showAuthBanner();
    await banner.updateComplete;
    expect(banner.title).to.equal('Your session has expired');
    expect(banner.action?.label).to.equal('Sign in');
  });

  it('Sign-in action calls handleSignIn which invokes adobeIMS.signIn', async () => {
    let signInCalls = 0;
    window.adobeIMS = { signIn: () => { signInCalls += 1; } };

    const banner = showAuthBanner();
    await banner.updateComplete;
    await banner.action.click();
    await wait(50);
    expect(signInCalls).to.equal(1);
  });
});
