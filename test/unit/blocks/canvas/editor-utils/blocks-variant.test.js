import { expect } from '@esm-bundle/chai';
import { NodeSelection } from 'da-y-wrapper';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { createTestEditor, destroyEditor } = await import('../../edit/prose/test-helpers.js');
const { getTableBlockName, getTableBlockVariant, setTableBlockVariant } = await import('../../../../../blocks/canvas/editor-utils/blocks.js');

function insertTable(editor, text) {
  const { state } = editor.view;
  const { schema } = state;
  const para = schema.nodes.paragraph.create(null, schema.text(text));
  const cell = schema.nodes.table_cell.create({ colspan: 2, colwidth: null }, para);
  const row = schema.nodes.table_row.create(null, cell);
  const table = schema.nodes.table.create(null, row);
  editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, table));
  let tablePos = -1;
  editor.view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'table' && tablePos < 0) tablePos = pos;
  });
  return tablePos;
}

function selectTable(editor, tablePos) {
  const sel = NodeSelection.create(editor.view.state.doc, tablePos);
  editor.view.dispatch(editor.view.state.tr.setSelection(sel));
}

function headerText(editor) {
  return editor.view.state.selection.node.firstChild.firstChild.firstChild.textContent;
}

describe('block variant helpers', () => {
  let editor;
  beforeEach(async () => { editor = await createTestEditor(); });
  afterEach(() => destroyEditor(editor));

  it('getTableBlockVariant reads the parenthetical descriptor', () => {
    const pos = insertTable(editor, 'cards (highlight)');
    const table = editor.view.state.doc.nodeAt(pos);
    expect(getTableBlockName(table)).to.equal('cards');
    expect(getTableBlockVariant(table)).to.equal('highlight');
  });

  it('getTableBlockVariant returns empty string when there is no variant', () => {
    const pos = insertTable(editor, 'cards');
    const table = editor.view.state.doc.nodeAt(pos);
    expect(getTableBlockVariant(table)).to.equal('');
  });

  it('setTableBlockVariant adds a variant and keeps the block selected', () => {
    const pos = insertTable(editor, 'cards');
    selectTable(editor, pos);

    setTableBlockVariant(editor.view, 'highlight');

    expect(headerText(editor)).to.equal('cards (highlight)');
    expect(editor.view.state.selection instanceof NodeSelection).to.be.true;
    expect(editor.view.state.selection.node.type.name).to.equal('table');
  });

  it('setTableBlockVariant swaps an existing variant', () => {
    const pos = insertTable(editor, 'cards (highlight)');
    selectTable(editor, pos);

    setTableBlockVariant(editor.view, 'blue, small');

    expect(headerText(editor)).to.equal('cards (blue, small)');
  });

  it('setTableBlockVariant with empty string strips the variant', () => {
    const pos = insertTable(editor, 'cards (highlight)');
    selectTable(editor, pos);

    setTableBlockVariant(editor.view, '');

    expect(headerText(editor)).to.equal('cards');
  });
});
