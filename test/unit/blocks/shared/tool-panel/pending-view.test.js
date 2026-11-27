import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { PANEL_EVENT } from '../../../../fixtures/nx/utils/panel.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

await import('../../../../../blocks/shared/tool-panel/tool-panel.js');

describe('da-tool-panel pendingView', () => {
  it('auto-selects pendingView and loads it once when views are assigned', async () => {
    const panel = document.createElement('da-tool-panel');
    document.body.append(panel);
    await panel.updateComplete;

    let loadCount = 0;
    const view = {
      id: 'comments',
      label: 'Comments',
      load: async () => { loadCount += 1; return document.createElement('div'); },
    };

    // Mimic openCanvasPanel: set pendingView, then assign views. No explicit
    // showPanel call — the auto-select must handle it, exactly once.
    panel.pendingView = 'comments';
    panel.views = [view];
    await panel.updateComplete;
    await panel.updateComplete;

    expect(panel.activeId).to.equal('comments');
    expect(loadCount).to.equal(1);
    panel.remove();
  });
});

describe('da-tool-panel initial view race', () => {
  it('keeps a view requested while the initial view is still resolving', async () => {
    let resolveInitial;
    const panel = document.createElement('da-tool-panel');
    panel.host = { resolveInitialView: () => new Promise((r) => { resolveInitial = r; }) };
    document.body.append(panel);
    await panel.updateComplete;

    const makeView = (id) => ({ id, label: id, load: async () => document.createElement('div') });
    panel.views = [makeView('files'), makeView('comments')];
    await panel.updateComplete;

    await panel.showPanel('comments');
    resolveInitial('files');
    await new Promise((r) => { setTimeout(r, 0); });
    await panel.updateComplete;

    expect(panel.activeId).to.equal('comments');
    panel.remove();
  });
});

describe('da-tool-panel active view broadcast', () => {
  let aside;
  let panel;

  afterEach(() => {
    panel?.remove();
    aside?.remove();
    aside = null;
    panel = null;
  });

  it('broadcasts the active view when visible and null when the rail is hidden', async () => {
    aside = document.createElement('aside');
    aside.className = 'panel';
    aside.dataset.position = 'after';
    document.body.append(aside);
    const seen = [];
    panel = document.createElement('da-tool-panel');
    panel.host = { onActiveViewChange: (view) => seen.push(view) };
    aside.append(panel);
    await panel.updateComplete;

    panel.pendingView = 'comments';
    panel.views = [{ id: 'comments', label: 'Comments', load: async () => document.createElement('div') }];
    await panel.updateComplete;
    await panel.updateComplete;
    expect(seen.at(-1)).to.equal('comments');

    aside.setAttribute('hidden', '');
    document.dispatchEvent(new CustomEvent(PANEL_EVENT.CLOSE, { bubbles: true }));
    expect(seen.at(-1)).to.equal(null);

    aside.removeAttribute('hidden');
    document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, { detail: { section: 'tools' } }));
    expect(seen.at(-1)).to.equal('comments');
  });
});
