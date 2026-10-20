import { getNx } from '../../../scripts/utils.js';
import { canvasBus } from '../utils/canvas-bus.js';

let panelEventsPromise;
const panelEvents = () => {
  panelEventsPromise ??= import(`${getNx()}/utils/panel.js`);
  return panelEventsPromise;
};

const bridge = { controller: null };

export function getCommentsBridge() {
  return bridge;
}

export function setCommentsController(controller) {
  bridge.controller = controller ?? null;
  canvasBus.commentsControllerState.emit(bridge.controller);
}

export function formatCommentsViewLabel(activeCount) {
  const count = Number(activeCount) || 0;
  return count > 0 ? `Comments (${count})` : 'Comments';
}

export async function openCommentsPanel() {
  const { PANEL_EVENT } = await panelEvents();
  document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, { detail: { section: 'tools', id: 'comments' } }));
}

export async function closeCommentsPanel() {
  const { PANEL_EVENT } = await panelEvents();
  const aside = document.querySelector('aside.panel[data-position="after"]');
  aside?.dispatchEvent(new CustomEvent(PANEL_EVENT.CLOSE, { bubbles: true, composed: true }));
}

export function getCommentsVisible() {
  const { controller } = bridge;
  return Boolean(controller?.panelOpen);
}

export function toggleComments() {
  const { controller } = bridge;
  if (!controller) return;
  if (controller.panelOpen) {
    controller.closePanel();
    closeCommentsPanel();
  } else {
    openCommentsPanel();
  }
}
