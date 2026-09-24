/* eslint-disable import/no-unresolved -- importmap */
import { Plugin, ySyncPluginKey } from 'da-y-wrapper';
import {
  suggestionModePlugin,
  suggestionPluginKey,
  setSuggestionMode,
  acceptSuggestionsInRange,
  rejectSuggestionsInRange,
} from '../../../deps/prosemirror-suggestion-mode/dist/index.js';
import { canvasBus } from '../utils/canvas-bus.js';

export { suggestionPluginKey, acceptSuggestionsInRange, rejectSuggestionsInRange };

const SUGGESTION_MARKS = ['suggestion_insert', 'suggestion_delete'];

// Replacing text records a deletion immediately followed by an insertion. They are
// one edit to the author, so resolve by contiguous run rather than by what the
// selection happens to cover — otherwise accepting the insertion strands the deletion.
function suggestionRuns(doc) {
  const runs = [];
  let current = null;
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    if (!node.marks.some((m) => SUGGESTION_MARKS.includes(m.type.name))) {
      current = null;
      return;
    }
    if (current?.to === pos) {
      current.to = pos + node.nodeSize;
      return;
    }
    current = { from: pos, to: pos + node.nodeSize };
    runs.push(current);
  });
  return runs;
}

function suggestionRange(state) {
  const { from, to } = state.selection;
  const hits = suggestionRuns(state.doc).filter((run) => run.from <= to && run.to >= from);
  if (!hits.length) return null;
  return {
    from: Math.min(...hits.map((run) => run.from)),
    to: Math.max(...hits.map((run) => run.to)),
  };
}

export function selectionHasSuggestion(state) {
  return suggestionRange(state) != null;
}

export function resolveSuggestion(inRange) {
  return (view) => {
    const range = suggestionRange(view.state);
    if (!range) return false;
    inRange(range.from, range.to)(view.state, view.dispatch);
    return true;
  };
}

export { suggestionRange };

function runText(doc, run) {
  let deleted = '';
  let inserted = '';
  let username = '';
  let createdAt = null;
  doc.nodesBetween(run.from, run.to, (node) => {
    if (!node.isText) return;
    const mark = node.marks.find((m) => SUGGESTION_MARKS.includes(m.type.name));
    if (!mark) return;
    if (mark.type.name === 'suggestion_delete') deleted += node.text ?? '';
    else inserted += node.text ?? '';
    if (!username) username = mark.attrs.username || '';
    if (createdAt == null) createdAt = mark.attrs.createdAt ?? null;
  });
  return { deleted, inserted, username, createdAt };
}

function suggestionKind({ deleted, inserted }) {
  if (deleted && inserted) return 'replace';
  return deleted ? 'delete' : 'insert';
}

export function listSuggestions(doc) {
  return suggestionRuns(doc).map((run) => {
    const parts = runText(doc, run);
    return {
      id: `${run.from}-${run.to}`,
      from: run.from,
      to: run.to,
      kind: suggestionKind(parts),
      ...parts,
    };
  });
}

export function isSuggesting(state) {
  return Boolean(suggestionPluginKey.getState(state)?.inSuggestionMode);
}

export function setSuggesting(view, on) {
  setSuggestionMode(view, on);
}

export function toggleSuggesting(view) {
  setSuggestionMode(view, !isSuggesting(view.state));
  return true;
}

export default function createSuggestionPlugin({ username }) {
  const base = suggestionModePlugin({ username });
  const { appendTransaction } = base.spec;

  return new Plugin({
    key: suggestionPluginKey,
    state: base.spec.state,

    view() {
      let last = '';
      const publish = (view) => {
        const items = listSuggestions(view.state.doc);
        const key = JSON.stringify(items);
        if (key === last) return;
        last = key;
        canvasBus.suggestionsState.emit({ items });
      };
      return {
        update(view) { publish(view); },
        destroy() { canvasBus.suggestionsState.emit({ items: [] }); },
      };
    },
    // The plugin marks a deletion by putting the removed content back. Run that on a
    // peer's incoming change and it would undo their edit and re-attribute it to us,
    // then sync the undo to everyone — so skip any batch carrying a Yjs change.
    appendTransaction(transactions, oldState, newState) {
      if (transactions.some((tr) => tr.getMeta(ySyncPluginKey)?.isChangeOrigin)) return null;
      return appendTransaction.call(this, transactions, oldState, newState);
    },
  });
}
