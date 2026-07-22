import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { createTestEditor, destroyEditor } = await import('../../edit/prose/test-helpers.js');
const { moveBlockToSection, getBlockPositions } = await import('../../../../../blocks/canvas/editor-utils/blocks.js');

function makeBlockTable(schema, name) {
  const para = schema.nodes.paragraph.create(null, schema.text(name));
  const cell = schema.nodes.table_cell.create({ colspan: 1, colwidth: null }, para);
  const row = schema.nodes.table_row.create(null, cell);
  return schema.nodes.table.create(null, row);
}

describe('moveBlockToSection', () => {
  let editor;
  beforeEach(async () => { editor = await createTestEditor(); });
  afterEach(() => destroyEditor(editor));

  it('moves a block into an empty target section, removing it from its original location', () => {
    const { state } = editor.view;
    const { schema } = state;

    const blockA = makeBlockTable(schema, 'blocka');
    const hr = schema.nodes.horizontal_rule.create();

    // Section 0: [blockA], Section 1: [] (empty - hr is the last node in the doc)
    editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, [blockA, hr]));

    expect(getBlockPositions(editor.view).length).to.equal(1);

    moveBlockToSection(editor.view, 0, 1);

    const { doc } = editor.view.state;
    const positions = getBlockPositions(editor.view);
    expect(positions.length).to.equal(1);

    // The single remaining block must now live in section 1, i.e. after the horizontal_rule.
    let hrPos = -1;
    doc.descendants((node, pos) => {
      if (node.type.name === 'horizontal_rule') hrPos = pos;
    });
    expect(hrPos).to.be.greaterThan(-1);
    expect(positions[0]).to.be.greaterThan(hrPos);

    const movedNode = doc.nodeAt(positions[0]);
    expect(movedNode.type.name).to.equal('table');
    expect(movedNode.textContent).to.include('blocka');
  });

  it('does nothing when fromIndex is out of range', () => {
    const { state } = editor.view;
    const { schema } = state;
    const blockA = makeBlockTable(schema, 'blocka');
    const hr = schema.nodes.horizontal_rule.create();
    editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, [blockA, hr]));

    const before = editor.view.state.doc.toString();
    moveBlockToSection(editor.view, 5, 1);
    expect(editor.view.state.doc.toString()).to.equal(before);
  });

  it('does nothing when sectionIndex is out of range', () => {
    const { state } = editor.view;
    const { schema } = state;
    const blockA = makeBlockTable(schema, 'blocka');
    const hr = schema.nodes.horizontal_rule.create();
    editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, [blockA, hr]));

    const before = editor.view.state.doc.toString();
    moveBlockToSection(editor.view, 0, 5);
    expect(editor.view.state.doc.toString()).to.equal(before);
  });
});
