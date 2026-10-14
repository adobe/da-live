import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { createTestEditor, destroyEditor } from '../../edit/prose/test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { updateState, getEditor, getInstrumentedHTML } = await import(
  '../../../../../blocks/canvas/editor-utils/editor-utils.js'
);

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

  it('marks locked paragraphs in the layout HTML with a hint', () => {
    const html = new DOMParser().parseFromString(getInstrumentedHTML(editor.view), 'text/html');
    const [locked, plain] = html.querySelectorAll('p');
    expect(locked.hasAttribute('data-suggestion-lock')).to.be.true;
    expect(locked.dataset.suggestionLock).to.contain('Switch to Content');
    expect(plain.hasAttribute('data-suggestion-lock')).to.be.false;
    const style = html.querySelector('style')?.textContent;
    expect(style).to.contain('[data-suggestion-lock]:hover::after');
    expect(style).to.contain('[data-suggestion-lock]::before');
  });

  it('shows the approved text, not the suggestion markup', () => {
    const html = getInstrumentedHTML(editor.view);
    expect(html).to.not.contain('da-suggestion-added');
    expect(html).to.not.contain('da-suggestion-deleted');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('p').textContent).to.equal('Amet');
  });

  it('gives the lock a visible marker, not just a tooltip', () => {
    const host = document.createElement('div');
    host.innerHTML = new DOMParser()
      .parseFromString(getInstrumentedHTML(editor.view), 'text/html').body.innerHTML;
    document.body.append(host);
    try {
      const locked = host.querySelector('[data-suggestion-lock]');
      expect(getComputedStyle(locked).position).to.equal('relative');
      expect(getComputedStyle(locked).cursor).to.equal('not-allowed');
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

describe('layout mode hides proposed content', () => {
  let editor;

  const build = async (content) => {
    editor = await createTestEditor();
    const { state } = editor.view;
    editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, content(state.schema)));
    return new DOMParser().parseFromString(getInstrumentedHTML(editor.view), 'text/html');
  };

  const cell = (schema, text) => schema.nodes.table_cell.create(
    null,
    schema.nodes.paragraph.create(null, schema.text(text)),
  );
  const suggestedBlock = (schema, suggestion, name) => schema.nodes.table.create(
    { suggestion, suggestionUsername: 'Ada' },
    [
      schema.nodes.table_row.create(null, cell(schema, name)),
      schema.nodes.table_row.create(null, cell(schema, 'Body')),
    ],
  );

  afterEach(() => destroyEditor(editor));

  it('replaces a proposed block with a placeholder naming it', async () => {
    const html = await build((schema) => [
      suggestedBlock(schema, 'insert', 'Cards'),
      schema.nodes.paragraph.create(null, schema.text('Plain')),
    ]);
    expect(html.querySelector('table')).to.be.null;
    const slot = html.querySelector('[data-suggestion-placeholder="block"]');
    expect(slot.textContent).to.equal('Suggested block: Cards');
    expect(slot.hasAttribute('data-prose-index')).to.be.false;
  });

  it('keeps a block proposed for deletion, flagged as pending', async () => {
    const html = await build((schema) => [suggestedBlock(schema, 'delete', 'Columns')]);
    const table = html.querySelector('table');
    expect(table).to.exist;
    expect(table.dataset.suggestionPending).to.contain('Proposed for deletion');
  });

  it('drops a paragraph that is entirely a proposed insertion', async () => {
    const html = await build((schema) => [
      schema.nodes.paragraph.create(null, [
        schema.text('all new', [schema.marks.suggestion_insert.create({ username: 'Ada' })]),
      ]),
      schema.nodes.paragraph.create(null, schema.text('Plain')),
    ]);
    const paragraphs = [...html.querySelectorAll('p')];
    expect(paragraphs.map((p) => p.textContent)).to.deep.equal(['Plain']);
  });

  it('replaces a proposed image and keeps its paragraph locked', async () => {
    const html = await build((schema) => [
      schema.nodes.paragraph.create(null, [
        schema.nodes.image.create({ src: '/a.png', suggestion: 'insert', suggestionUsername: 'Ada' }),
      ]),
    ]);
    expect(html.querySelector('img')).to.be.null;
    expect(html.querySelector('[data-suggestion-placeholder="image"]').textContent)
      .to.equal('Suggested image');
    expect(html.querySelector('p').hasAttribute('data-suggestion-lock')).to.be.true;
  });

  it('leaves a clean document alone', async () => {
    const html = await build((schema) => [schema.nodes.paragraph.create(null, schema.text('Plain'))]);
    expect(html.querySelector('style')).to.be.null;
    expect(html.querySelector('[data-suggestion-placeholder]')).to.be.null;
  });
});

describe('page outline ignores suggestion placeholders', () => {
  let editor;
  afterEach(() => destroyEditor(editor));

  it('lists the real content only', async () => {
    const { parseSections } = await import(
      '../../../../../blocks/canvas/editor-utils/editor-utils.js'
    );
    editor = await createTestEditor();
    const { state } = editor.view;
    const { schema } = state;
    const cell = (text) => schema.nodes.table_cell.create(
      null,
      schema.nodes.paragraph.create(null, schema.text(text)),
    );
    editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, [
      schema.nodes.table.create({ suggestion: 'insert', suggestionUsername: 'Ada' }, [
        schema.nodes.table_row.create(null, cell('Cards')),
        schema.nodes.table_row.create(null, cell('Body')),
      ]),
      schema.nodes.paragraph.create(null, schema.text('Plain')),
    ]));

    const [section] = parseSections(getInstrumentedHTML(editor.view));
    expect(section.blocks).to.deep.equal([]);
    expect(section.items.flatMap((i) => i.children ?? [i]).map((i) => i.innerText))
      .to.deep.equal(['Plain']);
  });
});
