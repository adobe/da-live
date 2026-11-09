import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';
import { PANEL_EVENT } from '../../../../fixtures/nx/utils/panel.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

await import('../../../../../blocks/canvas/ew-tool-panel/tool-panel.js');

describe('ew-tool-panel pendingView', () => {
  it('auto-selects pendingView and loads it once when views are assigned', async () => {
    const el = document.createElement('ew-tool-panel');
    document.body.append(el);
    await el.updateComplete;

    let loadCount = 0;
    const view = {
      id: 'comments',
      label: 'Comments',
      load: async () => { loadCount += 1; return document.createElement('div'); },
    };

    // Mimic openCanvasPanel: set pendingView, then assign views. No explicit
    // showPanel call — the auto-select must handle it, exactly once.
    el.pendingView = 'comments';
    el.views = [view];
    await el.updateComplete;
    await el.updateComplete;

    expect(el.activeId).to.equal('comments');
    expect(loadCount).to.equal(1);
    el.remove();
  });
});

describe('ew-tool-panel active view broadcast', () => {
  let aside;
  let el;
  let unsub;

  afterEach(() => {
    unsub?.();
    el?.remove();
    aside?.remove();
    aside = null;
    el = null;
  });

  it('broadcasts the active view when visible and null when the rail is hidden', async () => {
    aside = document.createElement('aside');
    aside.className = 'panel';
    aside.dataset.position = 'after';
    document.body.append(aside);
    el = document.createElement('ew-tool-panel');
    aside.append(el);
    await el.updateComplete;

    const seen = [];
    unsub = canvasBus.toolPanelViewState.subscribe((view) => seen.push(view));

    el.pendingView = 'comments';
    el.views = [{ id: 'comments', label: 'Comments', load: async () => document.createElement('div') }];
    await el.updateComplete;
    await el.updateComplete;
    expect(seen.at(-1)).to.equal('comments');

    aside.setAttribute('hidden', '');
    document.dispatchEvent(new CustomEvent(PANEL_EVENT.CLOSE, { bubbles: true }));
    expect(seen.at(-1)).to.equal(null);

    aside.removeAttribute('hidden');
    document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, { detail: { section: 'tools' } }));
    expect(seen.at(-1)).to.equal('comments');
  });
});

describe('ew-tool-panel explicit view requests', () => {
  const view = (id) => ({ id, label: id, load: async () => document.createElement('div') });

  it('keeps a view requested while the initial view is still resolving', async () => {
    sessionStorage.setItem('nx-tool-panel-active-view', 'outline');
    const el = document.createElement('ew-tool-panel');
    document.body.append(el);
    await el.updateComplete;

    el.views = [view('outline'), view('comments')];
    await el.updateComplete;
    await el.showPanel('comments');
    await new Promise((resolve) => { setTimeout(resolve, 50); });
    await el.updateComplete;

    expect(el.activeId).to.equal('comments');
    el.remove();
    sessionStorage.removeItem('nx-tool-panel-active-view');
  });

  it('lets the latest request win when an earlier view loads more slowly', async () => {
    const el = document.createElement('ew-tool-panel');
    document.body.append(el);
    let releaseSlow;
    const slow = new Promise((resolve) => { releaseSlow = resolve; });
    el.views = [
      { id: 'outline', label: 'Outline', load: async () => { await slow; return document.createElement('div'); } },
      view('comments'),
    ];
    await el.updateComplete;

    const outline = el.showPanel('outline');
    await el.showPanel('comments');
    releaseSlow();
    await outline;
    await el.updateComplete;

    expect(el.activeId).to.equal('comments');
    el.remove();
  });
});
