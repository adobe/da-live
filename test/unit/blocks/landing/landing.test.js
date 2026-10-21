import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-nx.js';
import { getFavorites, toggleFavorite } from '../../../../blocks/browse/shared/favorites.js';
import { setUISize } from '../../../fixtures/nx2/utils/ui-size.js';
import loadLanding, { DaLanding } from '../../../../blocks/landing/landing.js';
import { getNx, getNx2Api } from '../../../../scripts/utils.js';

const { hashChange } = await import(`${getNx()}/utils/utils.js`);
const { source } = await getNx2Api();

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
    loadSite = sinon.stub(DaLanding.prototype, 'loadSite').resolves();
    nav = document.createElement('nx-nav');
    document.body.append(nav);
    el = document.createElement('da-landing');
    document.body.append(el);
    el._files = ITEMS;
    await el.updateComplete;
  });

  afterEach(() => {
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
    expect(nav.querySelector('nx-picker').value).to.equal('org/site');
    expect(el.shadowRoot.querySelector('.file-date').textContent).to.include('Last Edited');
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

  it('mounts the workspace dropdown in nav and cleans it up on disconnect', async () => {
    expect(nav.querySelector('[slot="search"]')).to.equal(el._sitePicker);
    expect(el._sitePicker.variant).to.equal('field');
    expect(el._sitePicker.size).to.equal('m');
    expect(el._sitePicker.items.at(-1).label).to.equal('Browse sites...');
    expect(nav.querySelector('[slot="brand"], [slot="actions"]')).to.equal(null);
    hashChange._set({ org: 'org', site: 'other', fullpath: '/org/other' });
    await el.updateComplete;
    expect(el._sitePicker.value).to.equal('org/other');
    el.remove();
    expect(nav.querySelector('nx-picker')).to.equal(null);
    expect(nav.children).to.have.length(0);
    document.body.append(el);
    await el.updateComplete;
    expect(nav.querySelectorAll('nx-picker')).to.have.length(1);
    expect(el._sitePicker.value).to.equal('org/other');
  });

  it('shows site-themed sample tasks with translation first, without presenting them as live data', () => {
    expect(el.shadowRoot.querySelector('#tasks-heading').textContent).to.equal('Need Attention');
    expect([...el.shadowRoot.querySelectorAll('.task-column-heading > span')].map((label) => label.textContent)).to.deep.equal([
      'Page / Content Fragment', 'Process Description', 'Status', 'Requester',
    ]);
    expect(el.shadowRoot.querySelector('.tasks-preview-note').textContent).to.equal('Sample tasks for layout preview. Not live site data.');
    expect(el.shadowRoot.querySelector('.tasks-panel').textContent).not.to.include('No tasks');
    expect(el.shadowRoot.querySelector('.tasks-panel table').getAttribute('aria-labelledby')).to.equal('tasks-heading');
    expect(el.shadowRoot.querySelector('.tasks-panel table').getAttribute('aria-describedby')).to.equal('tasks-availability');
    expect(el.shadowRoot.querySelector('.tasks-table .tasks-preview-note')).not.to.equal(null);
    expect(el.shadowRoot.querySelector('.tasks-scroll .tasks-preview-note')).to.equal(null);
    const rows = [...el.shadowRoot.querySelectorAll('.tasks-panel tbody tr')];
    expect(rows.map((row) => row.cells[0].textContent)).to.deep.equal([
      'Frescopa Homepage', 'Atelier Nova', 'Taste Profiles', 'Coffee Machines', 'Atelier Nova Campaign',
    ]);
    expect(rows.map((row) => row.cells[1].textContent)).to.deep.equal([
      'Translation rollout, de, fr', 'Review product copy', 'Review coffee taste profiles',
      'Update product details', 'Publish launch campaign',
    ]);
    expect(rows.map((row) => row.querySelector('.task-status').textContent.trim())).to.deep.equal([
      'Need Approval', 'Need Approval', 'In-Progress', 'Scheduled', 'Scheduled',
    ]);
    expect(rows.map((row) => row.querySelector('.task-requester').textContent.trim())).to.deep.equal([
      'Eva', 'Steven', 'Michael', 'Sara', 'Karina',
    ]);
    expect(el.shadowRoot.querySelector('.tasks-panel').textContent).not.to.match(/nike|pegasus|jersey|just-do-it/i);
    expect(el.shadowRoot.querySelectorAll('.tasks-panel tbody a, .tasks-panel tbody button')).to.have.length(0);
    expect(el.shadowRoot.querySelectorAll('.task-requester img')).to.have.length(5);
  });

  it('lists the user’s open comment threads above the sample tasks, deep-linked to the editor', async () => {
    el._comments = [{
      id: 'thread-1',
      file: { name: 'index', path: '/org/site/index.html', ext: 'html' },
      body: 'Please tighten the hero copy',
      author: { name: 'alex', email: 'alex@example.test' },
      replyCount: 1,
      updatedAt: 50,
    }];
    await el.updateComplete;
    const rows = [...el.shadowRoot.querySelectorAll('.tasks-panel tbody tr')];
    expect(rows).to.have.length(6);
    expect(rows[0].classList.contains('comment-task')).to.equal(true);
    expect(rows[0].cells[1].textContent).to.equal('Please tighten the hero copy');
    expect(rows[0].querySelector('.task-status').textContent.trim()).to.equal('Open Comment');
    expect(rows[0].querySelector('.task-requester > span:last-child').textContent).to.equal('alex');
    const link = new URL(rows[0].querySelector('a.task-link').href);
    expect(link.searchParams.get('comment')).to.equal('thread-1');
    expect(link.hash).to.include('/org/site/index');
    expect(rows[1].cells[0].textContent).to.equal('Frescopa Homepage');
    expect(el.shadowRoot.querySelector('.tasks-preview-note').textContent).to.include('live unresolved comment threads');
    expect(el.shadowRoot.querySelector('.tasks-comments-status')).to.equal(null);
  });

  it('shows comment loading and failure states without hiding the sample tasks', async () => {
    expect(el.shadowRoot.querySelector('.tasks-comments-status').textContent).to.include('Loading');
    el._comments = [];
    el._commentsError = 'Could not load your comments: nope';
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.tasks-comments-status').textContent).to.include('nope');
    expect(el.shadowRoot.querySelectorAll('.tasks-panel tbody tr')).to.have.length(5);
  });

  it('loads comments for the signed-in user after the file listing', async () => {
    loadSite.restore();
    sinon.stub(source, 'list').resolves({ ok: true, items: ITEMS });
    sinon.stub(DaLanding.prototype, 'loadImsProfile').resolves({});
    await el.loadSite();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(el._comments).to.deep.equal([]);
    expect(el._commentsError).to.include('Sign in');
  });

  it('shows each task column’s options without pretending task controls are connected', () => {
    const buttons = [...el.shadowRoot.querySelectorAll('.task-column-options')];
    expect(buttons).to.have.length(4);
    buttons.forEach((button) => {
      expect(button.disabled).to.equal(true);
      expect(button.getAttribute('aria-label')).to.include('column options');
      expect(button.getAttribute('aria-describedby')).to.equal('tasks-availability');
      expect(button.querySelector('.column-options-icon')).not.to.equal(null);
    });
  });

  it('keeps the plus icon when the Add menu marks its trigger active', () => {
    const trigger = el.shadowRoot.querySelector('.chat-add');
    trigger.setAttribute('data-active', '');
    expect(trigger.querySelector('use').getAttribute('href')).to.include('s2-icon-add-20-n.svg');
    expect(trigger.querySelectorAll('svg')).to.have.length(1);
    expect(trigger.querySelector('.icon-up')).to.equal(null);
  });

  it('uses source-backed page previews and local semantic file icons', () => {
    const preview = el.shadowRoot.querySelector('da-card-preview');
    expect(preview.documentPreview).to.equal(true);
    expect(preview.iconHref).to.include('/blocks/landing/page.svg');
    expect(el.shadowRoot.querySelector('.file-type-icon').getAttribute('style')).to.include('page.svg');
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

  it('uses existing root favorites and allows a file to be starred/unstarred', async () => {
    el.starFile(ITEMS[0]);
    expect(getFavorites('/org/site')).to.deep.equal([ITEMS[0].path]);
    el.changeTab('starred');
    await el.updateComplete;
    expect(el.shadowRoot.querySelectorAll('.file')).to.have.length(1);
    el.starFile(ITEMS[0]);
    await el.updateComplete;
    expect(el.shadowRoot.textContent).to.include('No starred files yet');
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
      .to.deep.equal(['Name', 'Folder', 'Modified at', 'Modified by', 'Star']);
    expect(el.shadowRoot.querySelector('.list-file-link').textContent).to.include('Welcome');
    expect(el.shadowRoot.querySelector('da-card-preview')).to.equal(null);
    expect(JSON.parse(localStorage.getItem('da-browse-settings')).view).to.equal('list');
    expect(el._files).to.equal(ITEMS);
  });

  it('keeps the Canvas route when EW is enabled but chat is disabled', async () => {
    el._editor = '/canvas#';
    el._chatEnabled = false;
    await el.updateComplete;
    const href = new URL(el.shadowRoot.querySelector('.file-link').href);
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

  it('switches S/M live without losing the prompt, filter or files', async () => {
    el._prompt = 'Update this page';
    el._tab = 'starred';
    setUISize({ size: 'm' });
    await el.updateComplete;
    expect(el.dataset.uiSize).to.equal('m');
    expect(nav.querySelector('nx-picker').size).to.equal('m');
    expect(el.shadowRoot.querySelector('nx-segmented-btn').getAttribute('size')).to.equal('m');
    expect(el.shadowRoot.querySelector('button[type="submit"]').classList.contains('nx-btn-lg')).to.equal(true);
    expect(el._prompt).to.equal('Update this page');
    expect(el._tab).to.equal('starred');
    expect(el._files).to.equal(ITEMS);
    setUISize({ size: 's' });
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('nx-segmented-btn').getAttribute('size')).to.equal('s');
    expect(el.shadowRoot.querySelector('button[type="submit"]').classList.contains('nx-btn-lg')).to.equal(false);
  });

  it('shows a choose-site state without pretending there are no files', async () => {
    hashChange._set(undefined);
    await el.updateComplete;
    expect(el.shadowRoot.textContent).to.include('Choose a site to get started');
    expect(el.shadowRoot.querySelector('textarea').disabled).to.equal(true);
  });

  it('surfaces malformed recent-site storage and retains the hash site', async () => {
    localStorage.setItem('da-sites', '{invalid');
    el.loadSites();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('[role="status"]').textContent).to.include('Could not read recent sites');
    expect(el._sites[0].value).to.equal('org/site');
  });

  it('shows permission errors with a retry instead of an empty file panel', async () => {
    el._files = undefined;
    el._error = 'Check your site permissions.';
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('[role="alert"]').textContent).to.include('permissions');
    expect(el.shadowRoot.textContent).to.include('Try again');
    expect(el.shadowRoot.textContent).not.to.include('No files here yet');
  });

  it('hands a prompt to the existing chat panel without auto-sending', async () => {
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
    expect(detail.options.autoSend).to.equal(undefined);
    expect(el._prompt).to.equal('');
    expect(el._handingOff).to.equal(false);
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

  it('uses the same grey starred asset in grid and table without losing the star state', async () => {
    el.starFile(ITEMS[0]);
    el.changeTab('starred');
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.file-star img').src).to.include('/landing/star-filled.svg');
    el.changeView({ detail: { value: 'list' } });
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.file-row .file-star').getAttribute('aria-pressed')).to.equal('true');
    el.shadowRoot.querySelector('.file-row .file-star').click();
    await el.updateComplete;
    expect(el.shadowRoot.textContent).to.include('No starred files yet');
  });

  it('does not apply stale modifier metadata after a site request is aborted', async () => {
    const request = new AbortController();
    let finish;
    sinon.stub(source, 'getMetadata').returns(new Promise((resolve) => { finish = resolve; }));
    const pending = el.loadModifier(ITEMS[0], request);
    await new Promise((resolve) => { setTimeout(resolve); });
    request.abort();
    finish(new Response(null, { headers: { 'x-last-modified-by': 'old@example.test' } }));
    await pending;
    expect(el._modifiers).to.equal(undefined);
  });

  it('loads visible list modifiers once and identifies unreadable metadata', async () => {
    const metadata = sinon.stub(source, 'getMetadata');
    metadata.onFirstCall().resolves(new Response(null, { headers: { 'x-last-modified-by': 'alex@example.test' } }));
    metadata.onSecondCall().resolves(new Response(null, { status: 403 }));
    el._request = new AbortController();
    el.changeView({ detail: { value: 'list' } });
    await el.updateComplete;
    await new Promise((resolve) => { setTimeout(resolve); });
    await el.updateComplete;
    expect(metadata.callCount).to.equal(2);
    const cells = el.shadowRoot.querySelectorAll('.file-modifier');
    expect(cells[0].textContent).to.include('alex');
    expect(cells[1].textContent).to.equal('Unavailable');
    el.changeView({ detail: { value: 'card' } });
    await el.updateComplete;
    el.changeView({ detail: { value: 'list' } });
    await el.updateComplete;
    expect(metadata.callCount).to.equal(2);
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
