import {
  Y,
  ySyncPluginKey,
  NodeSelection,
  CellSelection,
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
} from 'da-y-wrapper';
import { getTableInfo } from '../../../edit/prose/plugins/tableUtils.js';

function encodeRelPos(relPos) {
  return Array.from(Y.encodeRelativePosition(relPos));
}

function hashString(str) {
  let h = 5381;
  // eslint-disable-next-line no-bitwise
  for (let i = 0; i < str.length; i += 1) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return h;
}

function nodeAtPath(doc, path) {
  let node = doc;
  let start = 0;
  for (const idx of path) {
    if (!node || idx >= node.childCount) return null;
    let before = 0;
    for (let i = 0; i < idx; i += 1) before += node.child(i).nodeSize;
    start += before + 1;
    node = node.child(idx);
  }
  return { node, start };
}

function anchorHash(node, anchorType) {
  if (anchorType === 'image') return hashString(node?.attrs?.src ?? '');
  if (anchorType === 'text') return hashString(node?.textContent ?? '');
  return 0;
}

function encodeStructural(state, { from, to, anchorType }) {
  if (!state.doc) return null;
  const $from = state.doc.resolve(from);
  const path = [];
  for (let d = 1; d <= $from.depth; d += 1) path.push($from.index(d - 1));

  if (anchorType === 'image' || anchorType === 'table') {
    const node = state.doc.nodeAt(from);
    if (!node) return null;
    path.push($from.index($from.depth));
    return { path, offset: -1, length: node.nodeSize, hash: anchorHash(node, anchorType) };
  }

  const blockStart = $from.start($from.depth);
  return {
    path,
    offset: from - blockStart,
    length: to - from,
    hash: anchorHash($from.parent, 'text'),
  };
}

function resolveNodeAnchorRange(state, from, anchorType) {
  if (!state.doc) return null;
  const typeName = anchorType === 'image' ? 'image' : 'table';
  const node = state.doc.nodeAt(from);
  if (node?.type.name !== typeName) return null;
  return { from, to: from + node.nodeSize };
}

function decodeStructural(state, anchor) {
  const structural = anchor?.structural;
  if (!structural?.path || !state.doc) return null;
  const located = nodeAtPath(state.doc, structural.path);
  if (!located) return null;
  if (anchor.structural.hash !== anchorHash(located.node, anchor.anchorType)) return null;
  const from = located.start + structural.offset;
  const to = from + structural.length;
  if (from < 0 || to > state.doc.content.size || from >= to) return null;
  if (anchor.anchorType === 'image' || anchor.anchorType === 'table') {
    return resolveNodeAnchorRange(state, from, anchor.anchorType);
  }
  return { from, to };
}

function relPosMatchesHash(state, from, anchor) {
  if (!anchor.structural || !state.doc) return true;
  if (anchor.anchorType === 'image' || anchor.anchorType === 'table') {
    return anchor.anchorType === 'table'
      || anchor.structural.hash === anchorHash(state.doc.nodeAt(from), 'image');
  }
  return anchor.structural.hash === anchorHash(state.doc.resolve(from).parent, 'text');
}

function decodeRelPos(encoded) {
  if (!Array.isArray(encoded) || encoded.length === 0) return null;
  return Y.decodeRelativePosition(Uint8Array.from(encoded));
}

function pmPosAtTextOffset(doc, rangeFrom, rangeTo, targetOffset) {
  if (targetOffset <= 0) return rangeFrom;
  let count = 0;
  let matched = false;
  let result = rangeTo;

  doc.nodesBetween(rangeFrom, rangeTo, (node, pos) => {
    if (matched || !node.isText) return;
    const start = Math.max(pos, rangeFrom);
    const end = Math.min(pos + node.nodeSize, rangeTo);
    for (let p = start; p < end; p += 1) {
      if (count === targetOffset) {
        result = p;
        matched = true;
        return;
      }
      count += 1;
    }
  });

  if (!matched && count === targetOffset) return rangeTo;
  return matched ? result : null;
}

function locateAnchorTextInRange(state, rangeFrom, rangeTo, anchorText, hintFrom) {
  const haystack = state.doc.textBetween(rangeFrom, rangeTo, ' ');
  if (!haystack.includes(anchorText)) return null;

  let best = null;
  let bestDist = Infinity;
  let searchAt = 0;
  let idx = haystack.indexOf(anchorText, searchAt);
  while (idx !== -1) {
    const from = pmPosAtTextOffset(state.doc, rangeFrom, rangeTo, idx);
    const to = pmPosAtTextOffset(state.doc, rangeFrom, rangeTo, idx + anchorText.length);
    if (from != null && to != null && from < to) {
      const dist = Math.abs(from - hintFrom);
      if (dist < bestDist) {
        bestDist = dist;
        best = { from, to };
      }
    }
    searchAt = idx + 1;
    idx = haystack.indexOf(anchorText, searchAt);
  }
  return best;
}

function resolveTextAnchorRange(state, from, to, anchorText) {
  if (!state.doc) return { from, to };

  const decodedText = state.doc.textBetween(from, to, ' ');
  if (decodedText === anchorText) return { from, to };
  if (!decodedText.includes(anchorText)) return { from, to };

  const narrowed = locateAnchorTextInRange(state, from, to, anchorText, from);
  if (!narrowed || narrowed.from <= from) return { from, to };
  return narrowed;
}

export function encodeAnchor({ selectionData, state }) {
  if (!selectionData) return null;
  const binding = ySyncPluginKey.getState(state)?.binding;
  if (!binding) return null;
  return {
    anchorFrom: encodeRelPos(
      absolutePositionToRelativePosition(selectionData.from, binding.type, binding.mapping),
    ),
    anchorTo: encodeRelPos(
      absolutePositionToRelativePosition(selectionData.to, binding.type, binding.mapping),
    ),
    anchorType: selectionData.anchorType,
    anchorText: selectionData.anchorText,
    structural: encodeStructural(state, selectionData),
  };
}

export function resolveAnchor({ anchor, state }) {
  const none = { range: null, source: null };
  if (!anchor?.anchorFrom || !anchor?.anchorTo) return none;
  const binding = ySyncPluginKey.getState(state)?.binding;
  if (!binding) return none;
  const relFrom = decodeRelPos(anchor.anchorFrom);
  const relTo = decodeRelPos(anchor.anchorTo);
  if (!relFrom || !relTo) return none;
  const { doc: yDoc, type, mapping } = binding;

  try {
    const from = relativePositionToAbsolutePosition(yDoc, type, relFrom, mapping);
    const to = relativePositionToAbsolutePosition(yDoc, type, relTo, mapping);
    if (from != null && to != null && from < to) {
      let relResult;
      if (anchor.anchorType === 'image' || anchor.anchorType === 'table') {
        relResult = resolveNodeAnchorRange(state, from, anchor.anchorType);
      } else if (anchor.anchorType === 'text' && anchor.anchorText) {
        relResult = resolveTextAnchorRange(state, from, to, anchor.anchorText);
      } else {
        relResult = { from, to };
      }
      if (relResult) {
        if (relPosMatchesHash(state, from, anchor)) return { range: relResult, source: 'relpos' };
        const structural = decodeStructural(state, anchor);
        return structural
          ? { range: structural, source: 'structural' }
          : { range: relResult, source: 'relpos' };
      }
    }
    const structural = decodeStructural(state, anchor);
    return structural ? { range: structural, source: 'structural' } : none;
  } catch {
    return none;
  }
}

export function decodeAnchor({ anchor, state }) {
  return resolveAnchor({ anchor, state }).range;
}

function nodeAnchorData(state, node, from, to) {
  if (node.type.name === 'image') {
    return { from, to, anchorType: 'image', anchorText: '' };
  }
  if (node.type.name === 'table') {
    const tableInfo = getTableInfo(state, from + 3);
    const name = tableInfo?.tableName?.trim();
    return {
      from,
      to,
      anchorType: 'table',
      anchorText: name ? `block: ${name}` : '',
    };
  }
  return null;
}

export function getSelectionData(state) {
  const { selection, doc } = state;
  if (!selection || selection.empty) return null;
  if (selection instanceof CellSelection) return null;
  const { from, to } = selection;

  if (selection instanceof NodeSelection) {
    return nodeAnchorData(state, selection.node, from, to);
  }

  const node = doc.nodeAt(from);
  if (node && from + node.nodeSize === to) {
    const nodeData = nodeAnchorData(state, node, from, to);
    if (nodeData) return nodeData;
  }

  return {
    from,
    to,
    anchorType: 'text',
    anchorText: doc.textBetween(from, to, ' '),
  };
}
