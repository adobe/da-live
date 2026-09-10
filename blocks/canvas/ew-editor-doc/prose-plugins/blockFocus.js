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
 * Resolve the focus position after a transaction.
 *
 * Normally the mapped position still lands on the focused block's start and is used
 * as-is — the focus tracks the block being edited, independent of where the selection
 * currently is. But some transactions — notably a collaborative Yjs undo, applied as a
 * large `y-sync` replace — remap the raw position to a garbage offset that no longer sits
 * on any top-level node. Left uncorrected, the focus decorations then hide *every* block
 * (including the one being edited), so the block-edit dialog appears empty and the block
 * looks deleted even though it is still in the document. Only when the mapped position is
 * no longer a valid top-level start do we re-resolve it to the top-level block that holds
 * the current selection (which, during block editing, stays inside the focused block).
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
