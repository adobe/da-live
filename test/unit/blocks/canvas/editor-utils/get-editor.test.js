import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { makeView, makeRealView } from '../test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let getEditor;
let resolveEditableNode;

before(async () => {
  const mod = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js');
  getEditor = mod.getEditor;
  resolveEditableNode = mod.resolveEditableNode;
});

// A "cards" block is authored as a table; each card is a multi-block table cell
// (heading + paragraph). This is the exact shape from the crash report.
const cardsDoc = {
  type: 'doc',
  content: [
    {
      type: 'table',
      content: [
        {
          type: 'table_row',
          content: [
            {
              type: 'table_cell',
              content: [
                { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Advantage Banking' }] },
                { type: 'paragraph', content: [{ type: 'text', text: '$11.95 monthly fee, waived with RBC Vantage.' }] },
              ],
            },
          ],
        },
      ],
    },
  ],
};

// The position immediately before the first node of `typeName`. When that node
// is the first child of a table cell, this is the cell-content boundary — the
// prose index the canvas stamps and hands to getEditor, and the offset that
// makes the naive resolver climb to the enclosing table_cell.
function posBefore(doc, typeName) {
  let found;
  doc.descendants((node, pos) => {
    if (found !== undefined) return false;
    if (node.type.name !== typeName) return true;
    found = pos;
    return false;
  });
  return found;
}

function capture(view) {
  const posted = [];
  const port = { postMessage: (m) => posted.push(m) };
  return { ctx: { view, suppressRerender: false, port }, posted };
}

describe('getEditor with a table-backed (cards) block', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('sends the cell heading, never the enclosing table_cell', () => {
    const view = makeView(cardsDoc);
    const cursorOffset = posBefore(view.state.doc, 'heading');
    const { ctx, posted } = capture(view);

    getEditor({ cursorOffset }, ctx);

    expect(posted).to.have.lengthOf(1);
    const { editorState } = posted[0].payload;
    expect(editorState.type).to.not.equal('table_cell');
    expect(editorState.type).to.equal('heading');
  });

  it('sends the cell paragraph, never the enclosing table_cell', () => {
    const view = makeView(cardsDoc);
    const cursorOffset = posBefore(view.state.doc, 'paragraph');
    const { ctx, posted } = capture(view);

    getEditor({ cursorOffset }, ctx);

    expect(posted).to.have.lengthOf(1);
    const { editorState } = posted[0].payload;
    expect(editorState.type).to.not.equal('table_cell');
    expect(editorState.type).to.equal('paragraph');
  });

  it('the resolved node can be wrapped in a doc without throwing', () => {
    const view = makeView(cardsDoc);
    const cursorOffset = posBefore(view.state.doc, 'heading');
    const { node } = resolveEditableNode(view.state.doc, cursorOffset);
    const { schema } = view.state;

    // This is exactly what the WYSIWYG iframe does; a table_cell here throws
    // "RangeError: Invalid content for node doc".
    expect(node.type.name).to.not.equal('table_cell');
    expect(() => schema.node('doc', null, [node])).to.not.throw();
  });

  it('resolves a cell paragraph via a real posAtDOM index', () => {
    const view = makeRealView(cardsDoc);
    const el = view.dom.querySelector('td p, th p');
    const cursorOffset = view.posAtDOM(el, 0);
    const { ctx, posted } = capture(view);

    getEditor({ cursorOffset }, ctx);

    expect(posted[0].payload.editorState.type).to.equal('paragraph');
  });

  it('still resolves a top-level paragraph to itself', () => {
    const view = makeView({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'plain top-level' }] }],
    });
    const cursorOffset = posBefore(view.state.doc, 'paragraph');
    const { ctx, posted } = capture(view);

    getEditor({ cursorOffset }, ctx);

    expect(posted[0].payload.editorState.type).to.equal('paragraph');
  });
});
