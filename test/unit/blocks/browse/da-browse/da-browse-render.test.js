/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

await import('../../../../../blocks/browse/da-browse/da-browse.js');

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

async function waitForRender(el) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (el.shadowRoot?.querySelector('.da-browse-toolbar')) return;
    await nextFrame();
  }
}

describe('da-browse render', () => {
  let el;
  let savedFetch;

  beforeEach(() => {
    savedFetch = window.fetch;
    window.fetch = () => Promise.resolve(new Response('[]', { status: 200 }));
  });

  afterEach(() => {
    window.fetch = savedFetch;
    if (el && el.parentElement) el.remove();
    el = null;
  });

  async function fixture(details) {
    el = document.createElement('da-browse');
    el.details = details;
    document.body.appendChild(el);
    await waitForRender(el);
    return el;
  }

  async function renderToolbar(details, { chat = false, viewOptions = false } = {}) {
    await fixture(details);
    el._chatEnabled = chat;
    el._viewOptionsOpen = viewOptions;
    el.requestUpdate();
    await waitForRender(el);
    return {
      toolbar: el.shadowRoot.querySelector('.da-browse-toolbar'),
      rightButtons: [...el.shadowRoot.querySelectorAll('.da-browse-toolbar-control')],
      menu: el.shadowRoot.querySelector('.da-browse-view-options-menu'),
      newButton: el.shadowRoot.querySelector('da-new')?.shadowRoot?.querySelector('.da-actions-new-button'),
      newLabel: el.shadowRoot.querySelector('da-new')?.shadowRoot?.querySelector('.da-actions-new-label'),
    };
  }

  it('renders the browse toolbar shell', async () => {
    const { toolbar } = await renderToolbar({ fullpath: '/org/site', org: 'org', site: 'site', path: '' }, { chat: true });
    expect(toolbar).to.exist;
    expect(el.shadowRoot.querySelector('da-new')).to.exist;
    expect(el.shadowRoot.querySelector('.chat-btn')).to.exist;
    expect(el.shadowRoot.querySelector('.da-browse-toolbar-leading')).to.exist;
    expect(el.shadowRoot.querySelector('.da-browse-toolbar-trailing')).to.exist;
  });

  it('renders the toolbar controls and view options menu', async () => {
    const { toolbar, rightButtons, menu, newButton, newLabel } = await renderToolbar(
      { fullpath: '/org/site', org: 'org', site: 'site', path: '' },
      { chat: true, viewOptions: true },
    );
    expect(newLabel?.textContent).to.equal('New');
    expect(newButton?.classList.contains('nx-btn-accent')).to.be.true;
    expect(toolbar.textContent).to.contain('View Options');
    expect(toolbar.textContent).to.contain('Show All types');
    expect(el.shadowRoot.querySelector('.da-browse-toolbar-leading')).to.exist;
    expect(el.shadowRoot.querySelector('.da-browse-toolbar-trailing')).to.exist;
    expect(el.shadowRoot.querySelector('.chat-btn')?.classList.contains('nx-action-btn-icon')).to.be.true;
    expect(rightButtons.every((btn) => btn.classList.contains('nx-action-btn-quiet'))).to.be.true;
    expect(rightButtons.map((btn) => btn.textContent.trim())).to.deep.equal(['View Options', 'Show All types']);
    expect(menu).to.exist;
    expect(menu.textContent).to.contain('Layout');
    expect(menu.textContent).to.contain('Row size');
    const segmented = menu.querySelectorAll('nx-segmented-btn');
    expect(segmented.length).to.equal(2);
    expect(segmented[0].label).to.equal('Layout options');
    expect(segmented[0].items).to.deep.equal([
      { value: 'list', icon: '/img/icons/s2-icon-listbulleted-20-n.svg', label: 'List view', iconOnly: true },
      { value: 'grid', icon: '/img/icons/s2-icon-viewgrid-20-n.svg', label: 'Grid view', iconOnly: true },
    ]);
    expect(segmented[1].label).to.equal('Row size options');
  });

  it('renders a single contextual config action pointing to site config at site level', async () => {
    await fixture({ fullpath: '/org/site', org: 'org', site: 'site', path: '' });
    const links = el.shadowRoot.querySelectorAll('.da-browse-toolbar-trailing a.da-browse-settings-link');
    expect(links.length).to.equal(1);
    expect(links[0].getAttribute('aria-label')).to.equal('Config');
    expect(links[0].getAttribute('href')).to.equal('/config#/org/site/');
  });

  it('renders a single contextual config action pointing to site config below site level', async () => {
    await fixture({ fullpath: '/org/site/folder', org: 'org', site: 'site', path: '/folder' });
    const links = el.shadowRoot.querySelectorAll('.da-browse-toolbar-trailing a.da-browse-settings-link');
    expect(links.length).to.equal(1);
    expect(links[0].getAttribute('href')).to.equal('/config#/org/site/');
  });

  it('renders a single contextual config action pointing to org config at org level', async () => {
    await fixture({ fullpath: '/org', org: 'org', path: '' });
    const links = el.shadowRoot.querySelectorAll('.da-browse-toolbar-trailing a.da-browse-settings-link');
    expect(links.length).to.equal(1);
    expect(links[0].getAttribute('aria-label')).to.equal('Config');
    expect(links[0].getAttribute('href')).to.equal('/config#/org/');
  });
});
