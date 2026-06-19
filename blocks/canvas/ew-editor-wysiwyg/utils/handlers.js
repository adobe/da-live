import { TextSelection, yUndo, yRedo } from 'da-y-wrapper';
import {
  NX_QUICK_EDIT_IFRAME_SELECTION_META,
  NX_QUICK_EDIT_CLEAR_IFRAME_SELECTION_ORIGIN_META,
} from '../../editor-utils/selection-toolbar.js';
import { selectionToolbarController } from '../../editor-utils/selection-toolbar-controller.js';
import { editorSelectChange } from '../../editor-utils/editor-utils.js';
import { getActiveBlockIndex } from '../../editor-utils/blocks.js';

/**
 * Run `view.dispatch(tr)` while temporarily pretending the view has focus.
 * y-prosemirror's cursor plugin reads `view.hasFocus()` synchronously inside
 * its `view.update()` to decide whether to broadcast the cursor to awareness.
 * In WYSIWYG mode the iframe owns DOM focus, so without the lie collaborators
 * lose sight of this user's cursor. The lie is restored to truth immediately
 * after dispatch so PM's undo path, DOM observer, focus-event timeouts, etc.
 * see the real focus state at all other times.
 */
function dispatchWithFakeFocus(view, tr) {
  const hadOwn = Object.hasOwn(view, 'hasFocus');
  const prev = hadOwn ? view.hasFocus : undefined;
  view.hasFocus = () => true;
  try {
    view.dispatch(tr);
  } finally {
    if (hadOwn) view.hasFocus = prev;
    else delete view.hasFocus;
  }
}

export function handleCursorMove({ cursorOffset, textCursorOffset }, ctx) {
  const { view, wsProvider, iframe } = ctx;
  if (!view || !wsProvider) return;

  if (cursorOffset == null || textCursorOffset == null) {
    // Iframe reports the cursor has left the editable area entirely.
    wsProvider.awareness.setLocalStateField('cursor', null);
    selectionToolbarController.setInactive('wysiwyg');
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
    tr.setMeta(NX_QUICK_EDIT_IFRAME_SELECTION_META, true);

    // Sync stored marks so the toolbar reflects the marks active at the cursor.
    // Two problems this solves:
    // 1. ProseMirror clears storedMarks whenever selection.anchor changes, which
    //    happens on every cursor-move — that wipes toolbar-toggled marks before the
    //    first keystroke arrives.
    // 2. marksAcross() returns Mark.none when the cursor is at the end of a mark
    //    run (nothing to the right), so the toolbar shows the mark as inactive even
    //    though the text is marked.  nodeBefore/nodeAfter covers both sides.
    const $pos = state.doc.resolve(position);
    const marksBefore = $pos.nodeBefore?.marks;
    const marksAfter = $pos.nodeAfter?.marks;
    const marksAtCursor = (marksBefore?.length ? marksBefore : null)
      ?? (marksAfter?.length ? marksAfter : null);

    if (marksAtCursor) {
      // Cursor is adjacent to marked text — use those marks (handles Cmd+B case).
      tr.setStoredMarks(marksAtCursor);
    } else if (state.storedMarks?.length) {
      // No marked text at this position, but user explicitly toggled a mark via
      // the toolbar — preserve it so it survives cursor-move events before typing.
      tr.setStoredMarks(state.storedMarks);
    }

    ctx.suppressRerender = true;
    dispatchWithFakeFocus(view, tr.scrollIntoView());
    ctx.suppressRerender = false;

    selectionToolbarController.setActive('wysiwyg', { view, iframe });
    selectionToolbarController.setRange(false);

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
  const { view, iframe } = ctx;
  if (anchor === head) {
    if (view) {
      const tr = view.state.tr
        .setMeta(NX_QUICK_EDIT_CLEAR_IFRAME_SELECTION_ORIGIN_META, true)
        .setMeta('addToHistory', false);
      ctx.suppressRerender = true;
      dispatchWithFakeFocus(view, tr);
      ctx.suppressRerender = false;
    }
    selectionToolbarController.setRange(false);
    return;
  }

  if (!handleSelectionChange(data, ctx, { fromQuickEditIframe: true })) return;

  selectionToolbarController.setActive('wysiwyg', { view, iframe });
  selectionToolbarController.setRange(true);
}
