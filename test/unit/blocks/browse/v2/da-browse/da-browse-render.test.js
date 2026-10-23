/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { spy, stub } from 'sinon';

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
  }

  it('forwards chat requests to the existing panel event', async () => {
    await renderToolbar({ fullpath: '/org/site', org: 'org', site: 'site', path: '' }, { chat: true });
    let event;
    const onOpen = (e) => { event = e; };
    document.addEventListener(PANEL_EVENT.OPEN, onOpen);
    try {
      headerRoot().querySelector('.chat-btn').click();
      expect(event.detail).to.deep.equal({ section: 'chat' });
    } finally {
      document.removeEventListener(PANEL_EVENT.OPEN, onOpen);
    }
  });

  it('replays the latest browse context only after cold chat is ready', async () => {
    await fixture({ fullpath: '/org/site', org: 'org', site: 'site', path: '' });
    const first = { path: '/org/site/first.html', name: 'first', ext: 'html' };
    const latest = { path: '/org/site/folder', name: 'folder' };
    el._handleBrowseSelection({ detail: { items: [first] } });
    const aside = document.createElement('aside');
    const chat = document.createElement('nx-chat');
    chat.attachShadow({ mode: 'open' });
    chat.shadowRoot.innerHTML = '<nx-pills></nx-pills>';
    let ready;
    chat.updateComplete = new Promise((resolve) => { ready = resolve; });
    aside.append(chat);
    document.body.append(aside);
    const contexts = [];
    const onContext = ({ detail }) => contexts.push(detail);
    try {
      const opening = el.syncChatContext(aside);
      el._handleBrowseSelection({ detail: { items: [latest] } });
      document.addEventListener('nx-add-to-chat', onContext);
      expect(contexts).to.deep.equal([]);
      ready();
      await opening;
      expect(contexts).to.deep.equal([{
        key: latest.path,
        id: latest.path,
        type: 'folder',
        label: 'folder',
        blockName: 'folder',
        innerText: 'Selected repository path: org/site/folder',
      }]);
      el._clearBrowseSelection();
      contexts.length = 0;
      await el.syncChatContext(aside);
      expect(contexts).to.deep.equal([]);
    } finally {
      document.removeEventListener('nx-add-to-chat', onContext);
      aside.remove();
    }
  });

  it('preloads chat during idle time and cancels pending preload on disconnect', async () => {
    await fixture({ fullpath: '/org/site', org: 'org', site: 'site', path: '' });
    const idle = stub(window, 'requestIdleCallback').returns(42);
    const cancel = stub(window, 'cancelIdleCallback');
    const load = stub().resolves(document.createElement('div'));
    try {
      el.preloadChat(load);
      expect(load.called).to.be.false;
      idle.firstCall.args[0]();
      expect(load.calledOnce).to.be.true;
      el.preloadChat(load);
      el.remove();
      expect(cancel.calledWith(42)).to.be.true;
    } finally {
      idle.restore();
      cancel.restore();
    }
  });

  it('passes permissions and breadcrumb segments to header content', async () => {
    await renderToolbar({ fullpath: '/org/site', org: 'org', site: 'site', path: '' });
    el.handlePermissions({ detail: ['read', 'write'] });
    await el.updateComplete;
    expect(el.newCmp.permissions).to.deep.equal(['read', 'write']);
    const breadcrumb = el.shadowRoot.querySelector('nx-breadcrumb');
    expect(breadcrumb.pathSegments).to.deep.equal(['org', 'site']);
  });

  it('persists header view requests and passes the view and size to the list', async () => {
    await renderToolbar({ fullpath: '/org/site', org: 'org', site: 'site', path: '' });
    const header = el.shadowRoot.querySelector('da-browse-header');
    header.dispatchEvent(new CustomEvent('appearancesizechange', { detail: { view: 'card', size: 'l' } }));
    header.dispatchEvent(new CustomEvent('viewchange', { detail: { view: 'card' } }));
    await settle();
    expect(el.browseCmp.view).to.equal('card');
    expect(el.browseCmp.getAttribute('size')).to.equal('l');
    expect(JSON.parse(localStorage.getItem('da-browse-settings')).view).to.equal('card');
    expect(document.createElement('da-browse')._view).to.equal('card');
  });

  it('persists header grouping requests and passes them to the list', async () => {
    await renderToolbar({ fullpath: '/org/site', org: 'org', site: 'site', path: '' });
    const header = el.shadowRoot.querySelector('da-browse-header');
    header.dispatchEvent(new CustomEvent('groupbytypechange', { detail: { group: false } }));
    await settle();
    expect(el.browseCmp.groupByType).to.be.false;
    expect(JSON.parse(localStorage.getItem('da-browse-settings'))).to.deep.equal({ groupByType: false });
    expect(document.createElement('da-browse')._groupByType).to.be.false;
  });

  it('keeps the browse list available when navigating to the organization root', async () => {
    await renderToolbar({ fullpath: '/org/site', org: 'org', site: 'site', path: '' });
    el.details = { fullpath: '/org', org: 'org', path: '' };
    await settle();
    expect(el.browseCmp.fullpath).to.equal('/org');
    expect(el.shadowRoot.querySelectorAll('da-list').length).to.equal(1);
  });
});
