/* eslint-disable import/no-unresolved -- importmap */
import { Plugin, PluginKey, Decoration, DecorationSet } from 'da-y-wrapper';

const HIDDEN_CLASS = 'nx-block-hidden';

export const blockFocusKey = new PluginKey('nxBlockFocus');

/** Focus a single top-level block (its start pos); hides every other top-level node. */
export function setBlockFocus(view, pos) {
  if (!view) return;
  view.dispatch(view.state.tr.setMeta(blockFocusKey, { pos }));
}

/** Clear block focus, revealing the whole document again. */
export function clearBlockFocus(view) {
  if (!view || blockFocusKey.getState(view.state)?.pos == null) return;
  view.dispatch(view.state.tr.setMeta(blockFocusKey, { pos: null }));
}

export function getBlockFocus(state) {
  return blockFocusKey.getState(state)?.pos ?? null;
}

/** True when `pos` is exactly the start offset of a top-level node. */
function isTopLevelStart(doc, pos) {
  if (pos == null || pos < 0 || pos > doc.content.size) return false;
  let found = false;
  doc.forEach((node, offset) => { if (offset === pos) found = true; });
  return found;
}

/** Start offset of the top-level node that contains `pos`, or null. */
function topLevelStart(doc, pos) {
  if (pos == null) return null;
  const clamped = Math.max(0, Math.min(pos, doc.content.size));
  let result = null;
  doc.forEach((node, offset) => {
    if (result == null && clamped >= offset && clamped < offset + node.nodeSize) {
      result = offset;
    }
  });
  return result;
}

/**
 * Focus position after a transaction. Keep the mapped position while it still lands on a
 * top-level block start; if a transaction (e.g. a collab Yjs undo) remaps it off any
 * block — which would hide the block being edited — fall back to the block holding the
 * selection.
 */
export function resolveBlockFocusPos(doc, mappedPos, selectionFrom) {
  if (isTopLevelStart(doc, mappedPos)) return mappedPos;
  const repaired = topLevelStart(doc, selectionFrom);
  return repaired ?? mappedPos;
}

/** True when nothing is focused or the selection still sits inside the focused block. */
export function isSelectionInFocusedBlock(state) {
  const pos = getBlockFocus(state);
  if (pos == null) return true;
  const node = state.doc.nodeAt(pos);
  const { from } = state.selection;
  return !!node && from >= pos && from < pos + node.nodeSize;
}

/** Would the current selection, if deleted, remove the whole focused block? */
function selectionRemovesFocusedBlock(state) {
  const pos = getBlockFocus(state);
  if (pos == null) return false;
  const node = state.doc.nodeAt(pos);
  if (!node) return false;
  const { selection } = state;
  // The block selected as a node, or any range that fully spans it (e.g. select-all).
  if (selection.node && selection.from === pos) return true;
  return selection.from <= pos && selection.to >= pos + node.nodeSize;
}

/**
 * Keymap command (Backspace/Delete) that swallows the key while block-editing when it
 * would delete the whole focused block — you can't delete the block you're editing.
 * Returns false otherwise so normal delete behaviour still runs.
 */
export function guardFocusedBlockDeletion(state) {
  return selectionRemovesFocusedBlock(state);
}

function buildDecorations(doc, pos) {
  if (pos == null) return DecorationSet.empty;
  const decos = [];
  doc.forEach((node, offset) => {
    if (offset !== pos) {
      decos.push(Decoration.node(offset, offset + node.nodeSize, { class: HIDDEN_CLASS }));
    }
  });
  return DecorationSet.create(doc, decos);
}

/**
 * Tracks the focused top-level block position (mapped across edits) and hides every
 * other top-level node via node decorations. Decorations are used (rather than
 * mutating node DOM directly) so ProseMirror applies the classes itself without its
 * DOMObserver re-triggering a redraw — a direct class toggle here would loop.
 */
export default function blockFocus() {
  return new Plugin({
    key: blockFocusKey,
    state: {
      init: () => ({ pos: null }),
      apply(tr, prev, _oldState, newState) {
        const meta = tr.getMeta(blockFocusKey);
        if (meta !== undefined) return meta;
        if (prev.pos == null) return prev;
        const mapped = tr.mapping.map(prev.pos);
        return { pos: resolveBlockFocusPos(newState.doc, mapped, newState.selection.from) };
      },
    },
    props: {
      decorations(state) {
        return buildDecorations(state.doc, getBlockFocus(state));
      },
      handleDOMEvents: {
        // Cut removes the selection; block it when that would delete the focused block.
        cut(view, event) {
          if (!selectionRemovesFocusedBlock(view.state)) return false;
          event.preventDefault();
          return true;
        },
      },
    },
  });
}
