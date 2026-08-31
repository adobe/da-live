import { decodeAnchor } from '../comments/helpers/anchor.js';
import { getInitials } from '../comments/helpers/format-utils.js';
import { generateColorSet } from '../editor-utils/author-color.js';
import { MESSAGE_TYPES } from '../utils/quick-edit-messages.js';

export function authorPresentation(author, colorSet) {
  const user = author ?? {};
  const set = colorSet ?? generateColorSet(user.email || user.id || '');
  return {
    color: set.bg,
    textColor: set.text,
    highlightColor: set.strong,
    initials: getInitials(user.name),
    authorName: user.name ?? '',
  };
}

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
    const present = authorPresentation(comment.author, controller.authorColorSet?.(comment.author));
    const marker = {
      threadId,
      anchorType: comment.anchorType,
      from: range.from,
      to: range.to,
      anchorText: comment.anchorText ?? '',
      color: present.color,
      textColor: present.textColor,
      highlightColor: present.highlightColor,
      initials: present.initials,
      authorName: present.authorName,
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
    type: MESSAGE_TYPES.SET_COMMENT_MARKERS,
    payload: { markers, selectedThreadId: controller?.selectedThreadId ?? null },
  });
}

export function postScrollToComment(port, view, controller) {
  if (!port || !view || !controller) return;
  const threadId = controller.selectedThreadId;
  if (!threadId) return;
  const comment = controller.getComment(threadId);
  const range = comment ? decodeAnchor({ anchor: comment, state: view.state }) : null;
  if (range) {
    port.postMessage({ type: MESSAGE_TYPES.SCROLL_TO_POS, payload: { proseIndex: range.from } });
  }
}
