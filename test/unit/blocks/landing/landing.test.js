import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-nx.js';
import { getFavorites, toggleFavorite } from '../../../../blocks/browse/shared/favorites.js';
import { setUISize } from '../../../fixtures/nx2/utils/ui-size.js';
import loadLanding, { DaLanding } from '../../../../blocks/landing/landing.js';
import { getNx, getNx2Api, getNxEWFlags } from '../../../../scripts/utils.js';

const { hashChange } = await import(`${getNx()}/utils/utils.js`);
const { source } = await getNx2Api();
const ewFlags = await getNxEWFlags();
const { panelSections } = await import(`${getNx()}/utils/panel.js`);

const ITEMS = [
  { name: 'Welcome', path: '/org/site/index.html', ext: 'html', lastModified: 1792152000000 },
  { name: 'Products', path: '/org/site/products.json', ext: 'json' },
];

function dragEvent({ type, relatedTarget, text = false }) {
  const dataTransfer = new DataTransfer();
  if (text) dataTransfer.setData('text/plain', 'Selected text');
  else dataTransfer.items.add(new File(['A draft'], 'draft.md', { type: 'text/markdown' }));
  return new DragEvent(type, { dataTransfer, relatedTarget, bubbles: true, cancelable: true });
}

describe('landing page', () => {
  let el;
  let nav;
  let loadSite;

  beforeEach(async () => {
    localStorage.removeItem('da-favorites');
    localStorage.removeItem('da-browse-settings');
    localStorage.removeItem('ui-size');
    localStorage.setItem('da-sites', JSON.stringify(['org/site', 'org/other']));
    hashChange._set({ org: 'org', site: 'site', fullpath: '/org/site' });
    sinon.stub(DaLanding.prototype, 'loadProfile').resolves();
    loadSite = sinon.stub(DaLanding.prototype, 'loadSite').callsFake(async function loadSiteForTest() {
      this._request = new AbortController();
    });
    nav = document.createElement('nx-nav');
    document.body.append(nav);
    el = document.createElement('da-landing');
    document.body.append(el);
    el._files = ITEMS;
    el._permissions = ['read', 'write'];
    el._editor = '/canvas#';
    await el.updateComplete;
  });

  afterEach(() => {
    ewFlags.setEWEnabled(false);
    panelSections.clear();
    el.remove();
    nav.remove();
    sinon.restore();
    ['da-sites', 'da-favorites', 'da-browse-settings', 'ui-size'].forEach((key) => localStorage.removeItem(key));
    document.body.classList.remove('ui-size-m');
  });

  it('renders files without adding site-root copy to the mock', () => {
    expect(el.shadowRoot.querySelector('h1').textContent).to.include('how can I help?');
    expect(el.shadowRoot.querySelectorAll('.file')).to.have.length(2);
    expect(el.shadowRoot.querySelector('.scope-label')).to.equal(null);
    expect(el.shadowRoot.textContent).not.to.include('Site root');
    expect(el.shadowRoot.querySelector('nx-picker')).to.equal(null);
    expect(nav.querySelector('nx-picker, nx-siteselector')).to.equal(null);
    expect(el.shadowRoot.querySelector('.quick-links, da-landing-tile')).to.equal(null);
    expect(el.shadowRoot.querySelector('.tasks-panel')).to.equal(null);
    expect(el.shadowRoot.textContent).not.to.include('Need Attention');
  });

  it('keeps Browse card width and wraps columns instead of stretching cards', async () => {
    const sheet = new CSSStyleSheet();
    await sheet.replace(await (await fetch('/blocks/landing/landing.css')).text());
    el.shadowRoot.adoptedStyleSheets = [...el.shadowRoot.adoptedStyleSheets, sheet];
    el.style.setProperty('--s2-spacing-200', '12px');
    const grid = el.shadowRoot.querySelector('.files');
    for (const [width, columns] of [[500, '226px 226px'], [300, '226px'], [150, '150px']]) {
      grid.style.width = `${width}px`;
      expect(getComputedStyle(grid).gridTemplateColumns).to.equal(columns);
    }
  });

  it('matches the mock composer branding, placeholder and disclaimer', () => {
    expect(el.shadowRoot.querySelector('.composer-input .coworker-icon')).not.to.equal(null);
    expect(el.shadowRoot.querySelector('textarea').placeholder).to.equal('Let me know your task — I can route you to the right app or tool');
    const note = el.shadowRoot.querySelector('#assistant-note');
    expect(note.textContent).to.include('AI responses may be inaccurate.');
    expect(note.querySelector('a').textContent).to.equal('AI User Guidelines');
    expect(note.querySelector('a').href).to.equal('https://www.adobe.com/legal/licenses-terms/adobe-dx-gen-ai-user-guidelines.html');
    expect(el.shadowRoot.querySelector('.composer-actions').textContent.trim()).to.equal('');
  });

  it('leaves the standalone nav selector intact without mounting a duplicate', async () => {
    const shell = nav.attachShadow({ mode: 'open' });
    const selector = document.createElement('nx-siteselector');
    shell.append(selector);
    expect(nav.children).to.have.length(0);
    hashChange._set({ org: 'org', site: 'other', fullpath: '/org/other' });
    await el.updateComplete;
    expect(shell.firstElementChild).to.equal(selector);
    el.remove();
    expect(selector.isConnected).to.equal(true);
    expect(nav.children).to.have.length(0);
    document.body.append(el);
    await el.updateComplete;
    expect(shell.firstElementChild).to.equal(selector);
    expect(nav.children).to.have.length(0);
  });

  it('offers Add site directly when no workspace is selected', async () => {
    const requested = sinon.spy();
    document.addEventListener('site-add', requested, { once: true });
    const { href } = window.location;
    hashChange._set(undefined);
    await el.updateComplete;
    const empty = el.shadowRoot.querySelector('.empty-state');
    expect(empty.querySelector('a')).to.equal(null);
    const button = empty.querySelector('button');
    expect(button.textContent).to.equal('Add site');
    button.click();
    expect(requested.calledOnce).to.equal(true);
    expect(requested.firstCall.args[0].bubbles).to.equal(true);
    expect(requested.firstCall.args[0].composed).to.equal(true);
    expect(window.location.href).to.equal(href);
    expect(el.shadowRoot.querySelector('da-add-site')).to.equal(null);
  });

  it('leaves shell-owned branding intact when disconnected and reconnected', async () => {
    const shell = nav.attachShadow({ mode: 'open' });
    const brand = document.createElement('a');
    brand.textContent = 'Shared product branding';
    shell.append(brand);
    el.remove();
    expect(shell.firstElementChild).to.equal(brand);
    expect(nav.querySelector('[slot="brand"]')).to.equal(null);
    document.body.append(el);
    await el.updateComplete;
    expect(shell.firstElementChild).to.equal(brand);
    expect(nav.querySelector('[slot="brand"]')).to.equal(null);
    expect(nav.querySelectorAll('[slot="search"]')).to.have.length(0);
  });

  it('loads files without fetching the removed comment feed or page metadata', async () => {
    loadSite.restore();
    const list = sinon.stub(source, 'list').resolves({ ok: true, items: ITEMS, permissions: ['write'] });
    const metadata = sinon.stub(source, 'getMetadata');
    const profile = sinon.stub(DaLanding.prototype, 'loadImsProfile');
    await el.loadSite();
    expect(list.calledOnceWithExactly('/org/site', { continuationToken: undefined })).to.equal(true);
    expect(metadata.called).to.equal(false);
    expect(profile.called).to.equal(false);
    expect(el._permissions).to.deep.equal(['write']);
  });

  it('leaves recent-site storage to the standalone selector when files load', async () => {
    loadSite.restore();
    localStorage.setItem('da-sites', JSON.stringify(['org/other']));
    sinon.stub(source, 'list').resolves({ ok: true, items: ITEMS });
    sinon.stub(DaLanding.prototype, 'loadImsProfile').resolves({});
    await el.loadSite();
    expect(JSON.parse(localStorage.getItem('da-sites'))).to.deep.equal(['org/other']);
  });

  it('keeps the plus icon when the Add menu marks its trigger active', () => {
    const trigger = el.shadowRoot.querySelector('.chat-add');
    trigger.setAttribute('data-active', '');
    expect(trigger.querySelector('use').getAttribute('href')).to.include('s2-icon-add-20-n.svg');
    expect(trigger.querySelectorAll('svg')).to.have.length(1);
    expect(trigger.querySelector('.icon-up')).to.equal(null);
  });

  it('uses standard shared cards with source-backed page previews', () => {
    const preview = el.shadowRoot.querySelector('da-file-item');
    expect(preview.documentPreview).to.equal(true);
    expect(preview.hasAttribute('layout')).to.equal(false);
    expect(preview.hasAttribute('dimensions')).to.equal(false);
    expect(preview.querySelector('[slot="metadata"]')).to.equal(null);
    expect(el.shadowRoot.querySelector('nx-card, .file-name')).to.equal(null);
  });

  it('opts into a light preview without saving a theme preference', () => {
    const { href } = window.location;
    const preference = localStorage.getItem('color-scheme');
    const container = document.createElement('div');
    try {
      const url = new URL(href);
      url.searchParams.set('theme', 'light');
      window.history.replaceState(null, '', url);
      loadLanding(container);
      expect(container.firstElementChild.dataset.theme).to.equal('light');
      expect(localStorage.getItem('color-scheme')).to.equal(preference);
      url.searchParams.delete('theme');
      window.history.replaceState(null, '', url);
      loadLanding(container);
      expect(container.firstElementChild.hasAttribute('data-theme')).to.equal(false);
    } finally {
      window.history.replaceState(null, '', href);
    }
  });

  it('uses Favorite wording while preserving existing saved favorites and filtering', async () => {
    localStorage.setItem('da-favorites', JSON.stringify({ '/org/site': [ITEMS[0].path] }));
    el.refreshFavorites();
    await el.updateComplete;
    const filter = el.shadowRoot.querySelectorAll('.filter')[1];
    expect(filter.textContent.trim()).to.equal('Favorite');
    expect(filter.getAttribute('aria-pressed')).to.equal('false');
    const item = el.shadowRoot.querySelector('da-file-item');
    await item.updateComplete;
    expect(item.isFavorited).to.equal(true);
    expect(item.shadowRoot.querySelector('.card-favorite').slot).to.equal('overlay-actions');
    const saved = localStorage.getItem('da-favorites');
    filter.click();
    await el.updateComplete;
    expect(filter.getAttribute('aria-pressed')).to.equal('true');
    expect(el._tab).to.equal('starred');
    expect(localStorage.getItem('da-favorites')).to.equal(saved);
    expect(el.shadowRoot.querySelector('.files').getAttribute('aria-label')).to.equal('Favorite files');
    expect(getFavorites('/org/site')).to.deep.equal([ITEMS[0].path]);
    expect(el.shadowRoot.querySelectorAll('.file')).to.have.length(1);
    el.shadowRoot.querySelector('da-file-item').requestFavorite();
    await el.updateComplete;
    expect(getFavorites('/org/site')).to.deep.equal([]);
    expect(el.shadowRoot.querySelector('.empty-state h3').textContent).to.equal('No favorites yet');
    expect(el.shadowRoot.querySelector('.empty-state p').textContent).to.equal('Add a file in this folder to favorites to keep it close.');
    expect(el.shadowRoot.textContent).not.to.match(/starred|unstar/i);
  });

  it('labels favorite actions consistently in grid and list views', async () => {
    for (const value of ['card', 'list']) {
      el.changeView({ detail: { value } });
      await el.updateComplete;
      const actions = el.shadowRoot.querySelector(value === 'card' ? 'da-file-item' : 'da-file-actions');
      expect(actions.path).to.equal(ITEMS[0].path);
      expect(actions.view).to.equal(value);
      expect(actions.isFavorited).to.equal(false);
      if (value === 'card') actions.requestFavorite();
      else actions.favorite();
      await el.updateComplete;
      const favorite = el.shadowRoot.querySelector(value === 'card' ? 'da-file-item' : 'da-file-actions');
      expect(favorite.isFavorited).to.equal(true);
      if (value === 'card') favorite.requestFavorite();
      else favorite.favorite();
      await el.updateComplete;
    }
  });

  it('uses Favorites wording when browser storage cannot save a favorite', async () => {
    sinon.stub(Storage.prototype, 'setItem').throws(new DOMException('Quota exceeded', 'QuotaExceededError'));
    el.shadowRoot.querySelector('da-file-item').requestFavorite();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('[role="alert"]').textContent).to.equal(
      'Could not save your favorites. Check that browser storage is available.',
    );
    expect(el.shadowRoot.querySelector('da-file-item').isFavorited).to.equal(false);
    expect(getFavorites('/org/site')).to.deep.equal([]);
  });

  it('does not leak another site’s favorites into this site', async () => {
    toggleFavorite('/org/other', ITEMS[0].path);
    el.refreshFavorites();
    el.changeTab('starred');
    await el.updateComplete;
    expect(el.shadowRoot.querySelectorAll('.file')).to.have.length(0);
  });

  it('keeps files and preferences when switching between grid and list', async () => {
    el.changeView({ detail: { value: 'list' } });
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.files')).to.equal(null);
    expect(el.shadowRoot.querySelectorAll('.file-table .file-row')).to.have.length(2);
    expect([...el.shadowRoot.querySelectorAll('.file-table th')].map((th) => th.textContent))
      .to.deep.equal(['Name', 'Folder', 'Modified at', 'File information and Favorite']);
    expect(el.shadowRoot.querySelector('.list-file-link').textContent).to.include('Welcome');
    expect(el.shadowRoot.querySelector('da-card-preview')).to.equal(null);
    expect(JSON.parse(localStorage.getItem('da-browse-settings')).view).to.equal('list');
    expect(el._files).to.equal(ITEMS);
  });

  it('reuses lazy image previews in list rows without adding page thumbnails to the list', async () => {
    el._files = [...ITEMS, { name: 'Image', path: '/org/site/image.png', ext: 'png' }];
    el.changeView({ detail: { value: 'list' } });
    await el.updateComplete;
    const previews = el.shadowRoot.querySelectorAll('da-card-preview');
    expect(previews).to.have.length(1);
    expect(previews[0].classList.contains('list-file-preview')).to.equal(true);
    expect(previews[0].path).to.equal('/org/site/image.png');
    expect(previews[0].getAttribute('aria-hidden')).to.equal('true');
    expect(previews[0].documentPreview).not.to.equal(true);
  });

  it('keeps the Canvas route when EW is enabled but chat is disabled', async () => {
    el._editor = '/canvas#';
    el._chatEnabled = false;
    await el.updateComplete;
    const href = new URL(el.shadowRoot.querySelector('da-file-item').href);
    expect(href.pathname).to.equal('/canvas');
    expect(el.shadowRoot.querySelector('textarea').disabled).to.equal(true);
  });

  it('refreshes starred files when another tab changes them', async () => {
    toggleFavorite('/org/site', ITEMS[0].path);
    window.dispatchEvent(new StorageEvent('storage', { key: 'da-favorites' }));
    el.changeTab('starred');
    await el.updateComplete;
    expect(el.shadowRoot.querySelectorAll('.file')).to.have.length(1);
  });

  it('clears the previous site prompt and filter when switching sites', async () => {
    el._prompt = 'A task for the old site';
    el.changeTab('starred');
    hashChange._set({ org: 'org', site: 'other', fullpath: '/org/other' });
    await el.updateComplete;
    expect(el._prompt).to.equal('');
    expect(el._tab).to.equal('recent');
    expect(el._scope).to.equal('org/other');
    expect(loadSite.callCount).to.equal(2);
  });

  it('loads the same scope once until its request is aborted', async () => {
    hashChange._set({ org: 'org', site: 'site', fullpath: '/org/site/folder' });
    hashChange._set({ org: 'org', site: 'site', fullpath: '/org/site/other' });
    await el.updateComplete;
    expect(loadSite.callCount).to.equal(1);
    el._request.abort();
    hashChange._set({ org: 'org', site: 'site', fullpath: '/org/site' });
    await el.updateComplete;
    expect(loadSite.callCount).to.equal(2);
  });

  it('keeps compact view dimensions while S/M changes preserve page state', async () => {
    el._prompt = 'Update this page';
    el._tab = 'starred';
    setUISize({ size: 'm' });
    await el.updateComplete;
    expect(el.dataset.uiSize).to.equal('m');
    expect(el.shadowRoot.querySelector('nx-segmented-btn').getAttribute('size')).to.equal('m');
    expect(el.shadowRoot.querySelector('nx-segmented-btn').getAttribute('variant')).to.equal('quiet');
    expect(el.shadowRoot.querySelector('button[type="submit"]').classList.contains('nx-btn-lg')).to.equal(true);
    expect(el._prompt).to.equal('Update this page');
    expect(el._tab).to.equal('starred');
    expect(el._files).to.equal(ITEMS);
    setUISize({ size: 's' });
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('nx-segmented-btn').getAttribute('size')).to.equal('m');
    expect(el.shadowRoot.querySelector('button[type="submit"]').classList.contains('nx-btn-lg')).to.equal(false);
  });

  it('shows a choose-site state without pretending there are no files', async () => {
    hashChange._set(undefined);
    await el.updateComplete;
    expect(el.shadowRoot.textContent).to.include('Choose a site to get started');
    expect(el.shadowRoot.querySelector('textarea').disabled).to.equal(true);
  });

  it('shows permission errors with a retry instead of an empty file panel', async () => {
    el._files = undefined;
    el._error = 'Check your site permissions.';
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('[role="alert"]').textContent).to.include('permissions');
    expect(el.shadowRoot.textContent).to.include('Try again');
    expect(el.shadowRoot.textContent).not.to.include('No files here yet');
  });

  it('opens the existing chat panel and sends the central prompt', async () => {
    el._chatEnabled = true;
    el._prompt = '  Update the hero  ';
    let detail;
    document.addEventListener('nx-panel-open', (event) => {
      detail = event.detail;
      detail.options.onReady();
    }, { once: true });
    await el.submitPrompt({ preventDefault() {} });
    expect(detail.section).to.equal('chat');
    expect(detail.options.text).to.equal('Update the hero');
    expect(detail.options.autoSend).to.equal(true);
    expect(el._prompt).to.equal('');
    expect(el._handingOff).to.equal(false);
  });

  ['nx-chat', 'nx-chat-ao'].forEach((tag) => {
    it(`submits through ${tag}'s public prompt API after the panel opens`, async () => {
      ewFlags.setEWEnabled(true);
      await el.loadChatAvailability(new AbortController());
      const aside = document.createElement('aside');
      const chat = document.createElement(tag);
      chat.setPrompt = sinon.stub().resolves();
      aside.append(chat);
      el._prompt = 'Update the hero';
      let handoff;
      document.addEventListener('nx-panel-open', ({ detail }) => {
        handoff = panelSections.get('chat').onShow(aside, 'chat', detail.options);
      }, { once: true });
      await el.submitPrompt({ preventDefault() {} });
      await handoff;
      expect(chat.setPrompt.calledOnceWithExactly('Update the hero', { autoSend: true })).to.equal(true);
      expect(el._prompt).to.equal('');
      expect(el._handingOff).to.equal(false);
    });
  });

  it('does not send twice while the assistant is opening', async () => {
    el._chatEnabled = true;
    el._prompt = 'Update the hero';
    const listener = sinon.spy();
    document.addEventListener('nx-panel-open', listener);
    await el.submitPrompt({ preventDefault() {} });
    await el.submitPrompt({ preventDefault() {} });
    document.removeEventListener('nx-panel-open', listener);
    expect(listener.calledOnce).to.equal(true);
    expect(el._prompt).to.equal('Update the hero');
    listener.firstCall.args[0].detail.options.onReady();
    expect(el._prompt).to.equal('');
  });

  it('retains the central draft when the assistant is still responding', async () => {
    ewFlags.setEWEnabled(true);
    await el.loadChatAvailability(new AbortController());
    const chat = { thinking: true, setPrompt: sinon.spy() };
    const onReady = sinon.spy();
    el._prompt = 'Update the hero';
    el._handingOff = true;
    await panelSections.get('chat').onShow({ querySelector: () => chat }, 'chat', { text: el._prompt, autoSend: true, onReady });
    expect(chat.setPrompt.called).to.equal(false);
    expect(onReady.called).to.equal(false);
    expect(el._prompt).to.equal('Update the hero');
    expect(el._chatError).to.include('still responding');
    expect(el._handingOff).to.equal(false);
  });

  it('does not send an old-site prompt if the scope changes while chat is rendering', async () => {
    ewFlags.setEWEnabled(true);
    const request = new AbortController();
    await el.loadChatAvailability(request);
    let ready;
    const chat = {
      updateComplete: new Promise((resolve) => { ready = resolve; }),
      setPrompt: sinon.spy(),
    };
    const onReady = sinon.spy();
    const showing = panelSections.get('chat').onShow({ querySelector: () => chat }, 'chat', { text: 'Old-site task', autoSend: true, onReady });
    request.abort();
    ready();
    await showing;
    expect(chat.setPrompt.called).to.equal(false);
    expect(onReady.called).to.equal(false);
  });

  it('does not submit while chat is disabled', async () => {
    el._chatEnabled = false;
    el._prompt = 'Update the hero';
    const listener = sinon.spy();
    document.addEventListener('nx-panel-open', listener);
    await el.submitPrompt({ preventDefault() {} });
    document.removeEventListener('nx-panel-open', listener);
    expect(listener.called).to.equal(false);
    expect(el._prompt).to.equal('Update the hero');
  });

  it('keeps Add local until an item is selected, then hands off the selected action', async () => {
    el._chatEnabled = true;
    await el.updateComplete;
    const listener = sinon.spy();
    document.addEventListener('nx-panel-open', listener);
    const menu = el.shadowRoot.querySelector('nx-menu');
    menu.show();
    expect(menu.open).to.equal(true);
    expect(listener.called).to.equal(false);
    menu.choose('prompt');
    document.removeEventListener('nx-panel-open', listener);
    expect(listener.calledOnce).to.equal(true);
    const { detail } = listener.firstCall.args[0];
    expect(detail.section).to.equal('chat');
    expect(detail.options.action).to.equal('prompt');
    expect(detail.options.autoSend).to.equal(undefined);
    expect(el._prompt).to.equal('');
  });

  it('opens the native file picker directly without opening the assistant first', async () => {
    el._chatEnabled = true;
    await el.updateComplete;
    const click = sinon.stub(el.shadowRoot.querySelector('.landing-file-input'), 'click');
    const open = sinon.stub(el, 'openAssistant').resolves();
    await el.selectAddAction({ detail: { id: 'files' } });
    expect(click.calledOnce).to.equal(true);
    expect(open.called).to.equal(false);
  });

  it('highlights only file drags and keeps the dropzone active across composer children', async () => {
    el._chatEnabled = true;
    await el.updateComplete;
    const form = el.shadowRoot.querySelector('.composer');
    const textarea = form.querySelector('textarea');
    const enter = dragEvent({ type: 'dragenter' });
    textarea.dispatchEvent(enter);
    await el.updateComplete;
    expect(enter.defaultPrevented).to.equal(true);
    expect(form.classList.contains('is-dropzone')).to.equal(true);
    textarea.dispatchEvent(dragEvent({ type: 'dragleave', relatedTarget: form.querySelector('.chat-add') }));
    await el.updateComplete;
    expect(form.classList.contains('is-dropzone')).to.equal(true);
    form.dispatchEvent(dragEvent({ type: 'dragleave' }));
    await el.updateComplete;
    expect(form.classList.contains('is-dropzone')).to.equal(false);
    const text = dragEvent({ type: 'dragenter', text: true });
    textarea.dispatchEvent(text);
    await el.updateComplete;
    expect(text.defaultPrevented).to.equal(false);
    expect(form.classList.contains('is-dropzone')).to.equal(false);
  });

  it('clears the drop highlight and hands dropped files to the existing attachment flow', async () => {
    el._chatEnabled = true;
    el._prompt = 'Use this draft';
    await el.updateComplete;
    const add = sinon.stub(el, 'addFiles').resolves();
    const form = el.shadowRoot.querySelector('.composer');
    form.dispatchEvent(dragEvent({ type: 'dragenter' }));
    form.dispatchEvent(dragEvent({ type: 'dragover' }));
    const drop = dragEvent({ type: 'drop' });
    form.dispatchEvent(drop);
    await el.updateComplete;
    expect(drop.defaultPrevented).to.equal(true);
    expect(form.classList.contains('is-dropzone')).to.equal(false);
    expect(add.calledOnce).to.equal(true);
    expect(add.firstCall.args[0][0].name).to.equal('draft.md');
    expect(el._prompt).to.equal('Use this draft');
  });

  it('rejects file drops while the assistant is unavailable or already handing off', async () => {
    const add = sinon.stub(el, 'addFiles').resolves();
    const form = el.shadowRoot.querySelector('.composer');
    for (const state of [
      { enabled: false, handingOff: false },
      { enabled: true, handingOff: true },
    ]) {
      el._chatEnabled = state.enabled;
      el._handingOff = state.handingOff;
      form.dispatchEvent(dragEvent({ type: 'dragenter' }));
      const drop = dragEvent({ type: 'drop' });
      form.dispatchEvent(drop);
      await el.updateComplete;
      expect(drop.defaultPrevented).to.equal(true);
      expect(drop.dataTransfer.dropEffect).to.equal('none');
      expect(form.classList.contains('is-dropzone')).to.equal(false);
    }
    expect(add.called).to.equal(false);
  });

  it('clears a file drag when changing sites or disconnecting', async () => {
    el._chatEnabled = true;
    const form = el.shadowRoot.querySelector('.composer');
    form.dispatchEvent(dragEvent({ type: 'dragenter' }));
    hashChange._set({ org: 'org', site: 'other', fullpath: '/org/other' });
    await el.updateComplete;
    expect(form.classList.contains('is-dropzone')).to.equal(false);
    el._dragging = true;
    el.remove();
    expect(el._dragging).to.equal(false);
  });

  it('reports unsupported dropped files without opening chat or losing the draft', async () => {
    el._chatEnabled = true;
    el._prompt = 'Use this draft';
    const open = sinon.stub(el, 'openAssistant').resolves();
    await el.addFiles([new File(['data'], 'archive.zip', { type: 'application/zip' })]);
    await el.updateComplete;
    expect(el._chatError).to.include('Use images, PDFs or Markdown files');
    expect(open.called).to.equal(false);
    expect(el._prompt).to.equal('Use this draft');
  });

  it('keeps the native picker on the same attachment flow and resets its selection', async () => {
    const file = new File(['A draft'], 'draft.md', { type: 'text/markdown' });
    const target = { files: [file], value: 'draft.md' };
    const add = sinon.stub(el, 'addFiles').resolves();
    await el.attachFiles({ target });
    expect(add.calledOnceWithExactly([file])).to.equal(true);
    expect(target.value).to.equal('');
  });

  it('preserves a typed prompt while cancelling Add or handing off an action', async () => {
    el._chatEnabled = true;
    el._prompt = 'Update the hero';
    await el.updateComplete;
    const menu = el.shadowRoot.querySelector('nx-menu');
    menu.show();
    menu.pressEscape();
    expect(el._prompt).to.equal('Update the hero');
    const open = sinon.stub(el, 'openAssistant').resolves();
    menu.choose('command');
    expect(open.calledOnceWithExactly({ text: 'Update the hero', action: 'command' })).to.equal(true);
    expect(el._prompt).to.equal('Update the hero');
  });

  it('uses shared favorite behavior in grid without losing the star state in the table', async () => {
    el.starFile(ITEMS[0]);
    el.changeTab('starred');
    await el.updateComplete;
    const item = el.shadowRoot.querySelector('da-file-item');
    await item.updateComplete;
    expect(item.shadowRoot.querySelector('.card-favorite').getAttribute('aria-pressed')).to.equal('true');
    el.changeView({ detail: { value: 'list' } });
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.file-table').getAttribute('aria-label')).to.equal('Favorite files');
    expect(el.shadowRoot.querySelector('.file-row da-file-actions').isFavorited).to.equal(true);
    el.shadowRoot.querySelector('.file-row da-file-actions').favorite();
    await el.updateComplete;
    expect(el.shadowRoot.textContent).to.include('No favorites yet');
  });

  it('does not fetch modifier metadata for every row before details are requested', async () => {
    const metadata = sinon.stub(source, 'getMetadata');
    el._request = new AbortController();
    el.changeView({ detail: { value: 'list' } });
    await el.updateComplete;
    await new Promise((resolve) => { setTimeout(resolve); });
    await el.updateComplete;
    expect(metadata.callCount).to.equal(0);
    expect(el.shadowRoot.querySelectorAll('.file-row da-file-actions')).to.have.length(2);
    expect(el.shadowRoot.querySelector('.file-modifier')).to.equal(null);
    el.changeView({ detail: { value: 'card' } });
    await el.updateComplete;
    el.changeView({ detail: { value: 'list' } });
    await el.updateComplete;
    expect(metadata.callCount).to.equal(0);
  });

  it('caps Favorite at ten without deleting saved favorites or expanding the widget', async () => {
    el._files = Array.from({ length: 12 }, (_, i) => ({ name: `Page ${i}`, path: `/org/site/page-${i}.html`, ext: 'html' }));
    const paths = el._files.map((item) => item.path);
    localStorage.setItem('da-favorites', JSON.stringify({ '/org/site': paths }));
    el.refreshFavorites();
    el.changeTab('starred');
    el._limit = 50;
    await el.updateComplete;
    expect(el.shadowRoot.querySelectorAll('.file')).to.have.length(10);
    expect(el.shadowRoot.querySelector('.show-more')).to.equal(null);
    expect(getFavorites('/org/site')).to.deep.equal(paths);
    expect(el.shadowRoot.querySelector('.all-files')).not.to.equal(null);
  });

  it('shows more than ten files only when requested', async () => {
    el._files = Array.from({ length: 12 }, (_, i) => ({ name: `Page ${i}`, path: `/org/site/page-${i}.html`, ext: 'html' }));
    await el.updateComplete;
    expect(el.shadowRoot.querySelectorAll('.file')).to.have.length(10);
    el.shadowRoot.querySelector('.show-more').click();
    await el.updateComplete;
    expect(el.shadowRoot.querySelectorAll('.file')).to.have.length(12);
  });

  it('ignores a stale listing response after changing sites', async () => {
    loadSite.restore();
    let finishOld;
    const list = sinon.stub(source, 'list');
    list.onFirstCall().returns(new Promise((resolve) => { finishOld = resolve; }));
    list.onSecondCall().resolves({ ok: true, items: [{ name: 'New', path: '/org/other/new.html', ext: 'html' }] });
    const oldRequest = el.loadSite();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    hashChange._set({ org: 'org', site: 'other', fullpath: '/org/other' });
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    finishOld({ ok: true, items: ITEMS });
    await oldRequest;
    expect(el._files[0].path).to.equal('/org/other/new.html');
  });

  it('does not update a disconnected component when a listing finishes', async () => {
    loadSite.restore();
    let finish;
    sinon.stub(source, 'list').returns(new Promise((resolve) => { finish = resolve; }));
    const request = el.loadSite();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    el.remove();
    finish({ ok: true, items: ITEMS });
    await request;
    expect(el._files).to.equal(undefined);
  });
});
