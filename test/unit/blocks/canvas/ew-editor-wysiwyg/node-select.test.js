import { expect } from '@esm-bundle/chai';
import { NodeSelection, TextSelection } from 'da-y-wrapper';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { createTestEditor, destroyEditor } = await import('../../edit/prose/test-helpers.js');
const { handleNodeSelect, resolveNodeSelectPos } = await import('../../../../../blocks/canvas/ew-editor-wysiwyg/utils/handlers.js');

function insertTable(editor) {
  const { state } = editor.view;
  const { schema } = state;
  const para = schema.nodes.paragraph.create(null, schema.text('cards'));
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

describe('handleNodeSelect', () => {
  let editor;
  beforeEach(async () => { editor = await createTestEditor(); });
  afterEach(() => destroyEditor(editor));

  it('selects a table for a block payload (proseIndex = table.from + 1)', () => {
    const tablePos = insertTable(editor);
    const ctx = { view: editor.view };
    handleNodeSelect({ node: { anchorType: 'table', proseIndex: tablePos + 1 } }, ctx);
    const sel = editor.view.state.selection;
    expect(sel instanceof NodeSelection).to.equal(true);
    expect(sel.from).to.equal(tablePos);
    expect(sel.node.type.name).to.equal('table');
  });

  it('selects an image for an image payload (proseIndex = image.from)', () => {
    const { state } = editor.view;
    const { schema } = state;
    const para = schema.nodes.paragraph.create(null, schema.nodes.image.create({ src: '/x.png' }));
    editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, para));
    let imgPos = -1;
    editor.view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image') imgPos = pos;
    });
    const ctx = { view: editor.view };
    handleNodeSelect({ node: { anchorType: 'image', proseIndex: imgPos } }, ctx);
    const sel = editor.view.state.selection;
    expect(sel instanceof NodeSelection).to.equal(true);
    expect(sel.node.type.name).to.equal('image');
  });

  it('ignores a payload whose type does not match the resolved node', () => {
    const tablePos = insertTable(editor);
    const ctx = { view: editor.view };
    const before = editor.view.state.selection;
    handleNodeSelect({ node: { anchorType: 'image', proseIndex: tablePos + 1 } }, ctx);
    expect(editor.view.state.selection.eq(before)).to.equal(true);
  });

  it('collapses the selection to a caret for a null payload', () => {
    const tablePos = insertTable(editor);
    const ctx = { view: editor.view };
    handleNodeSelect({ node: { anchorType: 'table', proseIndex: tablePos + 1 } }, ctx);
    handleNodeSelect({ node: null }, ctx);
    expect(editor.view.state.selection instanceof TextSelection).to.equal(true);
    expect(editor.view.state.selection.empty).to.equal(true);
    const { $from } = editor.view.state.selection;
    expect($from.parent.isTextblock).to.equal(true);
  });
});

describe('resolveNodeSelectPos', () => {
  let editor;
  beforeEach(async () => { editor = await createTestEditor(); });
  afterEach(() => destroyEditor(editor));

  it('returns null for a null payload', () => {
    expect(resolveNodeSelectPos(null, editor.view.state.doc)).to.equal(null);
  });

  it('returns null for an unknown anchorType', () => {
    const { doc } = editor.view.state;
    expect(resolveNodeSelectPos({ anchorType: 'text', proseIndex: 1 }, doc)).to.equal(null);
  });

  it('returns null for an out-of-bounds table proseIndex', () => {
    insertTable(editor);
    const { doc } = editor.view.state;
    expect(resolveNodeSelectPos({ anchorType: 'table', proseIndex: 99999 }, doc)).to.equal(null);
  });

  it('maps a valid table proseIndex to the table position', () => {
    const tablePos = insertTable(editor);
    const { doc } = editor.view.state;
    expect(resolveNodeSelectPos({ anchorType: 'table', proseIndex: tablePos + 1 }, doc)).to.equal(tablePos);
  });

  function insertImage(src) {
    const { state } = editor.view;
    const { schema } = state;
    const para = schema.nodes.paragraph.create(null, schema.nodes.image.create({ src }));
    editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, para));
    let imgPos = -1;
    editor.view.state.doc.descendants((node, pos) => { if (node.type.name === 'image') imgPos = pos; });
    return imgPos;
  }

  it('falls back to a src lookup (by filename) when the image proseIndex is stale', () => {
    const imgPos = insertImage('/media_abc.png');
    const { doc } = editor.view.state;
    expect(resolveNodeSelectPos(
      { anchorType: 'image', proseIndex: 99999, src: './media_abc.png?width=750&format=webply' },
      doc,
    )).to.equal(imgPos);
  });

  it('returns null when no image src matches', () => {
    insertImage('/media_abc.png');
    const { doc } = editor.view.state;
    expect(resolveNodeSelectPos({ anchorType: 'image', proseIndex: 99999, src: '/nope.png' }, doc)).to.equal(null);
  });
});
