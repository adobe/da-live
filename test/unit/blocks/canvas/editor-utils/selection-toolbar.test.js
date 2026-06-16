import { expect } from '@esm-bundle/chai';
import { NodeSelection, TextSelection } from 'da-y-wrapper';
import { setNx } from '../../../../../scripts/utils.js';
import { createTestEditor, destroyEditor } from '../../edit/prose/test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { toolbarModeForSelection } = await import(
  '../../../../../blocks/canvas/editor-utils/selection-toolbar.js'
);

function paragraphWithImage(view) {
  const { schema } = view.state;
  const img = schema.nodes.image.create({ src: '/a.png' });
  const para = schema.nodes.paragraph.create(null, img);
  view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, para));
}

describe('toolbarModeForSelection', () => {
  let editor;
  beforeEach(async () => { editor = await createTestEditor(); });
  afterEach(() => destroyEditor(editor));

  it('returns "image" for an image NodeSelection', () => {
    paragraphWithImage(editor.view);
    editor.view.dispatch(editor.view.state.tr.setSelection(
      NodeSelection.create(editor.view.state.doc, 1),
    ));
    expect(toolbarModeForSelection(editor.view.state)).to.equal('image');
  });

  it('returns "text" for a caret/text selection', () => {
    paragraphWithImage(editor.view);
    editor.view.dispatch(editor.view.state.tr.setSelection(
      TextSelection.create(editor.view.state.doc, 0),
    ));
    expect(toolbarModeForSelection(editor.view.state)).to.equal('text');
  });

  it('returns null for non-image NodeSelections (e.g. table)', () => {
    // Build a table NodeSelection.
    const { schema } = editor.view.state;
    const tableSchema = schema.nodes.table;
    if (!tableSchema) return; // schema may not include tables in some configs.
    // Build a minimal table: 1 row × 1 cell × empty paragraph.
    const para = schema.nodes.paragraph.create();
    const cell = schema.nodes.table_cell.create(null, para);
    const row = schema.nodes.table_row.create(null, cell);
    const table = tableSchema.create(null, row);
    editor.view.dispatch(editor.view.state.tr.replaceWith(
      0,
      editor.view.state.doc.content.size,
      table,
    ));
    editor.view.dispatch(editor.view.state.tr.setSelection(
      NodeSelection.create(editor.view.state.doc, 0),
    ));
    expect(toolbarModeForSelection(editor.view.state)).to.equal(null);
  });
});
