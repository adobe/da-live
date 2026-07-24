import { EditorState } from 'da-y-wrapper';
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

// avoids fragile hand-computed offsets once more than one node's size is involved
export function posOf(doc, match) {
  let result;
  doc.forEach((node, offset) => {
    if (result === undefined && match(node)) result = offset;
  });
  return result;
}
