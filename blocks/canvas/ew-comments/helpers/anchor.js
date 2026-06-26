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

function decodeRelPos(encoded) {
  if (!Array.isArray(encoded) || encoded.length === 0) return null;
  return Y.decodeRelativePosition(Uint8Array.from(encoded));
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
  };
}

export function decodeAnchor({ anchor, state }) {
  if (!anchor?.anchorFrom || !anchor?.anchorTo) return null;
  const binding = ySyncPluginKey.getState(state)?.binding;
  if (!binding) return null;
  const relFrom = decodeRelPos(anchor.anchorFrom);
  const relTo = decodeRelPos(anchor.anchorTo);
  if (!relFrom || !relTo) return null;
  const { doc: yDoc, type, mapping } = binding;

  try {
    const from = relativePositionToAbsolutePosition(yDoc, type, relFrom, mapping);
    const to = relativePositionToAbsolutePosition(yDoc, type, relTo, mapping);
    if (from == null || to == null || from >= to) return null;
    return { from, to };
  } catch {
    return null;
  }
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
