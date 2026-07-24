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

/** True when nothing is focused or the selection still sits inside the focused block. */
export function isSelectionInFocusedBlock(state) {
  const pos = getBlockFocus(state);
  if (pos == null) return true;
  const node = state.doc.nodeAt(pos);
  const { from } = state.selection;
  return !!node && from >= pos && from < pos + node.nodeSize;
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
      apply(tr, prev) {
        const meta = tr.getMeta(blockFocusKey);
        if (meta !== undefined) return meta;
        if (prev.pos == null) return prev;
        return { pos: tr.mapping.map(prev.pos) };
      },
    },
    props: {
      decorations(state) {
        return buildDecorations(state.doc, getBlockFocus(state));
      },
    },
  });
}
