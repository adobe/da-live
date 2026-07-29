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

export function selectedNodePayload(view) {
  const sel = view?.state?.selection;
  if (!(sel instanceof NodeSelection)) return null;
  const name = sel.node?.type?.name;
  if (name === 'table' && sel.$from.depth === 0) {
    return { anchorType: 'table', proseIndex: sel.from + 1 };
  }
  if (name === 'image') {
    return { anchorType: 'image', proseIndex: sel.from, src: sel.node?.attrs?.src ?? '' };
  }
  return null;
}

// Mirrors the outline's own proseIndex convention (getDefaultContentProseIndex /
// data-prose-index), which is NOT simply each node's own start — non-image content is
// indexed one position *inside* its own start (posAtDOM(el, 0)), because da-nx's
// inline-editor bootstrap depends on that exact value as its cursorOffset (see
// prose-diff.js/da-nx's prose.js). Images are the one exception: data-image-index stores
// the node's own start directly, since an atomic node has no "inside". Blocks (table)
// are excluded entirely — they're tracked via blockIndex, never as outline content-children.
export function activeContentProseIndex(view) {
  const sel = view?.state?.selection;
  if (!sel) return undefined;
  if (sel instanceof NodeSelection) {
    const name = sel.node?.type?.name;
    if (name === 'table') return undefined;
    return name === 'image' ? sel.from : sel.from + 1;
  }
  const { $from } = sel;
  if ($from.depth < 1) return undefined;
  return $from.node(1).type.name === 'table' ? undefined : $from.before(1) + 1;
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
