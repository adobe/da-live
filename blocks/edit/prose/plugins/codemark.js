// Derived from: https://github.com/curvenote/editor/blob/812893edbf66e7903226ff73ea1c1f3234cd483b/packages/prosemirror-codemark/src/inputRules.ts

import { Plugin, PluginKey, TextSelection } from 'da-y-wrapper';

const codemarkKey = new PluginKey('codemark');

function hasMark(markType, state, from, to) {
  if (!markType) return false;
  if (state.storedMarks && markType.isInSet(state.storedMarks)) return true;
  if (markType.isInSet(state.doc.resolve(from).marks())) return true;
  return state.doc.rangeHasMark(from, to, markType);
}

function markText(view, match, from, to) {
  const { state } = view;
  const markType = state.schema.marks.code;
  if (hasMark(markType, state, from, to)) return false;
  const tr = state.tr.delete(from, to);
  const { anchor } = tr.selection;
  tr.insertText(match[1])
    .addMark(anchor, anchor + match[1].length, markType.create())
    .setSelection(TextSelection.create(tr.doc, anchor + match[1].length))
    .removeStoredMark(markType);
  view.dispatch(tr);
  return true;
}

export default function codemark() {
  return new Plugin({
    key: codemarkKey,
    props: {
      handleTextInput: (view, from, to, text) => {
        if (text !== '`') return false;
        // Check for a codemark before the cursor position.
        const { state } = view;
        const { $cursor } = state.selection;
        if (!$cursor) return false;
        const $from = state.doc.resolve(from);
        const { parent } = $from;
        const before = parent.textBetween(0, $from.parentOffset);
        let match = before.match(/`((?:[^`\w]|[\w])+)$/);
        if (match) {
          return markText(view, match, from - match[0].length, to);
        }
        const after = parent.textBetween($from.parentOffset, parent.nodeSize - 2);
        match = after.match(/^((?:[^`\w]|[\w])+)`/);
        if (match) {
          return markText(view, match, from, to + match[0].length);
        }
        return false;
      },
    },
  });
}
