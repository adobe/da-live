import { expect } from '@esm-bundle/chai';
import { EditorState, EditorView, columnResizing } from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import { setNx } from '../../../../../scripts/utils.js';
import { createTestEditor, destroyEditor } from '../../edit/prose/test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { updateState, getEditor, getInstrumentedHTML, parseSections } = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js');

describe('layout mode leaves pending suggestions alone', () => {
  let editor;
  let posted;
  let ctx;

  const suggestedParagraph = (schema) => schema.nodes.paragraph.create(null, [
    schema.text('Amet'),
    schema.text('asdas', [schema.marks.suggestion_insert.create({ username: 'Ada' })]),
  ]);

  beforeEach(async () => {
    editor = await createTestEditor();
    const { state } = editor.view;
    editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, [
      suggestedParagraph(state.schema),
      state.schema.nodes.paragraph.create(null, state.schema.text('Plain')),
    ]));
    posted = [];
    ctx = { view: editor.view, port: { postMessage: (m) => posted.push(m) } };
  });

  afterEach(() => destroyEditor(editor));

  it('does not open a paragraph with pending suggestions for editing', () => {
    getEditor({ cursorOffset: 1 }, ctx);
    expect(posted.some((m) => m.type === 'set-editor-state')).to.be.false;
  });

  it('still opens paragraphs without suggestions', () => {
    const plainStart = editor.view.state.doc.firstChild.nodeSize + 1;
    getEditor({ cursorOffset: plainStart }, ctx);
    expect(posted.some((m) => m.type === 'set-editor-state')).to.be.true;
  });

  it('refuses a layout update that would overwrite the suggestion', () => {
    const { schema } = editor.view.state;
    const layoutCopy = schema.nodes.paragraph.create(null, schema.text('Ametasdas changed'));
    updateState({ node: layoutCopy.toJSON(), cursorOffset: 1, nodeUpdateId: 'edit-1' }, ctx);

    expect(editor.view.state.doc.firstChild.textContent).to.equal('Ametasdas');
    let marked = false;
    editor.view.state.doc.firstChild.forEach((child) => {
      if (child.marks.some((m) => m.type.name === 'suggestion_insert')) marked = true;
    });
    expect(marked).to.be.true;

    const ack = posted.find((m) => m.type === 'node-update');
    expect(ack.payload.nodeUpdateId).to.equal('edit-1');
    expect(posted.some((m) => m.type === 'set-body')).to.be.true;
  });

  it('applies layout updates to paragraphs without suggestions', () => {
    const { schema } = editor.view.state;
    const plainStart = editor.view.state.doc.firstChild.nodeSize + 1;
    const edited = schema.nodes.paragraph.create(null, schema.text('Plain edited'));
    updateState({ node: edited.toJSON(), cursorOffset: plainStart, nodeUpdateId: 'edit-2' }, ctx);
    expect(editor.view.state.doc.lastChild.textContent).to.equal('Plain edited');
  });

  it('locks the paragraph and points the click-through at its suggestion', () => {
    const html = new DOMParser().parseFromString(getInstrumentedHTML(editor.view), 'text/html');
    const [locked, plain] = html.querySelectorAll('p');
    expect(locked.dataset.suggestionLock).to.contain('Click to review');
    expect(locked.dataset.suggestionPos).to.equal('5');
    expect(plain.hasAttribute('data-suggestion-lock')).to.be.false;
  });

  it('shows the approved text, not the suggestion markup', () => {
    const html = getInstrumentedHTML(editor.view);
    expect(html).to.not.contain('da-suggestion-added');
    expect(html).to.not.contain('da-suggestion-deleted');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('p').textContent).to.equal('Amet');
  });

  it('gives the lock a visible, clickable marker', () => {
    const host = document.createElement('div');
    host.innerHTML = new DOMParser()
      .parseFromString(getInstrumentedHTML(editor.view), 'text/html').body.innerHTML;
    document.body.append(host);
    try {
      const locked = host.querySelector('[data-suggestion-lock]');
      expect(getComputedStyle(locked).position).to.equal('relative');
      expect(getComputedStyle(locked).cursor).to.equal('pointer');
      expect(getComputedStyle(locked, '::before').width).to.equal('3px');
    } finally {
      host.remove();
    }
  });

  it('adds no lock styling when nothing is pending', () => {
    const { state } = editor.view;
    editor.view.dispatch(state.tr.replaceWith(
      0,
      state.doc.content.size,
      state.schema.nodes.paragraph.create(null, state.schema.text('Plain')),
    ));
    const html = getInstrumentedHTML(editor.view);
    expect(html).to.not.contain('data-suggestion-lock');
    expect(html).to.not.contain('<style>');
  });
});

describe('layout mode with suggested blocks and images', () => {
  const schema = getSchema();
  let view;
  let dom;

  const cell = (text) => schema.nodes.table_cell.create(
    null,
    schema.nodes.paragraph.create(null, schema.text(text)),
  );
  const block = (name, attrs = null) => schema.nodes.table.create(attrs, [
    schema.nodes.table_row.create(null, cell(name)),
    schema.nodes.table_row.create(null, cell('Body')),
  ]);
  const suggested = (suggestion) => ({ suggestion, suggestionUsername: 'Ada' });
  const plain = (text) => schema.nodes.paragraph.create(null, schema.text(text));

  // columnResizing renders tables through TableView, inside a .tableWrapper like the real editor.
  const mount = (content) => {
    dom = document.createElement('div');
    document.body.append(dom);
    const doc = schema.nodes.doc.create(null, content);
    const state = EditorState.create({ schema, doc, plugins: [columnResizing()] });
    view = new EditorView(dom, { state });
    return new DOMParser().parseFromString(getInstrumentedHTML(view), 'text/html');
  };

  afterEach(() => {
    view?.destroy();
    dom?.remove();
  });

  it('replaces a proposed block with a clickable placeholder naming it', () => {
    const html = mount([block('Cards', suggested('insert')), plain('Plain')]);
    expect(html.querySelector('.cards')).to.be.null;
    const slot = html.querySelector('[data-suggestion-placeholder="block"]');
    expect(slot.textContent).to.equal('Suggested block: Cards');
    expect(slot.dataset.suggestionPos).to.equal('0');
    expect(slot.hasAttribute('data-suggestion-lock')).to.be.true;
    expect(slot.hasAttribute('data-prose-index')).to.be.false;
    expect(html.querySelector('[data-block-index]')).to.be.null;
  });

  it('locks a block proposed for deletion, and the text inside it', () => {
    const html = mount([plain('Intro'), block('Columns', suggested('delete'))]);
    const columns = html.querySelector('.columns');
    expect(columns.dataset.blockIndex).to.exist;
    expect(columns.dataset.suggestionLock).to.contain('Click to review');
    expect(columns.dataset.suggestionPos).to.equal(String(view.state.doc.firstChild.nodeSize));
    expect(columns.querySelector('p').hasAttribute('data-suggestion-lock')).to.be.true;
  });

  it('does not open text inside a block proposed for deletion', () => {
    mount([block('Columns', suggested('delete'))]);
    const posted = [];
    getEditor({ cursorOffset: 4 }, { view, port: { postMessage: (m) => posted.push(m) } });
    expect(posted).to.deep.equal([]);
  });

  it('leaves an untouched block unlocked', () => {
    const html = mount([block('Columns')]);
    expect(html.querySelector('.columns').hasAttribute('data-suggestion-lock')).to.be.false;
  });

  it('drops a paragraph that is entirely a proposed insertion', () => {
    const html = mount([
      schema.nodes.paragraph.create(null, [
        schema.text('all new', [schema.marks.suggestion_insert.create({ username: 'Ada' })]),
      ]),
      plain('Plain'),
    ]);
    const paragraphs = [...html.querySelectorAll('p')];
    expect(paragraphs.map((p) => p.textContent)).to.deep.equal(['Plain']);
  });

  it('replaces a proposed image and locks its paragraph', () => {
    const html = mount([
      schema.nodes.paragraph.create(null, [
        schema.nodes.image.create({ src: '/a.png', ...suggested('insert') }),
      ]),
    ]);
    expect(html.querySelector('img')).to.be.null;
    const slot = html.querySelector('[data-suggestion-placeholder="image"]');
    expect(slot.textContent).to.equal('Suggested image');
    expect(slot.dataset.suggestionPos).to.equal('1');
    expect(html.querySelector('p').dataset.suggestionPos).to.equal('1');
  });

  it('leaves a clean document alone', () => {
    const html = mount([plain('Plain'), block('Columns')]);
    expect(html.querySelector('style')).to.be.null;
    expect(html.querySelector('[data-suggestion-lock], [data-suggestion-placeholder]')).to.be.null;
  });

  it('keeps placeholders out of the page outline', () => {
    const html = mount([block('Cards', suggested('insert')), plain('Plain')]);
    const [section] = parseSections(html.documentElement.outerHTML);
    expect(section.blocks).to.deep.equal([]);
    expect(section.items.flatMap((i) => i.children ?? [i]).map((i) => i.innerText))
      .to.deep.equal(['Plain']);
  });
});
