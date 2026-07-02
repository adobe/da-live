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
