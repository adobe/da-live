import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { showAuthBanner, hideAuthBanner } = await import('../../../../blocks/shared/da-auth-banner/da-auth-banner.js');

const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });

describe('da-auth-banner', () => {
  let savedNxIms;
  let savedIMS;

  beforeEach(() => {
    savedNxIms = window.localStorage.getItem('nx-ims');
    savedIMS = window.adobeIMS;
    document.querySelectorAll('da-auth-banner').forEach((el) => el.remove());
  });

  afterEach(() => {
    if (savedNxIms) {
      window.localStorage.setItem('nx-ims', savedNxIms);
    } else {
      window.localStorage.removeItem('nx-ims');
    }
    if (savedIMS === undefined) delete window.adobeIMS; else window.adobeIMS = savedIMS;
    document.querySelectorAll('da-auth-banner').forEach((el) => el.remove());
  });

  it('showAuthBanner mounts a single banner element', () => {
    const a = showAuthBanner();
    const b = showAuthBanner();
    expect(a).to.equal(b);
    expect(document.querySelectorAll('da-auth-banner').length).to.equal(1);
  });

  it('hideAuthBanner removes the banner', () => {
    showAuthBanner();
    hideAuthBanner();
    expect(document.querySelector('da-auth-banner')).to.not.exist;
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

  it('Reloads on cross-tab sign-in (nx-ims storage event)', async () => {
    const banner = showAuthBanner();
    let reloadCalls = 0;
    banner._reload = () => { reloadCalls += 1; };

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'nx-ims',
      newValue: 'true',
      oldValue: null,
    }));
    await wait(20);

    expect(reloadCalls).to.equal(1);
  });

  it('Navigates home on cross-tab sign-out (nx-ims removed)', async () => {
    const banner = showAuthBanner();
    let goHomeCalls = 0;
    banner._goHome = () => { goHomeCalls += 1; };

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'nx-ims',
      newValue: null,
      oldValue: 'true',
    }));
    await wait(20);

    expect(goHomeCalls).to.equal(1);
  });

  it('Renders as a modal that blocks the page', async () => {
    const banner = showAuthBanner();
    await banner.updateComplete;
    const dlg = banner.shadowRoot.querySelector('dialog');
    expect(dlg).to.exist;
    expect(dlg.open).to.equal(true);
  });

  it('Ignores storage events for other keys', async () => {
    const banner = showAuthBanner();
    let reloadCalls = 0;
    let goHomeCalls = 0;
    banner._reload = () => { reloadCalls += 1; };
    banner._goHome = () => { goHomeCalls += 1; };

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'unrelated',
      newValue: 'foo',
      oldValue: null,
    }));
    await wait(20);

    expect(reloadCalls).to.equal(0);
    expect(goHomeCalls).to.equal(0);
    expect(document.querySelector('da-auth-banner')).to.exist;
  });
});
