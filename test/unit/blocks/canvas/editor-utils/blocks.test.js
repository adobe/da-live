import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { createTestEditor, destroyEditor } = await import('../../edit/prose/test-helpers.js');
const { applyVariantLabel } = await import('../../../../../blocks/canvas/editor-utils/blocks.js');

function insertTable(editor, rows) {
  const { state } = editor.view;
  const { schema } = state;
  const rowNodes = rows.map(({ text, colspan, cols }) => {
    if (cols) {
      return schema.nodes.table_row.create(
        null,
        cols.map((c) => schema.nodes.table_cell.create(
          null,
          schema.nodes.paragraph.create(null, schema.text(c)),
        )),
      );
    }
    return schema.nodes.table_row.create(
      null,
      schema.nodes.table_cell.create(
        { colspan: colspan || 2 },
        schema.nodes.paragraph.create(null, schema.text(text)),
      ),
    );
  });
  const table = schema.nodes.table.create(null, rowNodes);
  editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, table));
  let tablePos = -1;
  editor.view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'table' && tablePos < 0) tablePos = pos;
  });
  return tablePos;
}

describe('applyVariantLabel', () => {
  let editor;
  beforeEach(async () => { editor = await createTestEditor(); });
  afterEach(() => destroyEditor(editor));

  it('replaces only the heading cell text, preserving body rows/cells', () => {
    const tablePos = insertTable(editor, [
      { text: 'cards' },
      { cols: ['Row1Col1', 'Row1Col2'] },
    ]);

    const tr = applyVariantLabel(editor.view.state, tablePos, 'cards (large, light)');
    expect(tr).to.not.equal(null);
    editor.view.dispatch(tr);

    const table = editor.view.state.doc.nodeAt(tablePos);
    expect(table.firstChild.firstChild.textContent).to.equal('cards (large, light)');
    const bodyRow = table.child(1);
    expect(bodyRow.child(0).textContent).to.equal('Row1Col1');
    expect(bodyRow.child(1).textContent).to.equal('Row1Col2');
  });

  it('preserves the heading cell\'s colspan', () => {
    const tablePos = insertTable(editor, [{ text: 'columns', colspan: 3 }]);
    const tr = applyVariantLabel(editor.view.state, tablePos, 'columns (contained, dark)');
    editor.view.dispatch(tr);
    const table = editor.view.state.doc.nodeAt(tablePos);
    expect(table.firstChild.firstChild.textContent).to.equal('columns (contained, dark)');
    expect(table.firstChild.firstChild.attrs.colspan).to.equal(3);
  });

  it('returns null for a position that is not a table', () => {
    const tr = applyVariantLabel(editor.view.state, 0, 'cards (large)');
    expect(tr).to.equal(null);
  });

  it('returns null for an empty label', () => {
    const tablePos = insertTable(editor, [{ text: 'cards' }]);
    expect(applyVariantLabel(editor.view.state, tablePos, '')).to.equal(null);
    expect(applyVariantLabel(editor.view.state, tablePos, null)).to.equal(null);
  });
});
