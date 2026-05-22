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
    document.querySelectorAll('da-title, da-content').forEach((el) => el.remove());
  });

  afterEach(() => {
    if (savedIMS === undefined) delete window.adobeIMS; else window.adobeIMS = savedIMS;
    window.localStorage.removeItem('nx-ims');
    document.querySelectorAll('da-dialog.da-auth-banner').forEach((el) => el.remove());
    document.querySelectorAll('da-title, da-content').forEach((el) => el.remove());
  });

  it('showAuthBanner mounts a single banner element', () => {
    const a = showAuthBanner();
    const b = showAuthBanner();
    expect(a).to.equal(b);
    expect(document.querySelectorAll('da-dialog.da-auth-banner').length).to.equal(1);
  });

  it('Mounts a da-dialog with the expected default title and action label', async () => {
    const banner = showAuthBanner();
    await banner.updateComplete;
    expect(banner.title).to.equal('Your session has expired');
    expect(banner.action?.label).to.equal('Sign in');
  });

  it('Honors custom title, message, and buttonLabel', async () => {
    const banner = showAuthBanner({
      title: 'Not Permitted',
      message: 'No access for you.',
      buttonLabel: 'Sign out',
    });
    await banner.updateComplete;
    expect(banner.title).to.equal('Not Permitted');
    expect(banner.action?.label).to.equal('Sign out');
    expect(banner.querySelector('p')?.textContent).to.equal('No access for you.');
  });

  it('Defaults to non-modal so the page behind it stays interactive', async () => {
    const banner = showAuthBanner();
    await banner.updateComplete;
    expect(banner.modal).to.equal(false);
  });

  it('Action click calls handleSignOut which invokes adobeIMS.signOut', async () => {
    let signOutCalls = 0;
    window.adobeIMS = { signOut: () => { signOutCalls += 1; } };

    const banner = showAuthBanner();
    await banner.updateComplete;
    await banner.action.click();
    await wait(50);
    expect(signOutCalls).to.equal(1);
  });

  it('Marks da-content and the collab actions wrapper inert while shown', async () => {
    // Set up the page chrome the banner reaches into.
    const daTitle = document.createElement('da-title');
    daTitle.attachShadow({ mode: 'open' });
    const collabActions = document.createElement('div');
    collabActions.classList.add('da-title-collab-actions-wrapper');
    daTitle.shadowRoot.appendChild(collabActions);
    const daContent = document.createElement('da-content');
    document.body.appendChild(daTitle);
    document.body.appendChild(daContent);

    const banner = showAuthBanner();
    await banner.updateComplete;
    expect(collabActions.inert).to.equal(true);
    expect(daContent.inert).to.equal(true);

    // Closing the banner restores interactivity.
    banner.close();
    await wait(0);
    expect(collabActions.inert).to.equal(false);
    expect(daContent.inert).to.equal(false);
  });
});
