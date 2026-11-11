import { canvasBus } from '../utils/canvas-bus.js';
import { MESSAGE_TYPES } from '../utils/quick-edit-messages.js';

const RESOLVE_TIMEOUT = 2500;
const BUSY_RETRY = 100;

let preview;
canvasBus.wysiwygPortReady.subscribe((value) => { preview = value; });

function deepElementFromPoint({ x, y }) {
  let element = document.elementFromPoint(x, y);
  while (element?.shadowRoot) {
    const child = element.shadowRoot.elementFromPoint(x, y);
    if (!child || child === element) break;
    element = child;
  }
  return element;
}

// Host viewport -> preview document coordinates (the preview may be scaled and bordered).
function previewPoint(iframe, { x, y }) {
  const rect = iframe.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: ((x - rect.left) * iframe.offsetWidth) / rect.width - iframe.clientLeft,
    y: ((y - rect.top) * iframe.offsetHeight) / rect.height - iframe.clientTop,
  };
}

function postPreview(message) {
  try {
    preview?.port?.postMessage(message);
    return true;
  } catch {
    return false;
  }
}

/**
 * Locates what is under a host viewport point:
 *   { editor: 'doc', pos, coords } | { editor: 'wysiwyg', point } | null
 */
function locate({ point, view, overlay }) {
  const pointerEvents = overlay?.style.pointerEvents;
  if (overlay) overlay.style.pointerEvents = 'none';
  try {
    const element = deepElementFromPoint(point);
    if (!element) return null;
    if (view && !view.isDestroyed && view.dom.contains(element)) {
      const coords = { left: point.x, top: point.y };
      // ProseMirror also hit-tests the DOM; keep the overlay out of its way.
      const pos = view.posAtCoords(coords)?.pos;
      return Number.isSafeInteger(pos) ? { editor: 'doc', pos, coords } : null;
    }
    if (preview?.port && preview.iframe?.isConnected && element === preview.iframe) {
      const inner = previewPoint(preview.iframe, point);
      return inner ? { editor: 'wysiwyg', point: inner } : null;
    }
    return null;
  } finally {
    if (overlay) overlay.style.pointerEvents = pointerEvents;
  }
}

function queryPreview({ point, kind }) {
  const { port } = preview;
  const deadline = Date.now() + RESOLVE_TIMEOUT;
  return new Promise((resolve) => {
    let requestId;
    let timer;
    let onMessage;
    const done = (value) => {
      clearTimeout(timer);
      port.removeEventListener('message', onMessage);
      resolve(value);
    };
    const send = () => {
      requestId = crypto.randomUUID();
      const payload = { phase: 'resolve', requestId, kind, ...point };
      if (!postPreview({ type: MESSAGE_TYPES.DROP_TARGET, payload })) done(null);
    };
    onMessage = ({ data }) => {
      if (data?.type !== MESSAGE_TYPES.DROP_TARGET || data.payload?.requestId !== requestId) return;
      if (data.payload.reason === 'busy' && Date.now() < deadline) {
        setTimeout(send, BUSY_RETRY);
        return;
      }
      done(data.payload);
    };
    timer = setTimeout(() => done(null), RESOLVE_TIMEOUT);
    port.addEventListener('message', onMessage);
    port.start();
    send();
  });
}

export function createTargetIndicator() {
  let caret;
  let previewHovered = false;

  const clear = () => {
    caret?.remove();
    caret = undefined;
    if (previewHovered) postPreview({ type: MESSAGE_TYPES.DROP_TARGET, payload: { phase: 'leave' } });
    previewHovered = false;
  };

  const showCaret = (view, pos) => {
    const rect = view.coordsAtPos(pos);
    if (!caret) {
      caret = document.createElement('div');
      caret.setAttribute('aria-hidden', 'true');
    }
    Object.assign(caret.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2147483647',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      height: `${rect.bottom - rect.top}px`,
      borderLeft: '2px solid var(--s2-blue-800, Highlight)',
    });
    if (!caret.isConnected) document.body.append(caret);
  };

  /** Shows where a payload of `kind` ('html' | 'image') would land. */
  const hover = ({ point, kind, view, overlay }) => {
    const hit = point && locate({ point, view, overlay });
    if (hit?.editor === 'doc') {
      if (previewHovered) clear();
      showCaret(view, hit.pos);
      return;
    }
    caret?.remove();
    caret = undefined;
    if (hit?.editor === 'wysiwyg') {
      previewHovered = postPreview({
        type: MESSAGE_TYPES.DROP_TARGET,
        payload: { phase: 'hover', kind, ...hit.point },
      });
      return;
    }
    clear();
  };

  return { hover, clear };
}

/** Resolves a host viewport point to a DropTarget (see placement.js), or null. */
export async function resolveTarget({ point, kind, view, overlay }) {
  const hit = point && locate({ point, view, overlay });
  if (hit?.editor === 'doc') return { ...hit, doc: view.state.doc };
  if (hit?.editor !== 'wysiwyg') return null;
  const reply = await queryPreview({ point: hit.point, kind });
  if (!reply?.target) return null;
  return {
    editor: 'wysiwyg',
    type: kind === 'html' ? 'boundary' : 'image',
    documentVersion: reply.documentVersion,
    ...reply.target,
  };
}
