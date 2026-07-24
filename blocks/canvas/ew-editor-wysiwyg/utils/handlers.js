import { TextSelection, NodeSelection, yUndo, yRedo } from 'da-y-wrapper';
import {
  NX_QUICK_EDIT_IFRAME_SELECTION_META,
  NX_QUICK_EDIT_CLEAR_IFRAME_SELECTION_ORIGIN_META,
} from '../../editor-utils/selection-toolbar.js';
import { editorSelectChange, dispatchWithFakeFocus } from '../../editor-utils/editor-utils.js';
import { toolbarController } from '../../editor-utils/toolbar-controller.js';
import { getActiveBlockIndex } from '../../editor-utils/blocks.js';

export function handleCursorMove({ cursorOffset, textCursorOffset }, ctx) {
  const { view, wsProvider } = ctx;
  if (!view || !wsProvider) return;

  if (cursorOffset == null || textCursorOffset == null) {
    // Per-block blur from the iframe — its documented purpose is clearing the
    // remote cursor, NOT hiding the toolbar. The user is still in the pane while
    // the iframe holds focus; toolbar deactivation comes from the iframe's blur.
    wsProvider.awareness.setLocalStateField('cursor', null);
    // Forget the last position so re-entering (even at the same offset) counts as
    // a move and resets stored marks rather than preserving a stale queued mark.
    ctx.lastCursorPos = null;
    return;
  }

  const { state } = view;
  const position = cursorOffset + textCursorOffset;

  try {
    if (position < 0 || position > state.doc.content.size) {
      // eslint-disable-next-line no-console
      console.warn('Invalid cursor position:', position);
      return;
    }

    const { tr } = state;
    tr.setSelection(TextSelection.create(state.doc, position));

    // Sync stored marks to the cursor's location. marksAcross() returns Mark.none
    // when the cursor sits at the end of a mark run (nothing to the right), so the
    // toolbar would show the mark inactive even though the text is marked;
    // inspecting nodeBefore/nodeAfter covers both sides.
    const $pos = state.doc.resolve(position);
    const marksBefore = $pos.nodeBefore?.marks;
    const marksAfter = $pos.nodeAfter?.marks;
    const marksAtCursor = (marksBefore?.length ? marksBefore : null)
      ?? (marksAfter?.length ? marksAfter : null);

    // A real cursor move always resets stored marks to what's at the new location
    // (which is nothing when the text there is unmarked). A toolbar-toggled mark is
    // only queued for the next keystroke — it must survive the *same-position*
    // cursor-move the iframe re-reports after the toggle, but not an actual move.
    const cursorMoved = position !== ctx.lastCursorPos;
    if (marksAtCursor) {
      // Cursor is adjacent to marked text — use those marks (handles Cmd+B case).
      tr.setStoredMarks(marksAtCursor);
    } else if (cursorMoved) {
      // Moved onto unmarked text — clear so nothing lingers from the old position.
      tr.setStoredMarks(null);
    } else if (state.storedMarks?.length) {
      // Same position after a toolbar toggle — keep the queued mark until the user
      // types or actually moves the cursor.
      tr.setStoredMarks(state.storedMarks);
    }
    ctx.lastCursorPos = position;

    ctx.suppressRerender = true;
    dispatchWithFakeFocus(view, tr.scrollIntoView());
    ctx.suppressRerender = false;
    toolbarController.setWysiwygSelection({ showable: true });
    const blockIndex = getActiveBlockIndex(view);
    if (blockIndex !== ctx.lastBlockIndex) {
      ctx.lastBlockIndex = blockIndex;
      editorSelectChange.emit({ blockIndex, source: 'wysiwyg' });
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error moving cursor:', error);
  }
}

export function handleUndoRedo(data, ctx) {
  const { action } = data;
  const view = ctx?.view;
  if (!view) return;
  if (action === 'undo') {
    yUndo(view.state);
  } else if (action === 'redo') {
    yRedo(view.state);
  }
}

export function handleNewVersion() {
  document.dispatchEvent(new CustomEvent('nx-canvas-new-version', { bubbles: true, composed: true }));
}

export function handleStoredMarks({ marks }, ctx) {
  const { view } = ctx;
  if (!view) return;
  const { state } = view;
  const { schema } = state;
  try {
    const parsedMarks = marks
      .map((m) => {
        const markType = schema.marks[m.type];
        return markType ? markType.create(m.attrs) : null;
      })
      .filter(Boolean);
    const { tr } = state;
    tr.setStoredMarks(parsedMarks);
    ctx.suppressRerender = true;
    dispatchWithFakeFocus(view, tr);
    ctx.suppressRerender = false;
    toolbarController.refresh();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[quick-edit-controller] handleStoredMarks failed', e?.message);
  }
}

export function handleSelectionChange({ anchor, head }, ctx, { fromQuickEditIframe = false } = {}) {
  const { view } = ctx;
  if (!view) return false;
  const { state } = view;
  try {
    const a = Math.max(0, Math.min(anchor, state.doc.content.size));
    const h = Math.max(0, Math.min(head, state.doc.content.size));
    const { tr } = state;
    tr.setSelection(TextSelection.create(state.doc, a, h));
    if (fromQuickEditIframe) tr.setMeta(NX_QUICK_EDIT_IFRAME_SELECTION_META, true);
    ctx.suppressRerender = true;
    dispatchWithFakeFocus(view, tr);
    ctx.suppressRerender = false;
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[quick-edit-controller] handleSelectionChange failed', e?.message);
    return false;
  }
}

/** PostMessage `selection-change` from wysiwyg iframe: sync PM selection and toolbar. */
export function handleIframeSelectionChange(data, ctx) {
  const { anchor, head } = data;
  const { view } = ctx;
  if (anchor === head) {
    // Collapsed to a caret: clear the iframe-origin flag so subsequent doc
    // transactions are read normally. Still a caret in the iframe, so the toolbar
    // stays active/showable.
    if (view) {
      const tr = view.state.tr
        .setMeta(NX_QUICK_EDIT_CLEAR_IFRAME_SELECTION_ORIGIN_META, true)
        .setMeta('addToHistory', false);
      ctx.suppressRerender = true;
      dispatchWithFakeFocus(view, tr);
      ctx.suppressRerender = false;
    }
    toolbarController.setWysiwygSelection({ showable: true });
    return;
  }

  if (!handleSelectionChange(data, ctx, { fromQuickEditIframe: true })) return;

  toolbarController.setWysiwygSelection({ showable: true });
}

function srcFileName(src) {
  if (!src) return '';
  const bare = String(src).split('?')[0].split('#')[0];
  return bare.split('/').pop() || '';
}

function findImagePosBySrc(doc, src, blockIndex) {
  const name = srcFileName(src);
  if (!name) return null;
  let from = 0;
  let to = doc.content.size;
  if (blockIndex != null) {
    const tablePos = blockIndex - 1;
    const table = tablePos >= 0 ? doc.nodeAt(tablePos) : null;
    if (table?.type.name === 'table') {
      from = tablePos;
      to = tablePos + table.nodeSize;
    }
  }
  let found = null;
  doc.nodesBetween(from, to, (n, pos) => {
    if (found != null) return false;
    if (n.type.name === 'image' && srcFileName(n.attrs?.src) === name) {
      found = pos;
      return false;
    }
    return true;
  });
  return found;
}

export function resolveNodeSelectPos(node, doc) {
  if (!node) return null;
  if (node.anchorType === 'table') {
    const pos = node.proseIndex - 1;
    if (pos < 0 || pos > doc.content.size) return null;
    return doc.nodeAt(pos)?.type.name === 'table' ? pos : null;
  }
  if (node.anchorType === 'image') {
    const pos = node.proseIndex;
    if (pos != null && pos >= 0 && pos <= doc.content.size
      && doc.nodeAt(pos)?.type.name === 'image') {
      return pos;
    }
    return node.src ? findImagePosBySrc(doc, node.src, node.blockIndex) : null;
  }
  return null;
}

export function handleNodeSelect({ node }, ctx) {
  const { view } = ctx;
  if (!view) return;
  const { state } = view;
  try {
    if (!node) {
      const tr = state.tr
        .setSelection(TextSelection.near(state.doc.resolve(state.selection.from), 1))
        .setMeta('addToHistory', false);
      ctx.suppressRerender = true;
      dispatchWithFakeFocus(view, tr);
      ctx.suppressRerender = false;
      return;
    }
    const pos = resolveNodeSelectPos(node, state.doc);
    if (pos == null) return;
    const tr = state.tr
      .setSelection(NodeSelection.create(state.doc, pos))
      .scrollIntoView()
      .setMeta('addToHistory', false);
    ctx.suppressRerender = true;
    dispatchWithFakeFocus(view, tr);
    ctx.suppressRerender = false;
    // Tables have their own UI; the toolbar hides for them. Images keep it.
    toolbarController.setWysiwygSelection({ showable: node.anchorType !== 'table' });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[quick-edit-controller] handleNodeSelect failed', e?.message);
  }
}
