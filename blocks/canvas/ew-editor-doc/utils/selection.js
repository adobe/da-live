import { NodeSelection, TextSelection, DOMSerializer } from 'da-y-wrapper';

export const SEL_BLOCK = 'block';
export const SEL_ITEM = 'item';
export const SEL_TEXT = 'text';
export const SEL_EMPTY = 'empty';

function serializeSelectionHTML(view) {
  try {
    const serializer = DOMSerializer.fromSchema(view.state.schema);
    const fragment = serializer.serializeFragment(view.state.selection.content().content);
    const div = document.createElement('div');
    div.appendChild(fragment);
    return div.innerHTML;
  } catch {
    return '';
  }
}

export function describeDocSelection(view) {
  const sel = view.state.selection;
  const isNodeSel = sel instanceof NodeSelection;
  const isBlockSel = isNodeSel && sel.$from.depth === 0;
  const base = { selFrom: sel.from, selTo: sel.to, kind: isNodeSel ? 'node' : 'text' };

  if (isBlockSel) {
    return {
      ...base,
      selectionType: SEL_BLOCK,
      selectedText: sel.node?.textContent ?? '',
      selectedHTML: '',
    };
  }
  if (isNodeSel) {
    return {
      ...base,
      selectionType: SEL_ITEM,
      selectedText: sel.node?.textContent ?? '',
      selectedHTML: serializeSelectionHTML(view),
    };
  }
  if (!sel.empty) {
    return {
      ...base,
      selectionType: SEL_TEXT,
      selectedText: view.state.doc.textBetween(sel.from, sel.to, '\n', ' '),
      selectedHTML: serializeSelectionHTML(view),
    };
  }
  return {
    ...base,
    selectionType: SEL_EMPTY,
    selectedText: '',
    selectedHTML: '',
  };
}

export function applyHighlight(view, { selFrom, selTo, selectionType } = {}) {
  if (!view || typeof selFrom !== 'number' || typeof selTo !== 'number') return;
  const { doc } = view.state;
  if (selFrom < 0 || selTo > doc.content.size) return;
  let sel;
  try {
    if (selectionType === SEL_BLOCK || selectionType === SEL_ITEM) {
      sel = NodeSelection.create(doc, selFrom);
    } else {
      sel = TextSelection.create(doc, selFrom, selTo);
    }
  } catch {
    return;
  }
  view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
  view.focus();
}
