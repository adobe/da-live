import { expect } from '@esm-bundle/chai';
import { TextSelection } from 'da-y-wrapper';
import { setNx } from '../../../../../scripts/utils.js';
import { createTestEditor, destroyEditor } from '../../edit/prose/test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

describe('ew-selection-toolbar buttons', () => {
  let editor;
  let toolbar;

  before(async () => {
    await import('../../../../../blocks/canvas/ew-selection-toolbar/ew-selection-toolbar.js');
  });

  beforeEach(async () => {
    editor = await createTestEditor();
    toolbar = document.createElement('ew-selection-toolbar');
    document.body.append(toolbar);
    toolbar.view = editor.view;
  });

  after(() => {
    toolbar?.remove();
    destroyEditor(editor);
  });

  function setText(text) {
    editor.view.dispatch(editor.view.state.tr.insertText(text));
  }

  function selectText(from, to) {
    const selection = TextSelection.create(editor.view.state.doc, from, to);
    editor.view.dispatch(editor.view.state.tr.setSelection(selection));
  }

  async function clickToolbarButton(id) {
    const btn = toolbar.shadowRoot.querySelector(`button[data-id="${id}"]`);
    expect(btn, `${id} button`).to.exist;
    btn.click();
    await toolbar.updateComplete;
  }

  function selectionHasMark(name) {
    const { from, to } = editor.view.state.selection;
    return editor.view.state.doc.rangeHasMark(from, to, editor.view.state.schema.marks[name]);
  }

  it('applies superscript to the selected range', async () => {
    setText('hello');
    selectText(1, 6);

    await clickToolbarButton('sup');

    expect(selectionHasMark('sup')).to.be.true;
  });

  it('applies subscript to the selected range', async () => {
    setText('world');
    selectText(1, 6);

    await clickToolbarButton('sub');

    expect(selectionHasMark('sub')).to.be.true;
  });
});
