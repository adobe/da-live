// a right-margin gutter of colored initials bubbles for
// doc-mode comments, aligned vertically to each comment's anchor. This is a UX
// exploration for showing "who commented where" without covering the text. It
// lives in one self-contained module so it can be deleted wholesale if we keep
// the plain always-on highlights instead.

import { decodeAnchor } from '../../../shared/comments/helpers/anchor.js';
import { authorPresentation } from '../../ew-comments/iframe-bridge.js';

const GUTTER_CLASS = 'ew-comment-gutter';

// Same-line markers are fanned out horizontally, each shifted STEP px left of the
// previous and overlapping like a stack of avatars. TOLERANCE groups markers
// whose tops are within a fraction of a line (same line ≈ 0px apart; separate
// lines are a full line-height apart, well above this).
const OVERLAP_STEP_PX = 22;
const SAME_LINE_TOLERANCE_PX = 12;

// Groups markers (sorted by `top`) whose tops fall within `tolerance` of the
// group's first marker, so same-line markers can be fanned out together.
export function groupMarkersByLine(markers, tolerance = SAME_LINE_TOLERANCE_PX) {
  const sorted = [...markers].sort((a, b) => a.top - b.top);
  const lines = [];
  for (const marker of sorted) {
    const line = lines.at(-1);
    if (line && Math.abs(marker.top - line[0].top) < tolerance) {
      line.push(marker);
    } else {
      lines.push([marker]);
    }
  }
  return lines;
}

function ensureGutter(container) {
  let el = container.querySelector(`.${GUTTER_CLASS}`);
  if (!el) {
    el = document.createElement('div');
    el.className = GUTTER_CLASS;
    el.setAttribute('aria-hidden', 'true');
    container.appendChild(el);
  }
  return el;
}

export function createCommentGutter({ getView, getContainer, controller }) {
  if (!controller?.subscribe) return () => {};

  let raf = 0;
  const isVisible = () => controller.panelOpen || controller.showHighlights;

  const render = () => {
    raf = 0;
    const view = getView?.();
    const container = getContainer?.();
    if (!view || view.isDestroyed || !container) return;
    const gutter = ensureGutter(container);
    gutter.textContent = '';
    if (!isVisible()) return;
    const ids = controller.getAttachedThreadIds?.();
    if (!ids?.size) return;
    const base = container.getBoundingClientRect();

    const markers = [];
    ids.forEach((id) => {
      const comment = controller.getComment(id);
      if (!comment) return;
      const range = decodeAnchor({ anchor: comment, state: view.state });
      if (!range) return;
      let coords;
      try {
        coords = view.coordsAtPos(range.from);
      } catch {
        return;
      }
      markers.push({ id, comment, top: (coords.top - base.top) + container.scrollTop });
    });

    // Group markers sharing a line so they can be fanned out side by side.
    for (const line of groupMarkersByLine(markers)) {
      line.forEach((marker, i) => {
        const { id, comment, top } = marker;
        const { color, textColor, initials } = authorPresentation(comment.author);
        const bubble = document.createElement('button');
        bubble.type = 'button';
        const active = id === controller.selectedThreadId;
        bubble.className = `ew-comment-gutter-bubble${active ? ' is-active' : ''}`;
        bubble.textContent = initials;
        bubble.dataset.commentThread = id;
        bubble.style.setProperty('--ew-comment-author-color', color);
        if (textColor) bubble.style.color = textColor;
        bubble.style.top = `${top}px`;
        // Fan leftward; first marker sits rightmost and on top, the active one
        // always wins the stacking order.
        bubble.style.right = `${i * OVERLAP_STEP_PX}px`;
        bubble.style.zIndex = active ? line.length + 1 : line.length - i;
        bubble.addEventListener('click', (e) => {
          e.preventDefault();
          controller.setSelectedThread(id);
        });
        gutter.appendChild(bubble);
      });
    }
  };

  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(render);
  };

  const RERENDER_REASONS = new Set([
    'init', 'counts', 'docChange', 'panelOpen', 'showHighlights', 'selectedThreadId',
  ]);
  const off = controller.subscribe(({ reason }) => {
    if (RERENDER_REASONS.has(reason)) schedule();
  });

  const container = getContainer?.();
  // ResizeObserver (rather than a window `resize` listener) also catches the
  // container going from display:none to visible on layout<->doc mode switches,
  // which is when stale coords computed while hidden need to be recomputed.
  const resizeObserver = new ResizeObserver(schedule);
  if (container) resizeObserver.observe(container);
  container?.addEventListener('scroll', schedule, { passive: true });

  return () => {
    off?.();
    if (raf) cancelAnimationFrame(raf);
    resizeObserver.disconnect();
    container?.removeEventListener('scroll', schedule);
    getContainer?.()?.querySelector(`.${GUTTER_CLASS}`)?.remove();
  };
}
