import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { notifyCanvasEditorActive, showRequestedToolPanelView } = await import('../../../../blocks/canvas/canvas.js');

describe('canvas editor view visibility', () => {
  let doc;
  let wysiwyg;

  beforeEach(async () => {
    doc = document.createElement('ew-editor-doc');
    wysiwyg = document.createElement('ew-editor-wysiwyg');
    document.body.append(doc, wysiwyg);
    await Promise.all([doc.updateComplete, wysiwyg.updateComplete]);
  });

  afterEach(() => {
    doc.remove();
    wysiwyg.remove();
  });

  it('shows only the chosen editors for Layout, Content and Split', () => {
    notifyCanvasEditorActive('layout');
    expect(doc.hidden).to.be.true;
    expect(wysiwyg.hidden).to.be.false;

    notifyCanvasEditorActive('content');
    expect(doc.hidden).to.be.false;
    expect(wysiwyg.hidden).to.be.true;

    notifyCanvasEditorActive('split');
    expect(doc.hidden).to.be.false;
    expect(wysiwyg.hidden).to.be.false;
  });
});

describe('showRequestedToolPanelView', () => {
  const panel = (views) => {
    const shown = [];
    return { views, shown, showPanel: async (id) => { shown.push(id); } };
  };

  it('shows a requested view that is already available', async () => {
    const toolPanel = panel([{ id: 'blocks' }, { id: 'comments' }]);
    await showRequestedToolPanelView(toolPanel, 'comments');
    expect(toolPanel.shown).to.deep.equal(['comments']);
    expect(toolPanel.pendingView).to.equal(undefined);
  });

  it('queues a requested view while the views are still loading', async () => {
    const toolPanel = panel([]);
    await showRequestedToolPanelView(toolPanel, 'comments');
    expect(toolPanel.shown).to.deep.equal([]);
    expect(toolPanel.pendingView).to.equal('comments');
  });

  it('ignores a view that is not available once views have loaded', async () => {
    const toolPanel = panel([{ id: 'blocks' }]);
    await showRequestedToolPanelView(toolPanel, 'comments');
    expect(toolPanel.shown).to.deep.equal([]);
    expect(toolPanel.pendingView).to.equal(undefined);
  });
});
