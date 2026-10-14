import { expect } from '@esm-bundle/chai';
import { EditorState, EditorView, NodeSelection, TextSelection } from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import { setNx } from '../../../../../scripts/utils.js';
import createSuggestionPlugin, {
  setSuggesting,
  listSuggestions,
  acceptSuggestionsInRange,
  rejectSuggestionsInRange,
} from '../../../../../blocks/canvas/suggestions/suggestion-plugin.js';
import { COMMAND_BY_ID } from '../../../../../blocks/canvas/editor-utils/command-defs.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const schema = getSchema();
const { nodes } = schema;

const para = (text) => nodes.paragraph.create(null, text ? schema.text(text) : null);
const cell = (text) => nodes.table_cell.create(null, para(text));
const block = (name, body = 'Hi') => nodes.table.create(null, [
  nodes.table_row.create(null, cell(name)),
  nodes.table_row.create(null, cell(body)),
]);
const image = (src) => nodes.image.create({ src });

function editor(content) {
  const host = document.createElement('div');
  document.body.append(host);
  const view = new EditorView(host, {
    state: EditorState.create({
      doc: nodes.doc.create(null, content),
      plugins: [createSuggestionPlugin({ username: 'Ada' })],
    }),
  });
  setSuggesting(view, true);
  return view;
}

function find(doc, typeName) {
  const found = [];
  doc.descendants((node, pos) => {
    if (node.type.name === typeName) found.push({ node, pos });
  });
  return found;
}

const resolve = (view, action) => {
  const [item] = listSuggestions(view.state.doc);
  const inRange = action === 'accept' ? acceptSuggestionsInRange : rejectSuggestionsInRange;
  inRange(item.from, item.to)(view.state, view.dispatch);
};

describe('image suggestions', () => {
  let view;
  afterEach(() => {
    view?.dom.parentElement?.remove();
    view?.destroy();
  });

  it('marks an inserted image on the node, not with a mark', () => {
    view = editor([para('Hello ')]);
    view.dispatch(view.state.tr.insert(7, image('https://x.com/a.png')));
    const [{ node }] = find(view.state.doc, 'image');
    expect(node.attrs.suggestion).to.equal('insert');
    expect(node.attrs.suggestionUsername).to.equal('Ada');
    expect(node.marks).to.be.empty;
  });

  it('keeps a deleted image in place, suggested for deletion', () => {
    view = editor([para('Hello ')]);
    view.dispatch(view.state.tr.insert(7, image('https://x.com/a.png')));
    resolve(view, 'accept');
    const [{ pos }] = find(view.state.doc, 'image');
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    view.dispatch(view.state.tr.deleteSelection());

    const [{ node }] = find(view.state.doc, 'image');
    expect(node.attrs.suggestion).to.equal('delete');
    const [item] = listSuggestions(view.state.doc);
    expect(item).to.include({ subject: 'image', kind: 'delete', deleted: 'a.png' });
  });

  it('lists a replaced image as one replace suggestion', () => {
    view = editor([para('Hi '), para('x')]);
    view.dispatch(view.state.tr.insert(4, image('https://x.com/old.png')));
    resolve(view, 'accept');
    const [{ pos }] = find(view.state.doc, 'image');
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    view.dispatch(view.state.tr.replaceSelectionWith(image('https://x.com/new.png')));

    const items = listSuggestions(view.state.doc);
    expect(items).to.have.length(1);
    expect(items[0]).to.include({ subject: 'image', kind: 'replace', deleted: 'old.png', inserted: 'new.png' });
  });

  it('accepting a replaced image keeps only the new one', () => {
    view = editor([para('Hi ')]);
    view.dispatch(view.state.tr.insert(4, image('https://x.com/old.png')));
    resolve(view, 'accept');
    const [{ pos }] = find(view.state.doc, 'image');
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    view.dispatch(view.state.tr.replaceSelectionWith(image('https://x.com/new.png')));
    resolve(view, 'accept');

    const images = find(view.state.doc, 'image');
    expect(images.map(({ node }) => node.attrs.src)).to.deep.equal(['https://x.com/new.png']);
    expect(images[0].node.attrs.suggestion).to.equal(null);
  });

  it('rejecting a replaced image keeps only the old one', () => {
    view = editor([para('Hi ')]);
    view.dispatch(view.state.tr.insert(4, image('https://x.com/old.png')));
    resolve(view, 'accept');
    const [{ pos }] = find(view.state.doc, 'image');
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    view.dispatch(view.state.tr.replaceSelectionWith(image('https://x.com/new.png')));
    resolve(view, 'reject');

    const images = find(view.state.doc, 'image');
    expect(images.map(({ node }) => node.attrs.src)).to.deep.equal(['https://x.com/old.png']);
    expect(images[0].node.attrs.suggestion).to.equal(null);
  });

  it('withdraws your own pending image when you delete it', () => {
    view = editor([para('Hello ')]);
    view.dispatch(view.state.tr.insert(7, image('https://x.com/a.png')));
    const [{ pos }] = find(view.state.doc, 'image');
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    view.dispatch(view.state.tr.deleteSelection());
    expect(find(view.state.doc, 'image')).to.be.empty;
    expect(listSuggestions(view.state.doc)).to.deep.equal([]);
  });

  it('outlines a suggested image', () => {
    view = editor([para('Hello ')]);
    view.dispatch(view.state.tr.insert(7, image('https://x.com/a.png')));
    expect(view.dom.querySelector('.da-suggestion-node-insert')).to.exist;
  });
});

describe('block suggestions', () => {
  let view;
  afterEach(() => {
    view?.dom.parentElement?.remove();
    view?.destroy();
  });

  const tablePos = () => find(view.state.doc, 'table')[0].pos;

  it('marks an inserted block on the node and leaves its text unmarked', () => {
    view = editor([para('Intro')]);
    view.dispatch(view.state.tr.insert(view.state.doc.content.size, block('hero')));

    const [{ node }] = find(view.state.doc, 'table');
    expect(node.attrs.suggestion).to.equal('insert');
    let marked = false;
    node.descendants((child) => {
      if (child.marks.length) marked = true;
    });
    expect(marked).to.be.false;
    expect(listSuggestions(view.state.doc)[0]).to.include({ subject: 'block', kind: 'insert', inserted: 'hero' });
  });

  it('keeps a deleted block in place, suggested for deletion', () => {
    view = editor([para('Intro'), block('hero'), para('Outro')]);
    const pos = tablePos();
    view.dispatch(view.state.tr.delete(pos, pos + view.state.doc.nodeAt(pos).nodeSize));

    const tables = find(view.state.doc, 'table');
    expect(tables).to.have.length(1);
    expect(tables[0].node.attrs.suggestion).to.equal('delete');
    expect(view.state.doc.textContent).to.equal('IntroheroHiOutro');
  });

  it('accepting a block deletion removes the block', () => {
    view = editor([para('Intro'), block('hero'), para('Outro')]);
    const pos = tablePos();
    view.dispatch(view.state.tr.delete(pos, pos + view.state.doc.nodeAt(pos).nodeSize));
    resolve(view, 'accept');
    expect(find(view.state.doc, 'table')).to.be.empty;
  });

  it('rejecting a block deletion restores it', () => {
    view = editor([para('Intro'), block('hero'), para('Outro')]);
    const pos = tablePos();
    view.dispatch(view.state.tr.delete(pos, pos + view.state.doc.nodeAt(pos).nodeSize));
    resolve(view, 'reject');
    const tables = find(view.state.doc, 'table');
    expect(tables).to.have.length(1);
    expect(tables[0].node.attrs.suggestion).to.equal(null);
  });

  it('rejecting an inserted block removes it', () => {
    view = editor([para('Intro')]);
    view.dispatch(view.state.tr.insert(view.state.doc.content.size, block('hero')));
    resolve(view, 'reject');
    expect(find(view.state.doc, 'table')).to.be.empty;
  });

  it('lists a replaced block as one replace suggestion', () => {
    view = editor([para('Intro'), block('hero'), para('Outro')]);
    const pos = tablePos();
    const end = pos + view.state.doc.nodeAt(pos).nodeSize;
    view.dispatch(view.state.tr.replaceWith(pos, end, block('cards')));

    const items = listSuggestions(view.state.doc);
    expect(items).to.have.length(1);
    expect(items[0]).to.include({ subject: 'block', kind: 'replace', deleted: 'hero', inserted: 'cards' });
  });

  it('accepting a replaced block keeps only the new one', () => {
    view = editor([para('Intro'), block('hero'), para('Outro')]);
    const pos = tablePos();
    const end = pos + view.state.doc.nodeAt(pos).nodeSize;
    view.dispatch(view.state.tr.replaceWith(pos, end, block('cards')));
    resolve(view, 'accept');

    const tables = find(view.state.doc, 'table');
    expect(tables).to.have.length(1);
    expect(tables[0].node.firstChild.textContent).to.equal('cards');
    expect(tables[0].node.attrs.suggestion).to.equal(null);
  });

  it('rejecting a replaced block keeps only the old one', () => {
    view = editor([para('Intro'), block('hero'), para('Outro')]);
    const pos = tablePos();
    const end = pos + view.state.doc.nodeAt(pos).nodeSize;
    view.dispatch(view.state.tr.replaceWith(pos, end, block('cards')));
    resolve(view, 'reject');

    const tables = find(view.state.doc, 'table');
    expect(tables).to.have.length(1);
    expect(tables[0].node.firstChild.textContent).to.equal('hero');
  });

  it('keeps text edits inside a block as text suggestions', () => {
    view = editor([block('hero', 'Hello')]);
    let textPos;
    view.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === 'Hello') textPos = pos;
    });
    view.dispatch(view.state.tr.insertText(' world', textPos + 5));

    expect(find(view.state.doc, 'table')[0].node.attrs.suggestion).to.equal(null);
    expect(listSuggestions(view.state.doc)[0]).to.include({ subject: 'text', kind: 'insert', inserted: ' world' });
  });

  it('outlines a suggested block', () => {
    view = editor([para('Intro')]);
    view.dispatch(view.state.tr.insert(view.state.doc.content.size, block('hero')));
    expect(view.dom.querySelector('.da-suggestion-node-insert')).to.exist;
  });

  it('leaves blocks alone when not suggesting', () => {
    view = editor([para('Intro')]);
    setSuggesting(view, false);
    view.dispatch(view.state.tr.insert(view.state.doc.content.size, block('hero')));
    expect(find(view.state.doc, 'table')[0].node.attrs.suggestion).to.equal(null);
  });
});

describe('attribute controls while suggesting', () => {
  let view;
  afterEach(() => {
    view?.dom.parentElement?.remove();
    view?.destroy();
  });

  it('disables alt text editing', () => {
    view = editor([para('Hi ')]);
    const altText = COMMAND_BY_ID.get('image-alt-text');
    expect(altText.disabled(view.state)).to.be.true;
    setSuggesting(view, false);
    expect(altText.disabled(view.state)).to.be.false;
  });

  it('tags the editor so the focal point control can hide', () => {
    view = editor([para('Hi ')]);
    expect(view.dom.classList.contains('da-suggesting')).to.be.true;
    setSuggesting(view, false);
    expect(view.dom.classList.contains('da-suggesting')).to.be.false;
  });
});

describe('canvas block and image flows while suggesting', () => {
  let view;
  afterEach(() => {
    view?.dom.parentElement?.remove();
    view?.destroy();
  });

  const libraryBlock = (name) => {
    const table = document.createElement('table');
    table.innerHTML = `<tr><td>${name}</td></tr><tr><td>Body</td></tr>`;
    return table;
  };

  it('tracks a block inserted from the library', async () => {
    const { insertBlock } = await import('../../../../../blocks/canvas/ew-panel-extensions/helpers.js');
    view = editor([para('Intro')]);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 6)));
    insertBlock(view, libraryBlock('hero'));
    const items = listSuggestions(view.state.doc);
    expect(items).to.have.length(1);
    expect(items[0]).to.include({ subject: 'block', kind: 'insert', inserted: 'hero' });
  });

  it('tracks Replace block as one replace suggestion', async () => {
    const { replaceBlockRange } = await import('../../../../../blocks/canvas/editor-utils/blocks.js');
    view = editor([para('Intro'), block('hero'), para('Outro')]);
    const [{ pos, node }] = find(view.state.doc, 'table');
    replaceBlockRange(view, pos, pos + node.nodeSize, libraryBlock('cards'));
    const items = listSuggestions(view.state.doc);
    expect(items).to.have.length(1);
    expect(items[0]).to.include({ subject: 'block', kind: 'replace', deleted: 'hero', inserted: 'cards' });
  });

  it('tracks Delete block', async () => {
    const { deleteBlock } = await import('../../../../../blocks/canvas/editor-utils/blocks.js');
    view = editor([para('Intro'), block('hero'), para('Outro')]);
    deleteBlock(view, 0);
    expect(find(view.state.doc, 'table')[0].node.attrs.suggestion).to.equal('delete');
  });

  it('tracks an image upload that replaces a selected image', () => {
    view = editor([para('Hi ')]);
    view.dispatch(view.state.tr.insert(4, image('https://x.com/old.png')));
    resolve(view, 'accept');
    const [{ pos }] = find(view.state.doc, 'image');
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));

    // Mirrors uploadImageFile: drop a placeholder, then swap in the uploaded image.
    view.dispatch(view.state.tr.replaceSelectionWith(image('/blocks/edit/img/fpo.svg')));
    const { $from } = view.state.selection;
    const fpo = TextSelection.create(view.state.doc, $from.pos - 1, $from.pos);
    view.dispatch(view.state.tr.setSelection(fpo).replaceSelectionWith(image('https://x.com/new.png')));

    const images = find(view.state.doc, 'image').map(({ node }) => [node.attrs.src, node.attrs.suggestion]);
    expect(images).to.deep.equal([
      ['https://x.com/old.png', 'delete'],
      ['https://x.com/new.png', 'insert'],
    ]);
  });
});

describe('selection over a suggested block', () => {
  it('resolves the whole block from a caret inside it', async () => {
    const { suggestionRange } = await import('../../../../../blocks/canvas/suggestions/suggestion-plugin.js');
    const view = editor([para('Intro')]);
    view.dispatch(view.state.tr.insert(view.state.doc.content.size, block('hero')));
    const [{ pos, node }] = find(view.state.doc, 'table');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 4)));
    expect(suggestionRange(view.state)).to.deep.equal({ from: pos, to: pos + node.nodeSize });
    view.dom.parentElement.remove();
    view.destroy();
  });
});

describe('edits inside a suggested block', () => {
  let view;
  afterEach(() => {
    view?.dom.parentElement?.remove();
    view?.destroy();
    view = null;
  });

  const insertBlock = () => {
    view = editor([para('Intro')]);
    view.dispatch(view.state.tr.insert(view.state.doc.content.size, block('Cards', 'Body')));
    return find(view.state.doc, 'table')[0];
  };

  const caretAfter = (text) => {
    let pos = null;
    view.state.doc.descendants((node, at) => {
      if (node.isText && node.text === text) pos = at + text.length;
    });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
    return pos;
  };

  it('stays one suggestion when text is typed inside it', () => {
    insertBlock();
    const pos = caretAfter('Body');
    view.dispatch(view.state.tr.insertText('!', pos, pos));

    const items = listSuggestions(view.state.doc);
    expect(items.map((i) => i.subject)).to.deep.equal(['block']);
    expect(view.state.doc.textContent).to.contain('Body!');
  });

  it('stays one suggestion when an image is added inside it', () => {
    insertBlock();
    caretAfter('Body');
    view.dispatch(view.state.tr.replaceSelectionWith(image('https://x.com/new.png')));

    expect(listSuggestions(view.state.doc).map((i) => i.subject)).to.deep.equal(['block']);
    expect(find(view.state.doc, 'image')[0].node.attrs.suggestion).to.equal(null);
  });

  it('clears stray marks inside the block when it is accepted', () => {
    view = editor([para('Intro')]);
    const marked = schema.text('Body', [schema.marks.suggestion_insert.create({ username: 'Ada' })]);
    const stray = nodes.table.create(null, [
      nodes.table_row.create(null, cell('Cards')),
      nodes.table_row.create(
        null,
        nodes.table_cell.create(null, nodes.paragraph.create(null, marked)),
      ),
    ]);
    view.dispatch(view.state.tr.insert(view.state.doc.content.size, stray));
    expect(listSuggestions(view.state.doc).map((i) => i.subject)).to.deep.equal(['block']);

    resolve(view, 'accept');
    expect(listSuggestions(view.state.doc)).to.deep.equal([]);
    expect(view.state.doc.textContent).to.contain('Body');
  });
});
