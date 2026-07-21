import { decodeAnchor } from '../../shared/comments/helpers/anchor.js';
import { getInitials } from '../../shared/comments/helpers/format-utils.js';
import { generateColorSet, colorSetForColor } from '../../shared/author-color.js';

// The thread's root author drives the bubble + highlight, mirroring the panel's
// thread cards. `color` is the author's identity color (avatar/bubble background,
// weight 400) — honouring a stored author.color when present — while `textColor`
// keeps initials legible on it and `highlightColor` (weight 700) tints the range.
// We resolve the set from the stored color first so text/strong stay on the SAME
// hue as the cursor/avatar (which use author.color), then fall back to email/id.
export function authorPresentation(author) {
  const user = author ?? {};
  const set = (user.color && colorSetForColor(user.color))
    || generateColorSet(user.email || user.id || '');
  return {
    color: user.color ?? set.bg,
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
    const present = authorPresentation(comment.author);
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
