/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { getNx2Api, setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { loadIms, handleSignIn } = await getNx2Api();
const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

const savedFetch = window.fetch;
window.fetch = () => Promise.resolve(new Response('', { status: 200 }));
await import('../../../../../blocks/browse/da-sites/da-sites.js');
window.fetch = savedFetch;

describe('da-sites render', () => {
  let el;

  async function fixture(siteList = [], tiles = null) {
    if (siteList.length) {
      localStorage.setItem('da-sites', JSON.stringify(siteList));
    } else {
      localStorage.removeItem('da-sites');
    }
    localStorage.removeItem('da-orgs');
    el = document.createElement('da-sites');
    el.tiles = tiles;
    document.body.appendChild(el);
    await nextFrame();
    await nextFrame();
    return el;
  }

  beforeEach(() => {
    loadIms.reset();
    loadIms.resolves({ accessToken: { token: 'test-token' } });
    handleSignIn.resetHistory();
  });

  afterEach(() => {
    if (el && el.parentElement) el.remove();
    el = null;
    localStorage.removeItem('da-sites');
    localStorage.removeItem('da-orgs');
    loadIms.reset();
    loadIms.resolves({ accessToken: { token: 'test-token' } });
    handleSignIn.resetHistory();
  });

  it('Renders the empty well when no recents are present', async () => {
    await fixture([]);
    expect(el.shadowRoot.querySelector('.da-no-site-well')).to.exist;
    expect(el.shadowRoot.querySelector('form')).to.exist;
  });

  it('Renders site cards when there are recents', async () => {
    await fixture(['org/site1', 'org/site2']);
    const cards = el.shadowRoot.querySelectorAll('.da-site-outer');
    expect(cards.length).to.equal(2);
    expect(handleSignIn.called).to.equal(false);
  });

  it('keeps the first visit public without waiting for IMS', async () => {
    loadIms.rejects(new Error('IMS unavailable'));
    await fixture([]);
    expect(el.shadowRoot.querySelector('form')).to.exist;
    expect(el.shadowRoot.querySelector('.da-double-card-sandbox')).to.exist;
    expect(loadIms.called).to.equal(false);
    expect(handleSignIn.called).to.equal(false);
    expect(el.shadowRoot.querySelector('da-recent-files')).to.equal(null);
  });

  it('waits for authentication before rendering recent sites and attaching tiles', async () => {
    let finish;
    loadIms.returns(new Promise((resolve) => { finish = resolve; }));
    const tiles = document.createElement('div');
    await fixture(['org/site'], tiles);
    expect(el.shadowRoot.querySelector('.da-site-container')).to.equal(null);
    expect(el.shadowRoot.querySelector('da-recent-files')).to.equal(null);
    expect(tiles.isConnected).to.equal(false);
    expect(handleSignIn.called).to.equal(false);
    finish({ accessToken: { token: 'test-token' } });
    await nextFrame();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.da-site-outer')).to.exist;
    expect(el.shadowRoot.querySelector('da-recent-files')).to.exist;
    expect(tiles.isConnected).to.equal(true);
    expect(tiles.slot).to.equal('tiles');
    expect(handleSignIn.called).to.equal(false);
  });

  [null, {}, { anonymous: true }, { anonymous: true, accessToken: { token: 'anonymous-token' } }]
    .forEach((profile, index) => {
      it(`signs in returning visitors without an authenticated profile (${index})`, async () => {
        loadIms.resolves(profile);
        await fixture(['org/site']);
        expect(handleSignIn.calledOnce).to.equal(true);
        expect(el.shadowRoot.querySelector('.da-site-container')).to.equal(null);
      });
    });

  it('offers a reload after authentication fails', async () => {
    loadIms.rejects(new Error('IMS unavailable'));
    await fixture(['org/site']);
    const alert = el.shadowRoot.querySelector('[role="alert"]');
    expect(alert.textContent).to.include('Could not sign in');
    expect(alert.querySelector('a').href).to.equal(window.location.href);
    expect(el.shadowRoot.querySelector('.da-site-container')).to.equal(null);
    expect(handleSignIn.called).to.equal(false);
  });

  it('does not redirect after disconnecting while authentication is pending', async () => {
    let finish;
    loadIms.returns(new Promise((resolve) => { finish = resolve; }));
    await fixture(['org/site']);
    el.remove();
    finish({ anonymous: true });
    await nextFrame();
    expect(handleSignIn.called).to.equal(false);
    expect(el.shadowRoot.querySelector('.da-site-container')).to.equal(null);
  });

  it('Renders the sandbox + add-new double cards', async () => {
    await fixture([]);
    const sandbox = el.shadowRoot.querySelector('.da-double-card-sandbox');
    const addNew = el.shadowRoot.querySelector('.da-double-card-add-new');
    expect(sandbox).to.exist;
    expect(addNew).to.exist;
    expect(el.shadowRoot.querySelectorAll('.da-site-sandbox-new > a')).to.have.length(2);
  });

  it('Renders the form alongside the recents list', async () => {
    await fixture(['org/site1']);
    const forms = el.shadowRoot.querySelectorAll('form');
    expect(forms.length).to.equal(1);
  });

  it('Marks the site URL input with the error class when _urlError is true', async () => {
    await fixture([]);
    el._urlError = true;
    el.requestUpdate();
    await nextFrame();
    expect(el.shadowRoot.querySelector('input.error')).to.exist;
  });

  it('Renders status toast when _status is set', async () => {
    await fixture([]);
    el._status = { type: 'info', text: 'Hi', description: 'desc' };
    el.requestUpdate();
    await nextFrame();
    expect(el.shadowRoot.querySelector('.da-list-status-toast')).to.exist;
    expect(el.shadowRoot.textContent).to.contain('Hi');
  });

  it('Status without description omits the description paragraph', async () => {
    await fixture([]);
    el._status = { type: 'success', text: 'Hi' };
    el.requestUpdate();
    await nextFrame();
    expect(el.shadowRoot.querySelector('.da-list-status-description')).to.equal(null);
  });

  it('handleFlip sets is-flipped class on the inner card', async () => {
    await fixture(['acme/site1']);
    const site = el._recents[0];
    el.handleFlip({ preventDefault: () => {}, stopPropagation: () => {} }, site);
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.da-site.is-flipped')).to.exist;
  });

  it('Renders share/hide back-action buttons', async () => {
    await fixture(['acme/site1']);
    const buttons = el.shadowRoot.querySelectorAll('.da-back-action');
    expect(buttons.length).to.be.at.least(2);
  });

  it('Splits recent name into label segments', async () => {
    await fixture(['acme/site1']);
    const card = el.shadowRoot.querySelector('.da-site-front');
    expect(card.textContent).to.contain('site1');
    expect(card.textContent).to.contain('acme');
  });
});
