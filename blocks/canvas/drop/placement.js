import { getNx2 } from '../../../scripts/utils.js';
import { PAYLOAD_KIND } from './payload.js';

const { getImageDocumentVersion, resolveImagePosition } = await import(
  `${getNx2()}/public/utils/quick-edit-images.js`
);

/**
 * A DropTarget is where a payload lands, independent of how it got there:
 *   { editor: 'doc', pos, doc, coords? }
 *   { editor: 'wysiwyg', type: 'boundary', anchor, side, documentVersion }  (html only)
 *   { editor: 'wysiwyg', type: 'image', proseIndex, imageVersion, ... }    (files/assets only)
 *
 * A placement is the target resolved against the live editor:
 *   { type: 'insert', pos, doc, coords? } | { type: 'replace', node }
 */

function boundaryPosition({ doc, anchor, side }) {
  if (!['before', 'after'].includes(side)) return null;
  if (anchor?.kind === 'main') return anchor.index === 0 && side === 'before' ? 0 : null;
  if (!['block', 'text', 'image'].includes(anchor?.kind) || !Number.isSafeInteger(anchor.index)) {
    return null;
  }
  const position = anchor.index - (anchor.kind === 'image' ? 0 : 1);
  if (position < 0 || position >= doc.content.size) return null;
  const node = doc.nodeAt(position);
  if (!node || (anchor.kind === 'block' && node.type.name !== 'table')
    || (anchor.kind === 'image' && node.type.name !== 'image')) return null;
  let boundary = null;
  doc.forEach((child, offset) => {
    if (position >= offset && position < offset + child.nodeSize) {
      boundary = side === 'before' ? offset : offset + child.nodeSize;
    }
  });
  return boundary;
}

export function resolvePlacement({ view, target, payload }) {
  const { doc } = view.state;
  if (target?.editor === 'doc') {
    if (!Number.isSafeInteger(target.pos) || target.pos < 0) return { error: 'invalid-target' };
    return { type: 'insert', pos: target.pos, doc: target.doc ?? doc, coords: target.coords };
  }
  if (target?.editor !== 'wysiwyg') return { error: 'invalid-target' };

  if (target.type === 'boundary') {
    if (payload.kind !== PAYLOAD_KIND.HTML) return { error: 'unsupported' };
    if (target.documentVersion !== getImageDocumentVersion(doc)) return { error: 'stale-target' };
    const pos = boundaryPosition({ doc, anchor: target.anchor, side: target.side });
    return pos === null ? { error: 'invalid-target' } : { type: 'insert', pos, doc };
  }

  if (target.type === 'image') {
    if (payload.kind === PAYLOAD_KIND.HTML) return { error: 'unsupported' };
    const count = (payload.files ?? payload.assets).length;
    if (count !== 1) return { error: 'single-image-required' };
    try {
      const node = doc.nodeAt(resolveImagePosition({ ...target, doc }));
      return { type: 'replace', node };
    } catch {
      return { error: 'stale-target' };
    }
  }
  return { error: 'invalid-target' };
}

/** The insert position in the current doc, re-derived from coordinates if the doc changed. */
export function currentInsertPosition(view, placement) {
  if (view.state.doc === placement.doc) return placement.pos;
  if (!placement.coords) return null;
  return view.posAtCoords(placement.coords)?.pos ?? null;
}
