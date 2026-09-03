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
