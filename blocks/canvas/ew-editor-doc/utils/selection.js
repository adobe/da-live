import { NodeSelection, DOMSerializer } from 'da-y-wrapper';

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
      selectionType: 'block',
      selectedText: sel.node?.textContent ?? '',
      selectedHTML: '',
    };
  }
  if (isNodeSel) {
    return {
      ...base,
      selectionType: 'item',
      selectedText: sel.node?.textContent ?? '',
      selectedHTML: serializeSelectionHTML(view),
    };
  }
  if (!sel.empty) {
    return {
      ...base,
      selectionType: 'text',
      selectedText: view.state.doc.textBetween(sel.from, sel.to, '\n', ' '),
      selectedHTML: serializeSelectionHTML(view),
    };
  }
  return {
    ...base,
    selectionType: 'empty',
    selectedText: '',
    selectedHTML: '',
  };
}
