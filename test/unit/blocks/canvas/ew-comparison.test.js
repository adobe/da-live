import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../scripts/utils.js';
import { canvasBus } from '../../../../blocks/canvas/utils/canvas-bus.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
let comparison;
const page = { org: 'example', site: 'site', path: 'page' };

before(async () => {
  comparison = await import('../../../../blocks/canvas/ew-comparison/comparison.js');
  await import('../../../../blocks/canvas/ew-canvas-versions/ew-canvas-compare.js');
});

describe('embedded existing comparison view', () => {
  let element;
  afterEach(() => element?.remove());

  it('uses an inline region without a modal popover or focus trap', async () => {
    element = document.createElement('ew-canvas-compare');
    element.embedded = true;
    element.currentLabel = 'Live';
    element.label = 'Current document';
    element.split = true;
    element.diffDom = new DOMParser().parseFromString('<p><del>Old</del><ins>New</ins></p>', 'text/html').body;
    document.body.append(element);
    await element.updateComplete;
    expect(element.shadowRoot.querySelector('nx-popover') === null).to.equal(true);
    expect(!!element.shadowRoot.querySelector('[role="region"]')).to.equal(true);
    expect(element.shadowRoot.textContent).to.include('Live');
    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).to.equal(false);
  });

  it('keeps both changes and labels in the embedded unified view', async () => {
    element = document.createElement('ew-canvas-compare');
    element.embedded = true;
    element.currentLabel = 'Live';
    element.label = 'Current document';
    element.split = false;
    element.dom = new DOMParser().parseFromString('<p>New</p>', 'text/html').body;
    element.diffDom = new DOMParser().parseFromString('<p><del class="diffdel">Old</del><ins class="diffins">New</ins></p>', 'text/html').body;
    document.body.append(element);
    await element.updateComplete;
    const body = element.shadowRoot.querySelector('.ew-cc-body');
    expect(body.querySelector('del')?.textContent).to.equal('Old');
    expect(body.querySelector('ins')?.textContent).to.equal('New');
    expect([...element.shadowRoot.querySelectorAll('.ew-cc-chip')].map((chip) => chip.textContent)).to.deep.equal(['Live', 'Current document']);
  });

  it('matches the candidate pill to the addition highlight', async () => {
    element = document.createElement('ew-canvas-compare');
    element.embedded = true;
    element.split = true;
    element.currentLabel = 'Live';
    element.label = 'Preview';
    element.diffDom = new DOMParser().parseFromString('<p><del class="diffdel">Old</del><ins class="diffins">New</ins></p>', 'text/html').body;
    element.style.setProperty('--s2-green-200', '#d7f7e1');
    element.style.setProperty('--s2-red-200', '#ffebe8');
    element.style.setProperty('--s2-blue-200', '#e5f0fe');
    document.body.append(element);
    await element.updateComplete;
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(await (await fetch('/blocks/canvas/ew-canvas-versions/ew-canvas-compare.css')).text());
    element.shadowRoot.adoptedStyleSheets = [sheet];
    const color = (selector) => getComputedStyle(element.shadowRoot.querySelector(selector)).backgroundColor;
    expect(color('.ew-cc-chip:not(.is-neutral)')).to.equal(color('ins'));
    expect(color('.ew-cc-chip.is-neutral')).to.equal(color('del'));
  });
});

describe('standalone workspace comparison', () => {
  let mountRoot;
  let editor;
  let rail;
  let controller;
  let context;
  let calls;
  let html;

  beforeEach(() => {
    expect(comparison.installComparison).to.be.a('function');
    context = { ...page };
    html = '<h1>Current document</h1><p>New author text</p>';
    calls = [];
    mountRoot = document.createElement('div');
    editor = document.createElement('textarea');
    editor.value = 'Editor state';
    rail = document.createElement('input');
    rail.value = 'Review note';
    mountRoot.append(editor);
    document.body.append(mountRoot, rail);
    controller = comparison.installComparison({
      mountRoot,
      getContext: () => context,
      getDocument: () => html,
      saveDocument: async () => ({ ok: true }),
      loadContent: async (partition) => {
        calls.push(partition);
        return { html: `<h1>${partition}</h1><p>${partition} content</p>` };
      },
    });
  });
  afterEach(() => {
    controller?.destroy();
    mountRoot?.remove();
    rail?.remove();
  });

  it('compares current document to live without fetching or updating preview', async () => {
    expect(await controller.open({ candidate: 'document', baseline: 'live' })).to.deep.equal({ ok: true });
    expect(calls).to.deep.equal(['live']);
    const surface = mountRoot.querySelector('ew-comparison');
    await surface.updateComplete;
    const view = surface.shadowRoot.querySelector('ew-canvas-compare');
    await view.updateComplete;
    expect(view.shadowRoot.textContent).to.include('New author text');
    expect(editor.isConnected).to.equal(true);
    expect(editor.inert).to.equal(true);
    expect(rail.inert).to.equal(false);
    rail.focus();
    expect(document.activeElement === rail).to.equal(true);
    controller.close();
    expect(editor.inert).to.equal(false);
    expect(editor.value).to.equal('Editor state');
    expect(rail.value).to.equal('Review note');
  });

  it('compares preview/live without consulting the editor document', async () => {
    html = undefined;
    expect((await controller.open({ candidate: 'preview', baseline: 'live' })).ok).to.equal(true);
    expect(calls).to.have.members(['preview', 'live']);
  });

  it('switches between split and unified diffs without losing changes', async () => {
    await controller.open({ candidate: 'document', baseline: 'live' });
    const surface = mountRoot.querySelector('ew-comparison');
    await surface.updateComplete;
    const view = surface.shadowRoot.querySelector('ew-canvas-compare');
    await view.updateComplete;
    const diff = surface.diffDom.innerHTML;
    for (const split of [false, true, false]) {
      view.shadowRoot.querySelector('button[aria-pressed]').click();
      // eslint-disable-next-line no-await-in-loop
      await surface.updateComplete;
      // eslint-disable-next-line no-await-in-loop
      await view.updateComplete;
      expect(view.split).to.equal(split);
      expect(view.shadowRoot.querySelector('button[aria-pressed]').getAttribute('aria-pressed')).to.equal(String(split));
      const body = view.shadowRoot.querySelector(split ? '.ew-cc-split' : '.ew-cc-body');
      expect(body.querySelectorAll('ins').length).to.be.greaterThan(0);
      expect(body.querySelectorAll('del').length).to.be.greaterThan(0);
      expect(surface.diffDom.innerHTML).to.equal(diff);
    }
  });

  ['document', 'preview'].forEach((candidate) => {
    it(`shows only the comparison timestamp for ${candidate}`, async () => {
      await controller.open({ candidate, baseline: 'live' });
      const surface = mountRoot.querySelector('ew-comparison');
      await surface.updateComplete;
      expect(surface.shadowRoot.querySelector('.status').textContent.trim()).to.equal(`Compared at ${surface.loadedAt}.`);
    });
  });

  it('rejects arbitrary inputs and stale plugin page contexts', async () => {
    expect((await controller.open({ candidate: 'url', baseline: 'live' })).ok).to.equal(false);
    const result = await new Promise((resolve) => {
      canvasBus.comparisonRequest.emit({
        action: 'openComparison',
        details: { candidate: 'document', baseline: 'live' },
        context: { ...page, path: 'another-page' },
        resolve,
      });
    });
    expect(result).to.deep.equal({ ok: false, error: 'stale-context' });
    expect(calls).to.have.length(0);
  });

  it('closes and discards a delayed response when page context changes', async () => {
    controller.destroy();
    let complete;
    let started;
    const loading = new Promise((resolve) => { started = resolve; });
    controller = comparison.installComparison({
      mountRoot,
      getContext: () => context,
      getDocument: () => html,
      loadContent: () => new Promise((resolve) => {
        complete = resolve;
        started();
      }),
    });
    const pending = controller.open({ candidate: 'document', baseline: 'live' });
    await loading;
    context = { ...page, path: 'next' };
    controller.contextChanged();
    complete({ html: '<p>Old page response</p>' });
    expect((await pending).ok).to.equal(false);
    expect(mountRoot.querySelector('ew-comparison') === null).to.equal(true);
    expect(editor.inert).to.equal(false);
  });

  it('marks an open document comparison stale after editor changes', async () => {
    await controller.open({ candidate: 'document', baseline: 'live' });
    canvasBus.editorHtmlState.emit({ html: '<p>Later edit</p>' });
    const surface = mountRoot.querySelector('ew-comparison');
    await surface.updateComplete;
    expect(surface.shadowRoot.textContent).to.include('changed');
  });

  it('exposes the save handshake separately from read-only comparison', async () => {
    const result = await new Promise((resolve) => {
      canvasBus.comparisonRequest.emit({ action: 'saveDocument', context: page, resolve });
    });
    expect(result).to.deep.equal({ ok: true });
    expect(calls).to.have.length(0);
  });
});

describe('comparison content normalization', () => {
  it('normalizes editor wrappers and strips executable markup and attributes', () => {
    expect(comparison.normalizeComparisonHtml).to.be.a('function');
    const html = comparison.normalizeComparisonHtml('<div class="tableWrapper"><table><tr><td><p>A</p></td></tr></table></div><img src="javascript:bad" onerror="bad()"><script>bad()</script>', page);
    expect(html).not.to.match(/script|onerror|javascript:|tableWrapper/);
    expect(html).to.include('<table>');
  });

  it('loads delivered markdown using the shared API and treats only live 404 as an empty baseline', async () => {
    expect(comparison.readDeliveredContent).to.be.a('function');
    const calls = [];
    const api = {
      aem: {
        getPublish: async (args) => { calls.push(args); return new Response('', { status: 404 }); },
        getPreview: async () => new Response('', { status: 403 }),
      },
    };
    expect(await comparison.readDeliveredContent('live', { ...page, path: 'page.html' }, { api })).to.deep.equal({ html: '', missing: true });
    expect(calls[0].path).to.equal('/page.md');
    let error;
    try {
      await comparison.readDeliveredContent('preview', page, { api });
    } catch (e) { error = e; }
    expect(error?.message).to.include('403');
  });
});
