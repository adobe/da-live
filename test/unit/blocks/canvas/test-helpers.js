import { EditorState, EditorView } from 'da-y-wrapper';
import { getSchema } from 'da-parser';

const schema = getSchema();

export function makeView(json) {
  const doc = schema.nodeFromJSON(json);
  let state = EditorState.create({ schema, doc });
  return {
    get state() { return state; },
    dispatch(tr) { state = state.apply(tr); },
  };
}

// Needed wherever a test goes through getInstrumentedHTML, which relies on view.posAtDOM/view.dom.
export function makeRealView(json) {
  const doc = schema.nodeFromJSON(json);
  const state = EditorState.create({ schema, doc });
  const dom = document.createElement('div');
  document.body.appendChild(dom);
  const view = new EditorView(dom, {
    state,
    dispatchTransaction(tr) { view.updateState(view.state.apply(tr)); },
  });
  return view;
}

// avoids fragile hand-computed offsets once more than one node's size is involved
export function posOf(doc, match) {
  let result;
  doc.forEach((node, offset) => {
    if (result === undefined && match(node)) result = offset;
  });
  return result;
}
