/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { EditorState, EditorView, TextSelection } from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import { setNx } from '../../../../../scripts/utils.js';
import createSuggestionPlugin, { setSuggesting } from '../../../../../blocks/canvas/suggestions/suggestion-plugin.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let selectionHasSuggestion;
let resolveSuggestion;
let acceptSuggestionsInRange;
let rejectSuggestionsInRange;

before(async () => {
  ({ selectionHasSuggestion, resolveSuggestion, acceptSuggestionsInRange, rejectSuggestionsInRange } = await import('../../../../../blocks/canvas/suggestions/suggestion-plugin.js'));
});

const schema = getSchema();

// Replacing text makes two adjacent marks — a deletion and an insertion. Resolving
// one has to resolve the pair, or accepting leaves the replaced text behind.
describe('replacing text is one suggestion', () => {
  let view;

  const cursorInside = (word) => {
    const at = view.state.doc.textContent.indexOf(word) + 1 + Math.floor(word.length / 2);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
  };

  beforeEach(() => {
    const host = document.createElement('div');
    document.body.append(host);
    view = new EditorView(host, {
      state: EditorState.create({
        doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Hello cruel world')])]),
        plugins: [createSuggestionPlugin({ username: 'ada' })],
      }),
    });
    setSuggesting(view, true);
    // Select "cruel" and type over it.
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 7, 12)));
    view.dispatch(view.state.tr.replaceSelectionWith(schema.text('brave'), false));
  });

  afterEach(() => view?.destroy());

  it('records both halves of the replacement', () => {
    expect(view.state.doc.textContent).to.contain('cruel');
    expect(view.state.doc.textContent).to.contain('brave');
  });

  it('accepting from inside the insertion also drops the replaced text', () => {
    cursorInside('brave');
    expect(selectionHasSuggestion(view.state)).to.be.true;
    resolveSuggestion(acceptSuggestionsInRange)(view);
    expect(view.state.doc.textContent).to.equal('Hello brave world');
  });

  it('accepting from inside the deletion gives the same result', () => {
    cursorInside('cruel');
    resolveSuggestion(acceptSuggestionsInRange)(view);
    expect(view.state.doc.textContent).to.equal('Hello brave world');
  });

  it('rejecting restores the original text', () => {
    cursorInside('brave');
    resolveSuggestion(rejectSuggestionsInRange)(view);
    expect(view.state.doc.textContent).to.equal('Hello cruel world');
  });

  it('leaves no marks behind either way', () => {
    cursorInside('brave');
    resolveSuggestion(acceptSuggestionsInRange)(view);
    const names = new Set();
    view.state.doc.descendants((n) => n.marks.forEach((m) => names.add(m.type.name)));
    expect([...names]).to.deep.equal([]);
  });
});
