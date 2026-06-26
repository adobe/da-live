import { getNx2 } from '../../../scripts/utils.js';

const bridge = { controller: null };

export const VARIANT_ERROR = 'error';

let toastModulePromise;

function loadToastModule() {
  toastModulePromise ??= import(`${getNx2()}/blocks/shared/toast/toast.js`);
  return toastModulePromise;
}

function formatToastMessage(text, description) {
  const title = text?.trim();
  if (!title) return '';
  const body = description?.trim();
  return body ? `${title}\n${body}` : title;
}

export function showCommentsToast({ text, description, variant } = {}) {
  const message = formatToastMessage(text, description);
  if (!message) return;
  loadToastModule().then(({ showToast, VARIANT_ERROR: NX_ERROR }) => {
    showToast({
      text: message,
      variant: variant === VARIANT_ERROR ? NX_ERROR : undefined,
    });
  });
}

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
