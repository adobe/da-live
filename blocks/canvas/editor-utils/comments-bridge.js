const bridge = { controller: null };

export function getCommentsBridge() {
  return bridge;
}

export function setCommentsController(controller) {
  bridge.controller = controller ?? null;
  document.dispatchEvent(new CustomEvent('nx-comments-controller-change', {
    bubbles: true,
    composed: true,
    detail: { controller: bridge.controller },
  }));
}

export function formatCommentsViewLabel(activeCount) {
  const count = Number(activeCount) || 0;
  return count > 0 ? `Comments (${count})` : 'Comments';
}

export function openCommentsPanel() {
  document.querySelector('ew-canvas-header')?.dispatchEvent(new CustomEvent('nx-canvas-open-panel', {
    bubbles: true,
    composed: true,
    detail: { position: 'after', panelName: 'comments' },
  }));
}

// Close the right rail hosting the comments panel. panelOpen is derived from the
// panel's on-screen visibility (see bindPanelOpenToVisibility), so hiding the
// rail is what actually turns it off — the same nx-panel-close the panel's own
// close control fires.
export function closeCommentsPanel() {
  const aside = document.querySelector('aside.panel[data-position="after"]');
  aside?.dispatchEvent(new CustomEvent('nx-panel-close', { bubbles: true, composed: true }));
}

// Comments are "visible" when the panel is open OR inline highlights are on.
export function getCommentsVisible() {
  const { controller } = bridge;
  return Boolean(controller && (controller.panelOpen || controller.showHighlights));
}

// The header button is a shortcut to the comments panel: toggling on opens the
// rail (which shows highlights via panelOpen), toggling off closes it. Highlights
// then track panel visibility, so closing via the rail's own control is consistent.
export function toggleComments() {
  const { controller } = bridge;
  if (!controller) return;
  if (controller.panelOpen || controller.showHighlights) {
    if (controller.panelOpen) controller.closePanel();
    closeCommentsPanel();
    controller.setShowHighlights?.(false);
  } else {
    openCommentsPanel();
  }
}
