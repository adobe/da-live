import { expect } from '@esm-bundle/chai';
import { NodeSelection } from 'da-y-wrapper';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { createTestEditor, destroyEditor } = await import('../../edit/prose/test-helpers.js');
const { isMultiBlockConfigured, findTemplateRow } = await import('../../../../../blocks/canvas/editor-utils/multi-block.js');
const { appendBlockRow } = await import('../../../../../blocks/canvas/editor-utils/blocks.js');

const EDITOR_ROWS = [
  { block: 'section-metadata', property: 'kv' },
  { block: 'cards', property: 'multi' },
];

function libraryTable(html) {
  const table = document.createElement('table');
  table.innerHTML = html;
  return table;
}

describe('isMultiBlockConfigured', () => {
  it('is true for a block marked multi in the editor sheet', () => {
    expect(isMultiBlockConfigured(EDITOR_ROWS, 'cards')).to.be.true;
    expect(isMultiBlockConfigured(EDITOR_ROWS, 'Cards')).to.be.true;
  });

  it('is false for non-multi or unknown blocks', () => {
    expect(isMultiBlockConfigured(EDITOR_ROWS, 'section-metadata')).to.be.false;
    expect(isMultiBlockConfigured(EDITOR_ROWS, 'columns')).to.be.false;
    expect(isMultiBlockConfigured([], 'cards')).to.be.false;
  });
});

describe('findTemplateRow', () => {
  it('returns the first item row (after the header) of the matching library block', async () => {
    const blocks = [{
      loadVariants: Promise.resolve([
        { name: 'cards', dom: libraryTable('<tr><td>cards</td></tr><tr><td>img</td><td>text</td></tr>') },
      ]),
    }];
    const row = await findTemplateRow(blocks, 'cards');
    expect(row).to.exist;
    expect(row.cells.length).to.equal(2);
    expect(row.textContent).to.contain('text');
  });

  it('returns null when the library block has no item row', async () => {
    const blocks = [{ loadVariants: Promise.resolve([{ name: 'cards', dom: libraryTable('<tr><td>cards</td></tr>') }]) }];
    expect(await findTemplateRow(blocks, 'cards')).to.equal(null);
  });

  it('returns null when no library block matches', async () => {
    const blocks = [{ loadVariants: Promise.resolve([{ name: 'columns', dom: libraryTable('<tr><td>columns</td></tr><tr><td>a</td></tr>') }]) }];
    expect(await findTemplateRow(blocks, 'cards')).to.equal(null);
  });
});

describe('appendBlockRow', () => {
  let editor;
  beforeEach(async () => { editor = await createTestEditor(); });
  afterEach(() => destroyEditor(editor));

  function buildBlock() {
    const { state } = editor.view;
    const { schema } = state;
    const para = (t) => schema.nodes.paragraph.create(null, t ? schema.text(t) : null);
    const cell = (attrs, t) => schema.nodes.table_cell.create(attrs, para(t));
    const headerRow = schema.nodes.table_row.create(null, cell({ colspan: 2, colwidth: null }, 'cards'));
    const dataRow = schema.nodes.table_row.create(null, [
      cell({ colspan: 1, colwidth: null }, 'a'),
      cell({ colspan: 1, colwidth: null }, 'b'),
    ]);
    const table = schema.nodes.table.create(null, [headerRow, dataRow]);
    editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, table));
    let pos = -1;
    editor.view.state.doc.descendants((n, p) => { if (n.type.name === 'table' && pos < 0) pos = p; });
    return pos;
  }

  it('appends the template row and keeps the block selected', () => {
    const tablePos = buildBlock();
    const before = editor.view.state.doc.nodeAt(tablePos).childCount;
    const rowDom = libraryTable('<tr><td>x</td><td>y</td></tr>').rows[0];

    appendBlockRow(editor.view, tablePos, rowDom);

    const table = editor.view.state.doc.nodeAt(tablePos);
    expect(table.childCount).to.equal(before + 1);
    expect(table.lastChild.textContent).to.contain('y');
    expect(editor.view.state.selection instanceof NodeSelection).to.be.true;
    expect(editor.view.state.selection.node.type.name).to.equal('table');
  });
});
