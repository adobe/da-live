/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

await import('../../../../../../blocks/browse/v2/da-browse/da-browse.js');
const { PANEL_EVENT } = await import('../../../../../fixtures/nx/utils/panel.js');

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

async function waitForRender(el) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const header = el.shadowRoot?.querySelector('da-browse-header');
    if (header && el.browseCmp?.actionBar) {
      await header.updateComplete;
      await el.browseCmp.updateComplete;
      return;
    }
    await nextFrame();
  }
  throw new Error('Browse header and list did not finish rendering.');
}

describe('da-browse render', () => {
  let el;
  let savedFetch;
  let storageDescriptor;

  function headerRoot() {
    return el.shadowRoot.querySelector('da-browse-header').shadowRoot;
  }

  async function settle() {
    await el.updateComplete;
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
    document.body.appendChild(el);
    await waitForRender(el);
    return el;
  }

  async function renderToolbar(details, { chat = false } = {}) {
    await fixture(details);
    el._chatEnabled = chat;
    el.requestUpdate();
    await settle();
    await el.newCmp.updateComplete;
    return {
      toolbar: headerRoot().querySelector('.da-browse-toolbar'),
      rightButtons: [...headerRoot().querySelectorAll('.da-browse-toolbar-control')],
      menu: headerRoot().querySelector('.da-browse-view-options-popover'),
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

  it('renders the toolbar controls and view options menu', async () => {
    const { toolbar, rightButtons, menu, newButton, newLabel } = await renderToolbar(
      { fullpath: '/org/site', org: 'org', site: 'site', path: '' },
      { chat: true },
    );
    expect(newLabel?.textContent).to.equal('New');
    expect(newButton?.classList.contains('nx-btn-accent')).to.be.true;
    expect(toolbar.textContent).to.contain('View Options');
    expect(toolbar.textContent).to.contain('Show All types');
    expect(headerRoot().querySelector('.da-browse-toolbar-leading')).to.exist;
    expect(headerRoot().querySelector('.da-browse-toolbar-trailing')).to.exist;
    expect(headerRoot().querySelector('.chat-btn')?.classList.contains('nx-action-btn-icon')).to.be.true;
    expect(rightButtons.every((btn) => btn.classList.contains('nx-action-btn-quiet'))).to.be.true;
    expect(rightButtons.map((btn) => btn.textContent.trim())).to.deep.equal(['View Options', 'Show All types']);
    expect(headerRoot().querySelector('nx-picker').labelOverride).to.equal('Sort: Default');
    expect(menu).to.exist;
    expect(menu.querySelector('nx-switch').getAttribute('label')).to.equal('Flatten folders');
    expect(rightButtons[0].getAttribute('aria-expanded')).to.equal('false');
    rightButtons[0].click();
    await settle();
    expect(menu.open).to.be.true;
    expect(rightButtons[0].getAttribute('aria-expanded')).to.equal('true');
    menu.close();
    menu.dispatchEvent(new CustomEvent('close'));
    await settle();
    expect(rightButtons[0].getAttribute('aria-expanded')).to.equal('false');
  });

  it('persists flatten changes from the switch and restores them on a new instance', async () => {
    await renderToolbar({ fullpath: '/org/site', org: 'org', site: 'site', path: '' });
    const control = headerRoot().querySelector('nx-switch');
    control.dispatchEvent(new CustomEvent('change', { detail: { checked: false } }));
    await settle();
    expect(el.browseCmp.flattenFolders).to.be.false;
    expect(JSON.parse(localStorage.getItem('da-browse-settings'))).to.deep.equal({ flattenFolders: false });
    expect(document.createElement('da-browse')._flattenFolders).to.be.false;
  });

  it('keeps the sort picker, label, and column selectors synchronized', async () => {
    await renderToolbar({ fullpath: '/org/site', org: 'org', site: 'site', path: '' });
    const list = el.browseCmp;
    await list.updateComplete;
    list._listItems = [
      { path: '/org/site/b.html', name: 'b', ext: 'html', lastModified: 200 },
      { path: '/org/site/a.html', name: 'a', ext: 'html', lastModified: 100 },
    ];
    await list.updateComplete;
    const picker = headerRoot().querySelector('nx-picker');
    expect(picker.labelOverride).to.equal('Sort: Default');
    expect(list.shadowRoot.querySelector('[data-column="name"]').getAttribute('aria-sort')).to.equal('none');
    picker.dispatchEvent(new CustomEvent('change', { detail: { value: 'name:ascending' } }));
    await list.updateComplete;
    await nextFrame();
    await list.updateComplete;
    await settle();
    expect(list._listItems.map((item) => item.name)).to.deep.equal(['a', 'b']);
    expect(picker.labelOverride).to.equal('Sorted by Name (A-Z)');
    expect(picker.value).to.equal('name:ascending');
    expect(list.shadowRoot.querySelector('[data-column="name"]').getAttribute('aria-sort')).to.equal('ascending');
    await list.handleDateSort();
    await list.updateComplete;
    await settle();
    expect(picker.labelOverride).to.equal('Sorted by Modified (newest first)');
    expect(picker.value).to.equal('lastModified:descending');
    await list.handleDateSort();
    await list.updateComplete;
    await settle();
    expect(picker.value).to.equal('lastModified:ascending');
    expect(picker.labelOverride).to.contain('oldest first');
    list.handleNameFilter({ target: { value: 'a' } });
    await list.updateComplete;
    await settle();
    expect(picker.labelOverride).to.contain('Sorted by Modified');
    el.details = { fullpath: '/org/other', org: 'org', site: 'other' };
    await nextFrame();
    await settle();
    await list.updateComplete;
    await settle();
    expect(picker.labelOverride).to.equal('Sorted by Modified (oldest first)');
    expect(JSON.parse(localStorage.getItem('da-browse-settings')).sort)
      .to.deep.equal({ property: 'lastModified', direction: 'ascending' });
  });

  it('renders only the browse grid without search tabs or a duplicate breadcrumb', async () => {
    await renderToolbar({ fullpath: '/org/site/folder', org: 'org', site: 'site', path: '/folder' });
    expect(el.shadowRoot.querySelector('nx-breadcrumb')).to.be.null;
    expect(el.shadowRoot.querySelector('[role="tablist"], [role="tabpanel"], da-search')).to.be.null;
    expect(el.shadowRoot.querySelectorAll('da-list').length).to.equal(1);
    expect(el.shadowRoot.querySelector('[role="grid"]').getAttribute('aria-label')).to.equal('Browse files');
  });

  it('sizes the fixed action bar to browse and follows panel-driven width changes', async () => {
    await import('../../../../../../blocks/browse/v2/da-actionbar/da-actionbar.js');
    const sheets = await Promise.all(['da-browse', 'da-list', 'da-actionbar'].map(async (name) => {
      const { href } = new URL(`../../../../../../blocks/browse/v2/${name}/${name}.css`, import.meta.url);
      const response = await savedFetch(href);
      expect(response.ok).to.be.true;
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(await response.text());
      return sheet;
    }));
    await fixture({ fullpath: '/org/site', org: 'org', site: 'site', path: '' });
    const list = el.browseCmp;
    await list.updateComplete;
    const actionbar = list.actionBar;
    actionbar.setAttribute('data-visible', 'true');
    actionbar.items = [{ path: '/org/site/page.html', name: 'page', ext: 'html' }];
    await actionbar.updateComplete;
    el.shadowRoot.adoptedStyleSheets = [sheets[0]];
    list.shadowRoot.adoptedStyleSheets = [sheets[1]];
    actionbar.shadowRoot.adoptedStyleSheets = [sheets[2]];
    el.style.marginLeft = '48px';
    const bar = actionbar.shadowRoot.querySelector('.da-action-bar');
    [1100, 740, 1100].forEach((width) => {
      el.style.width = `${width}px`;
      const browseBounds = el.getBoundingClientRect();
      const barBounds = bar.getBoundingClientRect();
      expect(barBounds.width).to.be.closeTo(width, 0.5);
      expect(barBounds.left).to.be.closeTo(browseBounds.left, 0.5);
      expect(barBounds.right).to.be.closeTo(browseBounds.right, 0.5);
    });
    expect(getComputedStyle(bar).position).to.equal('fixed');
    expect(getComputedStyle(bar).bottom).to.equal('12px');
  });

  it('updates the type filter button from the list state', async () => {
    const { rightButtons } = await renderToolbar({ fullpath: '/org/site', org: 'org', site: 'site', path: '' });
    const list = el.browseCmp;
    list._listItems = [{ path: '/org/site/a.html', name: 'a', ext: 'html' }];
    await list.updateComplete;
    rightButtons[1].click();
    await settle();
    expect(rightButtons[1].getAttribute('aria-expanded')).to.equal('true');
    list.toggleTypeVisibility('Page');
    await list.updateComplete;
    await settle();
    expect(rightButtons[1].textContent).to.contain('1 type hidden');
    list._typesPopover.close();
    list._typesPopover.dispatchEvent(new CustomEvent('close'));
    await settle();
    expect(rightButtons[1].getAttribute('aria-expanded')).to.equal('false');
  });

  it('keeps the browse list available when navigating to the organization root', async () => {
    await renderToolbar({ fullpath: '/org/site', org: 'org', site: 'site', path: '' });
    el.details = { fullpath: '/org', org: 'org', path: '' };
    await nextFrame();
    await settle();
    expect(el.browseCmp.fullpath).to.equal('/org');
    expect(el.shadowRoot.querySelectorAll('da-list').length).to.equal(1);
  });

  it('renders a single contextual config action pointing to site config at site level', async () => {
    await fixture({ fullpath: '/org/site', org: 'org', site: 'site', path: '' });
    const links = headerRoot().querySelectorAll('.da-browse-toolbar-trailing a.da-browse-settings-link');
    expect(links.length).to.equal(1);
    expect(links[0].getAttribute('aria-label')).to.equal('Config');
    expect(links[0].getAttribute('href')).to.equal('/config#/org/site/');
  });

  it('renders a single contextual config action pointing to site config below site level', async () => {
    await fixture({ fullpath: '/org/site/folder', org: 'org', site: 'site', path: '/folder' });
    const links = headerRoot().querySelectorAll('.da-browse-toolbar-trailing a.da-browse-settings-link');
    expect(links.length).to.equal(1);
    expect(links[0].getAttribute('href')).to.equal('/config#/org/site/');
  });

  it('renders a single contextual config action pointing to org config at org level', async () => {
    await fixture({ fullpath: '/org', org: 'org', path: '' });
    const links = headerRoot().querySelectorAll('.da-browse-toolbar-trailing a.da-browse-settings-link');
    expect(links.length).to.equal(1);
    expect(links[0].getAttribute('aria-label')).to.equal('Config');
    expect(links[0].getAttribute('href')).to.equal('/config#/org/');
  });
});
