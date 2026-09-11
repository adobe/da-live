/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

const savedFetch = window.fetch;
window.fetch = () => Promise.resolve(new Response('', { status: 200 }));
await import('../../../../../blocks/browse/da-sites/da-sites.js');
window.fetch = savedFetch;

describe('da-sites render', () => {
  let el;

  async function fixture(siteList = []) {
    if (siteList.length) {
      localStorage.setItem('da-sites', JSON.stringify(siteList));
    } else {
      localStorage.removeItem('da-sites');
    }
    localStorage.removeItem('da-orgs');
    el = document.createElement('da-sites');
    document.body.appendChild(el);
    await nextFrame();
    await nextFrame();
    return el;
  }

  afterEach(() => {
    if (el && el.parentElement) el.remove();
    el = null;
    localStorage.removeItem('da-sites');
    localStorage.removeItem('da-orgs');
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
  });

  it('Renders the sandbox + add-new double cards', async () => {
    await fixture([]);
    const sandbox = el.shadowRoot.querySelector('.da-double-card-sandbox');
    const addNew = el.shadowRoot.querySelector('.da-double-card-add-new');
    expect(sandbox).to.exist;
    expect(addNew).to.exist;
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

  it('Renders an nx-menu with share and hide items per card', async () => {
    await fixture(['acme/site1']);
    const menu = el.shadowRoot.querySelector('nx-menu');
    expect(menu).to.exist;
    expect(menu.items.map((i) => i.id)).to.deep.equal(['share', 'hide']);
  });

  it('Renders site and workspace labels', async () => {
    await fixture(['acme/site1']);
    expect(el.shadowRoot.querySelector('.da-site-name').textContent).to.contain('site1');
    expect(el.shadowRoot.querySelector('.da-site-workspace').textContent).to.contain('acme');
  });

  it('Renders a single label when the name has no slash', async () => {
    await fixture(['solo']);
    expect(el.shadowRoot.querySelector('.da-site-name').textContent).to.contain('solo');
    expect(el.shadowRoot.querySelector('.da-site-workspace')).to.equal(null);
  });
});
