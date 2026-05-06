import { TextSelection } from 'da-y-wrapper';

/**
 * Find where characters were inserted by comparing old and new text.
 * Returns { start, end } as text offsets within the string, or null if
 * no net insertion occurred.
 */
function findInsertedRange(oldText, newText) {
  if (newText.length <= oldText.length) return null;
  let prefixLen = 0;
  const maxPrefix = Math.min(oldText.length, newText.length);
  while (prefixLen < maxPrefix && oldText[prefixLen] === newText[prefixLen]) prefixLen += 1;
  return { start: prefixLen, end: prefixLen + (newText.length - oldText.length) };
}

export function updateState(data, ctx) {
  const { view } = ctx;
  // Capture stored marks before the transaction — these are marks the user toggled
  // (e.g. Bold) that ProseMirror is holding for the next character typed.  In
  // WYSIWYG mode, keystrokes go to the iframe so ProseMirror's normal mark
  // application on input never runs; we must apply them ourselves here.
  const { storedMarks } = view.state;
  const node = view.state.schema.nodeFromJSON(data.node);
  const pos = view.state.doc.resolve(data.cursorOffset);
  const docPos = view.state.selection.from;

  const nodeStart = pos.before(pos.depth);
  const nodeEnd = pos.after(pos.depth);

  const { tr } = view.state;
  tr.replaceWith(nodeStart, nodeEnd, node);

  let appliedMarks = false;
  if (storedMarks?.length) {
    const oldText = view.state.doc.textBetween(nodeStart, nodeEnd);
    const inserted = findInsertedRange(oldText, node.textContent);
    if (inserted) {
      // In ProseMirror each text character occupies one position unit, so
      // text offset i maps to doc position nodeStart + 1 + i.
      const markFrom = nodeStart + 1 + inserted.start;
      const markTo = nodeStart + 1 + inserted.end;
      storedMarks.forEach((mark) => tr.addMark(markFrom, markTo, mark));
      // Preserve stored marks so continued typing stays in the same formatting state.
      tr.setStoredMarks(storedMarks);
      appliedMarks = true;
    }
  }

  tr.setSelection(TextSelection.create(tr.doc, docPos));

  ctx.suppressRerender = true;
  view.dispatch(tr);
  ctx.suppressRerender = false;

  // Sync the updated node (with marks applied) back to the portal's mini editor.
  // Without this, the portal's editor retains the plain-text version, so the next
  // character typed would send a node-update that overwrites the marks we just added
  // (replaceWith replaces the whole paragraph with the portal's plain content).
  if (appliedMarks && ctx.port) {
    try {
      const syncPos = view.state.doc.resolve(data.cursorOffset);
      const syncNodeStart = syncPos.before(syncPos.depth);
      const syncNode = view.state.doc.resolve(syncNodeStart).nodeAfter;
      if (syncNode) {
        ctx.port.postMessage({
          type: 'set-editor-state',
          editorState: syncNode.toJSON(),
          cursorOffset: data.cursorOffset,
        });
      }
    } catch {
      // Non-fatal: position errors after structural changes
    }
  }
}

export function getEditor(data, ctx) {
  if (ctx.suppressRerender) return;
  const { view } = ctx;
  const { cursorOffset } = data;
  if (typeof cursorOffset !== 'number') return;

  const { doc } = view.state;
  const maxPos = doc.content.size;
  if (cursorOffset < 0 || cursorOffset > maxPos) return;

  try {
    const pos = doc.resolve(cursorOffset);
    const before = pos.before(pos.depth);
    const beforePos = doc.resolve(before);
    const nodeAtBefore = beforePos.nodeAfter;
    if (!nodeAtBefore) return;
    ctx.port.postMessage({ type: 'set-editor-state', editorState: nodeAtBefore.toJSON(), cursorOffset: before + 1 });
  } catch {
    // Stale iframe cursor after structural replace (e.g. chat revert, remote sync).
  }
}
