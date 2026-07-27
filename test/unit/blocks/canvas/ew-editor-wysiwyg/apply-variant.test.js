import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { createTestEditor, destroyEditor } = await import('../../edit/prose/test-helpers.js');
const { handleApplyVariant } = await import('../../../../../blocks/canvas/ew-editor-wysiwyg/utils/handlers.js');
const { createTrackingPlugin } = await import('../../../../../blocks/canvas/editor-utils/prose-diff.js');
const { updateDocument, getEditor } = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js');

function insertTable(editor) {
  const { state } = editor.view;
  const { schema } = state;
  const para = schema.nodes.paragraph.create(null, schema.text('cards'));
  const cell = schema.nodes.table_cell.create({ colspan: 2, colwidth: null }, para);
  const row = schema.nodes.table_row.create(null, cell);
  const bodyCell = schema.nodes.table_cell.create(null, schema.nodes.paragraph.create(null, schema.text('content')));
  const bodyRow = schema.nodes.table_row.create(null, bodyCell);
  const table = schema.nodes.table.create(null, [row, bodyRow]);
  editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, table));
  let tablePos = -1;
  editor.view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'table' && tablePos < 0) tablePos = pos;
  });
  return tablePos;
}

describe('handleApplyVariant', () => {
  let editor;
  beforeEach(async () => { editor = await createTestEditor(); });
  afterEach(() => destroyEditor(editor));

  it('rewrites the heading cell for a valid table proseIndex', () => {
    const tablePos = insertTable(editor);
    const ctx = { view: editor.view };
    handleApplyVariant({ node: { proseIndex: tablePos + 1 }, label: 'cards (large)' }, ctx);

    const table = editor.view.state.doc.nodeAt(tablePos);
    expect(table.firstChild.firstChild.textContent).to.equal('cards (large)');
    expect(table.child(1).firstChild.textContent).to.equal('content');
  });

  it('is a no-op for a stale/out-of-range proseIndex (does not throw)', () => {
    insertTable(editor);
    const ctx = { view: editor.view };
    const before = editor.view.state.doc;
    expect(() => handleApplyVariant({ node: { proseIndex: 99999 }, label: 'cards (large)' }, ctx))
      .to.not.throw();
    expect(editor.view.state.doc).to.equal(before);
  });

  it('is a no-op when node is missing', () => {
    insertTable(editor);
    const ctx = { view: editor.view };
    const before = editor.view.state.doc;
    handleApplyVariant({ node: null, label: 'cards (large)' }, ctx);
    expect(editor.view.state.doc).to.equal(before);
  });

  it('is a no-op when there is no view on ctx', () => {
    expect(() => handleApplyVariant({ node: { proseIndex: 1 }, label: 'x' }, {})).to.not.throw();
  });

  it('forces a full canvas reload instead of a targeted node update or no update at all', async () => {
    // Wire the real updateDocument/getEditor (as ew-editor-doc.js does), not
    // raw counters — a variant can rely on JS decoration (not just CSS), so
    // this must always take the tracking plugin's full-reload path rather
    // than its node-diff heuristic (which would try, and fail, to target
    // this table heading cell as if it were visible editable content).
    const posted = [];
    const ctx = { port: { postMessage: (m) => posted.push(m) } };
    const trackingPlugin = createTrackingPlugin(
      () => updateDocument(ctx),
      () => {},
      (data) => getEditor(data, ctx),
      () => {},
    );
    const trackedEditor = await createTestEditor({ additionalPlugins: [trackingPlugin] });
    ctx.view = trackedEditor.view;
    try {
      const tablePos = insertTable(trackedEditor);
      posted.length = 0;
      handleApplyVariant({ node: { proseIndex: tablePos + 1 }, label: 'cards (large)' }, ctx);

      expect(posted).to.have.lengthOf(1);
      expect(posted[0].type).to.equal('set-body');
    } finally {
      destroyEditor(trackedEditor);
    }
  });
});
