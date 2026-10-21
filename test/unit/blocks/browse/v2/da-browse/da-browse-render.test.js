/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { spy } from 'sinon';

const { setNx } = await import('../../../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

await import('../../../../../../blocks/browse/v2/da-browse/da-browse.js');
const { PANEL_EVENT } = await import('../../../../../fixtures/nx/utils/panel.js');

async function completeUpdate(component) {
  const update = spy(component, 'update');
  try {
    await component.updateComplete;
    await update.lastCall?.returnValue;
    await component.updateComplete;
  } finally {
    update.restore();
  }
}

describe('da-browse render', () => {
  let el;
  let savedFetch;
  let storageDescriptor;

  function headerRoot() {
    return el.shadowRoot.querySelector('da-browse-header').shadowRoot;
  }

  async function settle() {
    await completeUpdate(el);
    await el.shadowRoot.querySelector('da-browse-header').updateComplete;
  }

  beforeEach(() => {
    storageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { configurable: true, value: sessionStorage });
    savedFetch = window.fetch;
    localStorage.removeItem('da-browse-settings');
    window.fetch = () => Promise.resolve(new Response('[]', { status: 200 }));
  });

  afterEach(() => {
    window.fetch = savedFetch;
    if (el && el.parentElement) el.remove();
    el = null;
    localStorage.removeItem('da-browse-settings');
    Object.defineProperty(window, 'localStorage', storageDescriptor);
  });

  async function fixture(details) {
    el = document.createElement('da-browse');
    el.details = details;
    const listUpdate = spy(customElements.get('da-list').prototype, 'update');
    try {
      document.body.appendChild(el);
      await settle();
      await Promise.all(listUpdate.getCalls().map((call) => call.returnValue));
      await el.browseCmp.updateComplete;
      await customElements.whenDefined('da-actionbar');
      await settle();
    } finally {
      listUpdate.restore();
    }
    return el;
  }

  async function renderToolbar(details, { chat = false } = {}) {
    await fixture(details);
    el._chatEnabled = chat;
    el.requestUpdate();
    await settle();
    await el.newCmp.updateComplete;
    return {
      toolbar: headerRoot(),
      rightButtons: [...headerRoot().querySelectorAll('.browse-toolbar-control')],
      newButton: el.shadowRoot.querySelector('da-new')?.shadowRoot?.querySelector('.da-actions-new-button'),
      newLabel: el.shadowRoot.querySelector('da-new')?.shadowRoot?.querySelector('.da-actions-new-label'),
    };
  }

  it('forwards chat requests to the existing panel event and preserves the styled part', async () => {
    await renderToolbar({ fullpath: '/org/site', org: 'org', site: 'site', path: '' }, { chat: true });
    let event;
    const onOpen = (e) => { event = e; };
    document.addEventListener(PANEL_EVENT.OPEN, onOpen);
    try {
      headerRoot().querySelector('.chat-btn').click();
      expect(event.detail).to.deep.equal({ section: 'chat' });
      expect(el.shadowRoot.querySelector('da-browse-header').getAttribute('exportparts')).to.equal('chat-btn');
    } finally {
      document.removeEventListener(PANEL_EVENT.OPEN, onOpen);
    }
  });

  it('keeps creation and permissions wired to the slotted new component', async () => {
    await renderToolbar({ fullpath: '/org/site', org: 'org', site: 'site', path: '' });
    const list = el.browseCmp;
    await list.updateComplete;
    list.handlePermissions(['read', 'write']);
    expect(el.newCmp.permissions).to.deep.equal(['read', 'write']);
    const item = { path: '/org/site/new.html', name: 'new', ext: 'html' };
    el.newCmp.sendNewItem(item);
    await list.updateComplete;
    expect(list._listItems).to.include(item);
    expect(headerRoot().querySelector('slot').assignedElements()).to.deep.equal([el.newCmp]);
  });

  it('renders the toolbar controls and group-by-type switch', async () => {
    const { toolbar, rightButtons, newLabel } = await renderToolbar(
      { fullpath: '/org/site', org: 'org', site: 'site', path: '' },
      { chat: true },
    );
    expect(newLabel?.textContent).to.equal('New');
    expect(toolbar.textContent).to.contain('Show All');
    expect(headerRoot().querySelector('.chat-btn')).to.exist;
    expect(rightButtons.map((btn) => btn.textContent.trim())).to.deep.equal(['Show All']);
    expect(headerRoot().querySelector('nx-picker').labelOverride).to.equal('Sort');
    expect(headerRoot().querySelector('nx-switch').getAttribute('label')).to.equal('Group by type');
  });

  it('persists the view from the segmented control and passes it to the list', async () => {
    await renderToolbar({ fullpath: '/org/site', org: 'org', site: 'site', path: '' });
    headerRoot().querySelector('nx-segmented-btn')
      .dispatchEvent(new CustomEvent('change', { detail: { value: 'card' } }));
    await settle();
    expect(el.browseCmp.view).to.equal('card');
    expect(JSON.parse(localStorage.getItem('da-browse-settings')).view).to.equal('card');
    expect(document.createElement('da-browse')._view).to.equal('card');
  });

  it('persists group-by-type changes from the switch and restores them on a new instance', async () => {
    await renderToolbar({ fullpath: '/org/site', org: 'org', site: 'site', path: '' });
    const control = headerRoot().querySelector('nx-switch');
    control.dispatchEvent(new CustomEvent('change', { detail: { checked: true } }));
    await settle();
    expect(el.browseCmp.groupByType).to.be.true;
    expect(JSON.parse(localStorage.getItem('da-browse-settings'))).to.deep.equal({ groupByType: true });
    expect(document.createElement('da-browse')._groupByType).to.be.true;
  });

  it('renders only the browse grid without search tabs or a duplicate breadcrumb', async () => {
    await renderToolbar({ fullpath: '/org/site/folder', org: 'org', site: 'site', path: '/folder' });
    expect(el.shadowRoot.querySelector('nx-breadcrumb')).to.be.null;
    expect(el.shadowRoot.querySelector('[role="tablist"], [role="tabpanel"], da-search')).to.be.null;
    expect(el.shadowRoot.querySelectorAll('da-list').length).to.equal(1);
    expect(el.shadowRoot.querySelector('[role="grid"]').getAttribute('aria-label')).to.equal('Browse files');
  });

  it('updates the type filter button from the list state', async () => {
    const { rightButtons } = await renderToolbar({ fullpath: '/org/site', org: 'org', site: 'site', path: '' });
    const list = el.browseCmp;
    list._listItems = [{ path: '/org/site/a.html', name: 'a', ext: 'html' }];
    await list.updateComplete;
    rightButtons[0].click();
    await settle();
    expect(rightButtons[0].getAttribute('aria-expanded')).to.equal('true');
    list.toggleTypeVisibility('Page');
    await list.updateComplete;
    await settle();
    expect(rightButtons[0].textContent).to.contain('1 type hidden');
    list._typesPopover.close();
    list._typesPopover.dispatchEvent(new CustomEvent('close'));
    await settle();
    expect(rightButtons[0].getAttribute('aria-expanded')).to.equal('false');
  });

  it('keeps the browse list available when navigating to the organization root', async () => {
    await renderToolbar({ fullpath: '/org/site', org: 'org', site: 'site', path: '' });
    el.details = { fullpath: '/org', org: 'org', path: '' };
    await settle();
    expect(el.browseCmp.fullpath).to.equal('/org');
    expect(el.shadowRoot.querySelectorAll('da-list').length).to.equal(1);
  });

  it('renders a single contextual config action pointing to site config at site level', async () => {
    await fixture({ fullpath: '/org/site', org: 'org', site: 'site', path: '' });
    const links = headerRoot().querySelectorAll('a.browse-settings-link');
    expect(links.length).to.equal(1);
    expect(links[0].getAttribute('aria-label')).to.equal('Config');
    expect(links[0].getAttribute('href')).to.equal('/config#/org/site/');
  });

  it('does not render a config action below site level', async () => {
    await fixture({ fullpath: '/org/site/folder', org: 'org', site: 'site', path: '/folder' });
    const links = headerRoot().querySelectorAll('a.browse-settings-link');
    expect(links.length).to.equal(0);
  });

  it('renders a single contextual config action pointing to org config at org level', async () => {
    await fixture({ fullpath: '/org', org: 'org', path: '' });
    const links = headerRoot().querySelectorAll('a.browse-settings-link');
    expect(links.length).to.equal(1);
    expect(links[0].getAttribute('aria-label')).to.equal('Config');
    expect(links[0].getAttribute('href')).to.equal('/config#/org/');
  });
});
