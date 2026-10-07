import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import { setNx } from '../../../../scripts/utils.js';
import { canvasBus } from '../../../../blocks/canvas/utils/canvas-bus.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
let comparison;
const page = { org: 'example', site: 'site', path: 'page' };

before(async () => {
  comparison = await import('../../../../blocks/canvas/ew-comparison/comparison.js');
  await import('../../../../blocks/canvas/ew-comparison/ew-canvas-compare.js');
});

describe('comparison renderer ownership', () => {
  it('loads the renderer from the comparison module', async () => {
    await import('../../../../blocks/canvas/ew-comparison/ew-canvas-compare.js');
    expect(customElements.get('ew-canvas-compare')).to.be.a('function');
  });

  it('makes version history consume the comparison-owned renderer', async () => {
    const source = await readFile({ path: '../../../../blocks/canvas/ew-canvas-versions/ew-canvas-versions.js' });
    expect(source).to.include("import '../ew-comparison/ew-canvas-compare.js';");
    expect(source).not.to.include("import './ew-canvas-compare.js';");
  });

  it('keeps the comparison component and renderer independent of version history', async () => {
    const source = await readFile({ path: '../../../../blocks/canvas/ew-comparison/ew-comparison.js' });
    expect(source).to.include("import './ew-canvas-compare.js';");
    expect(source).not.to.include('ew-canvas-versions/');
    const renderer = await readFile({ path: '../../../../blocks/canvas/ew-comparison/ew-canvas-compare.js' });
    expect(renderer).not.to.include('ew-canvas-versions/');
    const stylesheet = await fetch('/blocks/canvas/ew-comparison/ew-canvas-compare.css');
    expect(stylesheet.ok).to.equal(true);
  });
});

describe('version-history comparison consumer', () => {
  let versions;
  let popoverPrototype;
  let originalShow;

  before(async () => {
    await import('../../../../blocks/canvas/ew-canvas-versions/ew-canvas-versions.js');
  });

  beforeEach(() => {
    popoverPrototype = customElements.get('nx-popover').prototype;
    originalShow = popoverPrototype.show;
    popoverPrototype.show = () => {};
  });

  afterEach(() => {
    versions?.remove();
    if (originalShow) popoverPrototype.show = originalShow;
    else delete popoverPrototype.show;
  });

  it('keeps the version preview modal, split toggle, focus trap, and close cleanup', async () => {
    versions = document.createElement('ew-canvas-versions');
    document.body.append(versions);
    await versions.updateComplete;
    let cleaned = false;
    versions.path = '/example/site/page.html';
    versions._versions = [];
    versions._compareSplit = false;
    versions._compareCtx = {
      previewDom: new DOMParser().parseFromString('<p>Saved content</p>', 'text/html').body,
      diffDom: new DOMParser().parseFromString('<p><del>Current content</del><ins>Saved content</ins></p>', 'text/html').body,
      label: 'Saved version',
      entry: {},
      cleanup: () => { cleaned = true; },
    };
    await versions.updateComplete;
    const view = versions.shadowRoot.querySelector('ew-canvas-compare');
    await view.updateComplete;
    const popover = view.shadowRoot.querySelector('nx-popover');
    expect(popover.getAttribute('role')).to.equal('dialog');
    expect(popover.getAttribute('aria-modal')).to.equal('true');
    expect(popover.getAttribute('aria-label')).to.equal('Compare with Saved version');
    expect(popover.persistent).to.equal(true);
    expect(view.shadowRoot.querySelector('.ew-cc-body').textContent).to.include('Saved content');
    const close = view.shadowRoot.querySelector('.ew-cc-close-btn');
    expect(view.shadowRoot.activeElement).to.equal(close);
    const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    document.dispatchEvent(tab);
    expect(tab.defaultPrevented).to.equal(true);
    const toggle = view.shadowRoot.querySelector('button[aria-pressed]');
    expect(view.shadowRoot.activeElement).to.equal(toggle);
    toggle.click();
    await versions.updateComplete;
    await view.updateComplete;
    expect(view.split).to.equal(true);
    expect([...view.shadowRoot.querySelectorAll('.ew-cc-pane')].map((pane) => pane.textContent))
      .to.deep.equal(['Current content', 'Saved content']);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await versions.updateComplete;
    expect(versions.shadowRoot.querySelector('ew-canvas-compare')).to.equal(null);
    expect(cleaned).to.equal(true);
  });
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
    sheet.replaceSync(await (await fetch('/blocks/canvas/ew-comparison/ew-canvas-compare.css')).text());
    element.shadowRoot.adoptedStyleSheets = [sheet];
    const color = (selector) => getComputedStyle(
      element.shadowRoot.querySelector(selector),
    ).backgroundColor;
    expect(color('.ew-cc-chip:not(.is-neutral)')).to.equal(color('ins'));
    expect(color('.ew-cc-chip.is-neutral')).to.equal(color('del'));
  });

  it('aligns unchanged table rows when the preceding live content is taller', async () => {
    const { normalizeComparisonHtml } = comparison;
    const { buildCompareDom } = await import('../../../../blocks/shared/version/compare.js');
    const live = `<h1>Journey</h1><p>Unchanged introduction</p><p>${'Older, longer description with a lot more text that spans several lines in the comparison pane. '.repeat(4)}</p><hr><table><tr><td>Cards</td></tr><tr><td>Omnichannel</td></tr><tr><td>Inventory</td></tr><tr><td>Store Ops</td></tr><tr><td>Employee Dev</td></tr></table>`;
    const current = '<h1>Journey</h1><p>Unchanged introduction</p><p>Short description.</p><div class="tableWrapper"><table><tr><td><p>cards</p></td></tr><tr><td><p>Omnichannel</p></td></tr><tr><td><p>Inventory</p></td></tr><tr><td><p>Store Ops</p></td></tr><tr><td><p>Employee Dev</p></td></tr></table></div>';
    const { dom } = await buildCompareDom({
      htmlA: normalizeComparisonHtml(live, page),
      htmlB: normalizeComparisonHtml(current, page),
      closeOnOutsideClick: false,
    });
    element = document.createElement('ew-canvas-compare');
    element.embedded = true;
    element.split = true;
    element.currentLabel = 'Live';
    element.label = 'Current document';
    element.diffDom = dom;
    element.style.cssText = 'width: 760px; height: 320px';
    document.body.append(element);
    await element.updateComplete;
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(await (await fetch('/blocks/canvas/ew-comparison/ew-canvas-compare.css')).text());
    element.shadowRoot.adoptedStyleSheets = [sheet];

    const split = element.shadowRoot.querySelector('.ew-cc-split');
    const tables = [...split.querySelectorAll('table')];
    expect(tables).to.have.length(2);
    expect(tables.map((table) => [...table.querySelectorAll('tr')].map((row) => row.textContent.trim())))
      .to.deep.equal([
        ['Cards', 'Omnichannel', 'Inventory', 'Store Ops', 'Employee Dev'],
        ['cards', 'Omnichannel', 'Inventory', 'Store Ops', 'Employee Dev'],
      ]);
    expect(tables.map((table) => table.querySelector('tr:nth-child(n+2) ins, tr:nth-child(n+2) del')))
      .to.deep.equal([null, null]);
    expect(Math.abs(tables[0].getBoundingClientRect().top - tables[1].getBoundingClientRect().top))
      .to.be.lessThan(2);
    expect(split.scrollHeight).to.be.greaterThan(split.clientHeight);
    split.scrollTop = 40;
    expect(split.scrollTop).to.equal(40);
    expect(Math.abs(tables[0].getBoundingClientRect().top - tables[1].getBoundingClientRect().top))
      .to.be.lessThan(2);
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
  let saveDocument;
  let saveCalls;
  let serializeCalls;

  beforeEach(() => {
    expect(comparison.installComparison).to.be.a('function');
    context = { ...page };
    html = '<h1>Current document</h1><p>New author text</p>';
    calls = [];
    saveDocument = async () => ({ ok: true });
    saveCalls = 0;
    serializeCalls = 0;
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
      getDocument: () => { serializeCalls += 1; return html; },
      saveDocument: () => { saveCalls += 1; return saveDocument(); },
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

  ['document', 'preview'].forEach((candidate) => {
    it(`awaits the host save before serializing or loading ${candidate} comparison`, async () => {
      let complete;
      const saving = new Promise((resolve) => { complete = resolve; });
      saveDocument = () => saving;
      const pending = controller.open({ candidate, baseline: 'live' });
      await new Promise((resolve) => { setTimeout(resolve, 20); });
      const duringSave = { saveCalls, serializeCalls, calls: [...calls] };
      html = '<p>Edits received while saving</p>';
      complete({ ok: true });
      expect(await pending).to.deep.equal({ ok: true });
      expect(duringSave).to.deep.equal({ saveCalls: 1, serializeCalls: 0, calls: [] });
      expect(calls).to.deep.equal(candidate === 'document' ? ['live'] : ['live', 'preview']);
      expect(serializeCalls).to.equal(candidate === 'document' ? 1 : 0);
      const surface = mountRoot.querySelector('ew-comparison');
      expect(surface.diffDom.textContent).to.include(candidate === 'document'
        ? 'Edits received while saving' : 'preview content');
    });

    it(`opens ${candidate} comparison when the host cannot write the document`, async () => {
      saveDocument = async () => ({ ok: false, error: 'not-writable' });
      expect(await controller.open({ candidate, baseline: 'live' })).to.deep.equal({ ok: true });
      expect(saveCalls).to.equal(1);
      expect(calls).to.deep.equal(candidate === 'document' ? ['live'] : ['live', 'preview']);
      expect(mountRoot.querySelector('ew-comparison').error).to.equal(undefined);
    });

    ['no-document', 'stale-context', 'Save transport failed'].forEach((error) => {
      [false, true].forEach((reject) => {
        it(`shows ${reject ? 'rejected' : 'returned'} ${error} without reading ${candidate} content`, async () => {
          saveDocument = async () => {
            if (reject) throw new Error(error);
            return { ok: false, error };
          };
          expect(await controller.open({ candidate, baseline: 'live' }))
            .to.deep.equal({ ok: false, error });
          expect(saveCalls).to.equal(1);
          expect(serializeCalls).to.equal(0);
          expect(calls).to.deep.equal([]);
          const surface = mountRoot.querySelector('ew-comparison');
          await surface.updateComplete;
          expect(surface.shadowRoot.textContent).to.include(error);
          expect(surface.loading).to.equal(false);
          expect(surface.diffDom).to.equal(undefined);
        });
      });
    });

    it(`does not interpret a rejected not-writable error as permission to open ${candidate}`, async () => {
      saveDocument = async () => { throw new Error('not-writable'); };
      expect(await controller.open({ candidate, baseline: 'live' }))
        .to.deep.equal({ ok: false, error: 'not-writable' });
      expect(calls).to.deep.equal([]);
      expect(serializeCalls).to.equal(0);
      const surface = mountRoot.querySelector('ew-comparison');
      await surface.updateComplete;
      expect(surface.shadowRoot.textContent).to.include('not-writable');
    });

    ['close', 'navigation', 'silent context change', 'replacement'].forEach((change) => {
      it(`discards stale ${candidate} work after ${change} during save`, async () => {
        let complete;
        const saving = new Promise((resolve) => { complete = resolve; });
        saveDocument = () => saving;
        const pending = controller.open({ candidate, baseline: 'live' });
        await new Promise((resolve) => { setTimeout(resolve, 20); });
        const duringSave = { saveCalls, serializeCalls, calls: [...calls] };
        if (change === 'close') controller.close();
        else if (change === 'replacement') {
          saveDocument = async () => ({ ok: true });
          await controller.open({ candidate, baseline: 'live' });
        } else {
          context = { ...page, path: 'next' };
          if (change === 'navigation') controller.contextChanged();
        }
        const beforeCompletion = { serializeCalls, calls: [...calls] };
        const surface = mountRoot.querySelector('ew-comparison');
        const diffDom = surface?.diffDom;
        complete({ ok: true });
        expect(await pending).to.deep.equal({ ok: false, error: 'stale-context' });
        expect(duringSave).to.deep.equal({ saveCalls: 1, serializeCalls: 0, calls: [] });
        expect({ serializeCalls, calls }).to.deep.equal(beforeCompletion);
        expect(mountRoot.querySelector('ew-comparison')).to.equal(surface);
        expect(surface?.diffDom).to.equal(diffDom);
        if (change === 'close' || change === 'navigation') expect(editor.inert).to.equal(false);
      });
    });
  });

  it('does not load content when an installed host save has no result', async () => {
    saveDocument = async () => undefined;
    expect((await controller.open({ candidate: 'document', baseline: 'live' })).ok).to.equal(false);
    expect(calls).to.deep.equal([]);
    expect(serializeCalls).to.equal(0);
    const surface = mountRoot.querySelector('ew-comparison');
    await surface.updateComplete;
    expect(surface.error).to.be.a('string').and.not.equal('');
    expect(surface.shadowRoot.textContent).to.include(surface.error);
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

  it('preserves the separately acknowledged save handshake without opening comparison', async () => {
    const result = await new Promise((resolve) => {
      canvasBus.comparisonRequest.emit({ action: 'saveDocument', context: page, resolve });
    });
    expect(result).to.deep.equal({ ok: true });
    expect(saveCalls).to.equal(1);
    expect(calls).to.have.length(0);
    expect(mountRoot.querySelector('ew-comparison')).to.equal(null);
  });
});

describe('comparison content normalization', () => {
  it('keeps top-level separators when serializing document blocks', async () => {
    const { stripEmptyTopLevelBlocks } = await import('../../../../blocks/shared/version/compare.js');
    const root = new DOMParser().parseFromString('<hr><p> </p><p>Content</p>', 'text/html').body;
    stripEmptyTopLevelBlocks(root);
    expect(root.innerHTML).to.equal('<hr><p>Content</p>');
  });

  it('normalizes editor wrappers and strips executable markup and attributes', () => {
    expect(comparison.normalizeComparisonHtml).to.be.a('function');
    const html = comparison.normalizeComparisonHtml('<div class="tableWrapper"><table><tr><td><p>A</p></td></tr></table></div><img src="javascript:bad" onerror="bad()"><script>bad()</script>', page);
    expect(html).not.to.match(/script|onerror|javascript:|tableWrapper/);
    expect(html).to.include('<table>');
  });

  it('collapses single-paragraph table cells so editor rows match live rows', () => {
    const editorCell = comparison.normalizeComparisonHtml('<div class="tableWrapper"><table><tbody><tr><td><p>Omnichannel</p></td></tr></tbody></table></div>', page);
    const liveCell = comparison.normalizeComparisonHtml('<table><tbody><tr><td>Omnichannel</td></tr></tbody></table>', page);
    expect(editorCell).to.include('<td>Omnichannel</td>');
    expect(editorCell).to.equal(liveCell);
    // Multi-paragraph and non-paragraph cells are left untouched
    const multi = comparison.normalizeComparisonHtml('<table><tbody><tr><td><p>A</p><p>B</p></td><td><ul><li>C</li></ul></td></tr></tbody></table>', page);
    expect(multi).to.include('<td><p>A</p><p>B</p></td>');
    expect(multi).to.include('<td><ul><li>C</li></ul></td>');
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
