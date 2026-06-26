import { decodeAnchor } from '../../shared/comments/helpers/anchor.js';

function imageSrcAtAnchor(view, from) {
  if (!view?.state?.doc) return '';
  const { doc } = view.state;
  let src = '';
  doc.nodesBetween(from, Math.min(from + 2, doc.content.size), (node) => {
    if (node.type?.name === 'image') {
      src = node.attrs?.src ?? '';
      return false;
    }
    return true;
  });
  return src;
}

export function commentMarkers(view, controller) {
  if (!view || !controller?.getAttachedThreadIds) return [];
  const ids = controller.getAttachedThreadIds();
  if (!ids) return [];
  const markers = [];
  ids.forEach((threadId) => {
    const comment = controller.getComment(threadId);
    if (!comment) return;
    const range = decodeAnchor({ anchor: comment, state: view.state });
    if (!range) return;
    const marker = {
      threadId,
      anchorType: comment.anchorType,
      from: range.from,
      to: range.to,
      anchorText: comment.anchorText ?? '',
    };
    if (comment.anchorType === 'image') {
      marker.imageSrc = imageSrcAtAnchor(view, range.from);
    }
    markers.push(marker);
  });
  return markers;
}

export function postCommentMarkers(port, markers, controller) {
  port?.postMessage({
    type: 'set-comment-markers',
    markers,
    selectedThreadId: controller?.selectedThreadId ?? null,
  });
}

export function postScrollToComment(port, view, controller) {
  if (!port || !view || !controller) return;
  const threadId = controller.selectedThreadId;
  if (!threadId) return;
  const comment = controller.getComment(threadId);
  const range = comment ? decodeAnchor({ anchor: comment, state: view.state }) : null;
  if (range) port.postMessage({ type: 'scroll-to-pos', proseIndex: range.from });
}
