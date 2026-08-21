import { expect } from '@esm-bundle/chai';
import { TextSelection } from 'da-y-wrapper';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { createTestEditor, destroyEditor } = await import('../../edit/prose/test-helpers.js');
const {
  processBlockOptions,
  blockOptionItems,
  isBlockOption,
  applyBlockOption,
} = await import('../../../../../blocks/canvas/ew-editor-doc/slash-menu/block-options.js');

const OPTIONS = [
  { blocks: 'myblock', key: 'color', values: 'Red=red|Blue=blue' },
  { blocks: 'myblock', key: 'size', values: 'Large=lg|Small=sm' },
];

function buildBlock(editor) {
  const { state } = editor.view;
  const { schema } = state;
  const para = (t) => schema.nodes.paragraph.create(null, t ? schema.text(t) : null);
  const cell = (attrs, t) => schema.nodes.table_cell.create(attrs, para(t));
  const headerRow = schema.nodes.table_row.create(
    null,
    cell({ colspan: 2, colwidth: null }, 'myblock'),
  );
  const dataRow = schema.nodes.table_row.create(null, [
    cell({ colspan: 1, colwidth: null }, 'color'),
    cell({ colspan: 1, colwidth: null }, ''),
  ]);
  const table = schema.nodes.table.create(null, [headerRow, dataRow]);
  editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, table));

  const paras = [];
  editor.view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') paras.push(pos + 1);
  });
  // paras: [header 'myblock', data key cell 'color', data value cell '']
  return { keyPos: paras[1], valuePos: paras[2] };
}

function selectAt(editor, pos) {
  const { state } = editor.view;
  editor.view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos)));
}

describe('processBlockOptions', () => {
  it('parses blocks/key/values with label=value pairs', () => {
    const map = processBlockOptions(OPTIONS);
    const keyData = map.get('myblock');
    expect([...keyData.keys()]).to.deep.equal(['color', 'size']);
    expect(keyData.get('color')).to.deep.equal([
      { title: 'Red', value: 'red' },
      { title: 'Blue', value: 'blue' },
    ]);
  });

  it('applies "all" rows to every block and as a fallback', () => {
    const map = processBlockOptions([
      { blocks: 'all', key: 'theme', values: 'Dark=dark' },
      { blocks: 'cards', key: 'columns', values: '2|3' },
    ]);
    expect([...map.get('cards').keys()]).to.include.members(['columns', 'theme']);
    // Unknown block falls back to the "all" set.
    expect([...map.get('unknown').keys()]).to.deep.equal(['theme']);
  });
});

describe('blockOptionItems', () => {
  let editor;
  let map;
  beforeEach(async () => {
    editor = await createTestEditor();
    map = processBlockOptions(OPTIONS);
  });
  afterEach(() => destroyEditor(editor));

  it('lists the block keys in the first column of a two-column row', () => {
    const { keyPos } = buildBlock(editor);
    selectAt(editor, keyPos);
    const items = blockOptionItems(editor.view.state, '', map);
    expect(items[0]).to.deep.equal({ section: 'Block options' });
    expect(items.slice(1).map((i) => i.label)).to.deep.equal(['color', 'size']);
  });

  it('filters keys by the query', () => {
    const { keyPos } = buildBlock(editor);
    selectAt(editor, keyPos);
    const items = blockOptionItems(editor.view.state, 'si', map);
    expect(items.slice(1).map((i) => i.label)).to.deep.equal(['size']);
  });

  it('lists the values for the row key in the value column', () => {
    const { valuePos } = buildBlock(editor);
    selectAt(editor, valuePos);
    const items = blockOptionItems(editor.view.state, '', map);
    expect(items.slice(1).map((i) => i.label)).to.deep.equal(['Red', 'Blue']);
  });

  it('returns null when the cursor is not in a block cell', () => {
    editor.view.dispatch(editor.view.state.tr.insertText('plain'));
    expect(blockOptionItems(editor.view.state, '', map)).to.equal(null);
  });

  it('inserts the selected value text into the cell', () => {
    const { valuePos } = buildBlock(editor);
    selectAt(editor, valuePos);
    const items = blockOptionItems(editor.view.state, '', map);
    const blueId = items.find((i) => i.label === 'Blue').id;
    expect(isBlockOption(blueId)).to.be.true;

    applyBlockOption(editor.view, blueId);

    const valueCellText = editor.view.state.doc.nodeAt(valuePos - 1)?.textContent
      ?? editor.view.state.selection.$from.parent.textContent;
    expect(valueCellText).to.contain('blue');
  });
});
