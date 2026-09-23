import { expect } from '@esm-bundle/chai';
import { EditorState, TextSelection, ySyncPluginKey } from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import createSuggestionPlugin, {
  isSuggesting,
  suggestionPluginKey,
} from '../../../../../blocks/canvas/suggestions/suggestion-plugin.js';

const schema = getSchema();

const makeState = (text) => EditorState.create({
  doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text(text)])]),
  plugins: [createSuggestionPlugin({ username: 'ada' })],
});

const suggesting = (state) => state.apply(
  state.tr.setMeta(suggestionPluginKey, { inSuggestionMode: true }),
);

const marksInDoc = (state) => {
  const names = new Set();
  state.doc.descendants((node) => { node.marks.forEach((m) => names.add(m.type.name)); });
  return names;
};

// appendTransaction only runs through EditorState.apply, so drive the real path.
const applyWithAppend = (state, tr) => {
  const next = state.apply(tr);
  const plugin = state.plugins[0];
  const appended = plugin.spec.appendTransaction?.call(plugin, [tr], state, next);
  return appended ? next.apply(appended) : next;
};

describe('suggestion plugin', () => {
  it('registers the suggestion marks on the shared schema', () => {
    expect(schema.marks.suggestion_insert).to.exist;
    expect(schema.marks.suggestion_delete).to.exist;
  });

  it('is off by default', () => {
    expect(isSuggesting(makeState('Hello world'))).to.be.false;
  });

  it('turns on via plugin meta', () => {
    expect(isSuggesting(suggesting(makeState('Hello world')))).to.be.true;
  });

  it('marks typed text as an insertion while suggesting', () => {
    const state = suggesting(makeState('Hello world'));
    const tr = state.tr.insertText(' brave', 6);
    const next = applyWithAppend(state, tr);
    expect(marksInDoc(next).has('suggestion_insert')).to.be.true;
  });

  it('keeps deleted text in the doc, marked as a deletion', () => {
    const state = suggesting(makeState('Hello cruel world'));
    const tr = state.tr.delete(6, 12);
    const next = applyWithAppend(state, tr);
    expect(next.doc.textContent).to.contain('cruel');
    expect(marksInDoc(next).has('suggestion_delete')).to.be.true;
  });

  it('leaves the doc alone when not suggesting', () => {
    const state = makeState('Hello cruel world');
    const next = applyWithAppend(state, state.tr.delete(6, 12));
    expect(next.doc.textContent).to.not.contain('cruel');
    expect(marksInDoc(next).size).to.equal(0);
  });

  it('ignores a remote Yjs change so a peer\'s edit is never re-attributed', () => {
    const state = suggesting(makeState('Hello cruel world'));
    const tr = state.tr.delete(6, 12);
    tr.setMeta(ySyncPluginKey, { isChangeOrigin: true });
    const next = applyWithAppend(state, tr);
    expect(next.doc.textContent).to.not.contain('cruel');
    expect(marksInDoc(next).size).to.equal(0);
  });
});

describe('accept / reject', () => {
  const suggestedDeletion = () => {
    const state = suggesting(makeState('Hello cruel world'));
    return applyWithAppend(state, state.tr.delete(6, 12));
  };

  const runOnWholeDoc = (state, inRange) => {
    let next = state;
    inRange(0, state.doc.content.size)(state, (tr) => { next = state.apply(tr); });
    return next;
  };

  it('accepting a deletion removes the text for real', async () => {
    const { acceptSuggestionsInRange } = await import('../../../../../blocks/canvas/suggestions/suggestion-plugin.js');
    const next = runOnWholeDoc(suggestedDeletion(), acceptSuggestionsInRange);
    expect(next.doc.textContent).to.not.contain('cruel');
    expect(marksInDoc(next).size).to.equal(0);
  });

  it('rejecting a deletion puts the text back unmarked', async () => {
    const { rejectSuggestionsInRange } = await import('../../../../../blocks/canvas/suggestions/suggestion-plugin.js');
    const next = runOnWholeDoc(suggestedDeletion(), rejectSuggestionsInRange);
    expect(next.doc.textContent).to.contain('cruel');
    expect(marksInDoc(next).size).to.equal(0);
  });
});

describe('resolve helpers', () => {
  it('no longer registers toolbar commands (moved to the popover)', async () => {
    const { commandsFor } = await import('../../../../../blocks/canvas/editor-utils/command-defs.js');
    expect(commandsFor('toolbar-suggest')).to.deep.equal([]);
  });

  it('reports a suggestion only when the selection touches one', async () => {
    const { selectionHasSuggestion } = await import('../../../../../blocks/canvas/suggestions/suggestion-plugin.js');
    const plain = makeState('Hello cruel world');
    expect(selectionHasSuggestion(plain)).to.be.false;

    const state = suggesting(plain);
    const withSuggestion = applyWithAppend(state, state.tr.delete(6, 12));
    const all = withSuggestion.apply(
      withSuggestion.tr.setSelection(
        TextSelection.create(withSuggestion.doc, 1, withSuggestion.doc.content.size - 1),
      ),
    );
    expect(selectionHasSuggestion(all)).to.be.true;
  });
});
