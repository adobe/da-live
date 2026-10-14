import { expect } from '@esm-bundle/chai';
import { EditorState, EditorView, TextSelection } from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import { setNx } from '../../../../../scripts/utils.js';
import createSuggestionPlugin, {
  setSuggesting,
  listSuggestions,
} from '../../../../../blocks/canvas/suggestions/suggestion-plugin.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { createSlashMenuPlugin } = await import('../../../../../blocks/canvas/ew-editor-doc/slash-menu/slash-menu.js');

const schema = getSchema();
const { nodes } = schema;

function editor() {
  const host = document.createElement('div');
  document.body.append(host);
  const view = new EditorView(host, {
    state: EditorState.create({
      doc: nodes.doc.create(null, [nodes.paragraph.create()]),
      plugins: [createSuggestionPlugin({ username: 'Ada' }), createSlashMenuPlugin()],
    }),
  });
  setSuggesting(view, true);
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
  return view;
}

const type = (view, text) => {
  [...text].forEach((ch) => {
    const { selection } = view.state;
    view.dispatch(view.state.tr.insertText(ch, selection.from, selection.to));
  });
};

const pick = (view, id) => {
  view.dom.parentElement.querySelector('nx-menu')
    .dispatchEvent(new CustomEvent('select', { detail: { id } }));
};

describe('slash menu in suggest mode', () => {
  let view;
  afterEach(() => {
    view?.dom.parentElement?.remove();
    view?.destroy();
    view = null;
  });

  it('does not suggest the query typed to open the menu', () => {
    view = editor();
    type(view, '/lorem ipsum');
    expect(listSuggestions(view.state.doc)).to.deep.equal([]);
  });

  it('does not suggest a deletion when the query is corrected', () => {
    view = editor();
    type(view, '/lorem x');
    const { from } = view.state.selection;
    view.dispatch(view.state.tr.delete(from - 1, from));
    expect(listSuggestions(view.state.doc)).to.deep.equal([]);
    expect(view.state.doc.textContent).to.equal('/lorem ');
  });

  it('still suggests text typed outside a slash query', () => {
    view = editor();
    type(view, 'hello');
    expect(listSuggestions(view.state.doc).map((s) => s.inserted)).to.deep.equal(['hello']);
  });

  it('does not suggest deleting the query once a command runs', () => {
    view = editor();
    type(view, '/lorem ipsum');
    pick(view, 'lorem-ipsum');

    expect(view.state.doc.textContent).to.not.contain('/lorem');
    const mentionsQuery = listSuggestions(view.state.doc)
      .some((s) => `${s.deleted}${s.inserted}`.includes('/lorem'));
    expect(mentionsQuery).to.be.false;
  });

  it('still suggests the content the command inserts', () => {
    view = editor();
    type(view, '/lorem ipsum');
    pick(view, 'lorem-ipsum');

    const inserted = listSuggestions(view.state.doc)
      .filter((s) => s.kind === 'insert')
      .map((s) => s.inserted)
      .join('');
    expect(inserted).to.contain('Lorem ipsum dolor sit amet');
  });
});
