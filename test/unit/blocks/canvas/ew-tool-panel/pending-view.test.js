import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

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
