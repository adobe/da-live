import { expect } from '@esm-bundle/chai';
import { EditorState } from 'da-y-wrapper';
import { setNx } from '../../../../../scripts/utils.js';
import { makeView, makeRealView } from '../test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let getEditor;
let resolveEditableNode;
let updateState;
let getInstrumentedHTML;

before(async () => {
  const mod = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js');
  getEditor = mod.getEditor;
  resolveEditableNode = mod.resolveEditableNode;
  updateState = mod.updateState;
  getInstrumentedHTML = mod.getInstrumentedHTML;
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
    const { editorState, imageVersion } = posted[0].payload;
    expect(editorState.type).to.not.equal('table_cell');
    expect(editorState.type).to.equal('heading');
    expect(imageVersion).to.be.a('string');
  });

  describe('quick-edit nested formatting', () => {
    let view;

    afterEach(() => {
      view?.destroy();
      document.body.innerHTML = '';
    });

    function mount(content) {
      view = makeRealView({ type: 'doc', content });
      return capture(view);
    }

    const heading = {
      type: 'heading',
      attrs: { level: 1 },
      content: [
        { type: 'text', text: 'Every Morning, Perfected.' },
        { type: 'hard_break' },
        { type: 'text', text: 'Brew Just for You.' },
      ],
    };
    const quote = (content) => ({ type: 'blockquote', content });

    it('opens and edits the whole quoted heading without losing its wrapper or line break', () => {
      const { ctx, posted } = mount([
        { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
        quote([heading]),
        { type: 'paragraph', content: [{ type: 'text', text: 'After' }] },
      ]);
      const cursorOffset = view.posAtDOM(view.dom.querySelector('blockquote'), 0);
      getEditor({ cursorOffset }, ctx);
      const { payload } = posted[0];
      expect(payload.cursorOffset).to.equal(cursorOffset);
      expect(payload.editorState.type).to.equal('blockquote');

      const edited = view.state.schema.nodeFromJSON(payload.editorState);
      const miniDoc = view.state.schema.node('doc', null, [edited]);
      const miniState = EditorState.create({ doc: miniDoc });
      const tr = miniState.tr.insertText('!', 2);
      updateState({
        cursorOffset,
        node: tr.doc.firstChild.toJSON(),
      }, ctx);

      const result = view.state.doc.child(1);
      expect(result.type.name).to.equal('blockquote');
      expect(result.firstChild.type.name).to.equal('heading');
      expect(result.firstChild.attrs.level).to.equal(1);
      expect(result.firstChild.textContent).to.equal('!Every Morning, Perfected.Brew Just for You.');
      expect(result.firstChild.child(1).type.name).to.equal('hard_break');
      expect(view.state.doc.firstChild.textContent).to.equal('Before');
      expect(view.state.doc.lastChild.textContent).to.equal('After');
      expect(getInstrumentedHTML(view)).to.include(`<blockquote data-prose-index="${cursorOffset}">`);
    });

    it('applies stored marks to inserted text inside a quote, including after a line break', () => {
      const { ctx, posted } = mount([quote([heading])]);
      const cursorOffset = view.posAtDOM(view.dom.querySelector('blockquote'), 0);
      const insertPos = view.posAtDOM(view.dom.querySelector('h1'), 2);
      const miniState = EditorState.create({ doc: view.state.doc });
      const edited = miniState.tr.insertText('X', insertPos).doc.firstChild;
      view.dispatch(view.state.tr.setStoredMarks([view.state.schema.marks.strong.create()]));

      updateState({ cursorOffset, node: edited.toJSON() }, ctx);

      expect(view.state.doc.nodeAt(insertPos).text).to.equal('X');
      expect(view.state.doc.nodeAt(insertPos).marks.map((mark) => mark.type.name))
        .to.deep.equal(['strong']);
      expect(view.state.doc.firstChild.firstChild.firstChild.marks).to.have.lengthOf(0);
      expect(view.state.doc.nodeAt(insertPos - 1).type.name).to.equal('hard_break');
      const sync = posted.find(({ type }) => type === 'set-editor-state');
      expect(sync.payload.editorState.type).to.equal('blockquote');
    });

    [
      quote([quote([heading])]),
      quote([heading, { type: 'paragraph', content: [{ type: 'text', text: 'Keep me' }] }]),
      {
        type: 'bullet_list',
        content: [{ type: 'list_item', content: [quote([heading])] }],
      },
      quote([{
        type: 'ordered_list',
        content: [{ type: 'list_item', content: [heading] }],
      }]),
    ].forEach((wrapper, i) => {
      it(`resolves the outermost instrumented wrapper for nested case ${i + 1}`, () => {
        mount([wrapper]);
        const outer = view.dom.firstElementChild;
        const cursorOffset = view.posAtDOM(outer, 0);
        const nestedOffset = view.posAtDOM(view.dom.querySelector('h1'), 0);
        [cursorOffset, nestedOffset].forEach((offset) => {
          const result = resolveEditableNode(view.state.doc, offset);
          expect(result.node === view.state.doc.firstChild).to.equal(true);
          expect(result.cursorOffset).to.equal(cursorOffset);
        });
        const miniState = EditorState.create({ doc: view.state.doc });
        const edited = miniState.tr.insertText('!', nestedOffset).doc;
        updateState({ cursorOffset, node: edited.firstChild.toJSON() }, capture(view).ctx);
        expect(view.state.doc.eq(edited)).to.equal(true);
      });
    });
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
