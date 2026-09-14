import { expect } from '@esm-bundle/chai';
import { TextSelection, NodeSelection } from 'da-y-wrapper';
import { setNx } from '../../../../../scripts/utils.js';
import { createTestEditor, destroyEditor } from '../../edit/prose/test-helpers.js';
import { getSelectionToolbar } from '../../../../../blocks/canvas/editor-utils/selection-toolbar.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

describe('ew-selection-toolbar buttons', () => {
  let editor;
  let toolbar;

  before(async () => {
    await import('../../../../../blocks/canvas/ew-selection-toolbar/ew-selection-toolbar.js');
  });

  beforeEach(async () => {
    editor = await createTestEditor();
    toolbar = getSelectionToolbar();
    toolbar.view = editor.view;
  });

  afterEach(() => {
    toolbar.view = null;
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

  function selectImage(attrs = { src: '/x.png' }) {
    const { state } = editor.view;
    const { schema } = state;
    const para = schema.nodes.paragraph.create(null, schema.nodes.image.create(attrs));
    editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, para));
    let imgPos = -1;
    editor.view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image') imgPos = pos;
    });
    const sel = NodeSelection.create(editor.view.state.doc, imgPos);
    editor.view.dispatch(editor.view.state.tr.setSelection(sel));
  }

  it('opens the alt dialog with the current alt when image-alt-text is clicked', async () => {
    selectImage({ src: '/x.png', alt: 'Existing alt' });

    await clickToolbarButton('image-alt-text');

    expect(toolbar.altDialogOpen).to.be.true;
    const dialog = toolbar.shadowRoot.querySelector('da-alt-dialog');
    expect(dialog.alt).to.equal('Existing alt');
  });

  it('writes the submitted alt back to the selected image', async () => {
    selectImage({ src: '/x.png', alt: 'Old' });
    await clickToolbarButton('image-alt-text');

    toolbar.shadowRoot.querySelector('da-alt-dialog').dispatchEvent(
      new CustomEvent('da-alt-submit', {
        detail: { alt: 'New alt' },
        bubbles: true,
        composed: true,
      }),
    );
    await toolbar.updateComplete;

    let imgNode;
    editor.view.state.doc.descendants((node) => {
      if (node.type.name === 'image') imgNode = node;
    });
    expect(imgNode.attrs.alt).to.equal('New alt');
    expect(toolbar.altDialogOpen).to.be.false;
  });
});
