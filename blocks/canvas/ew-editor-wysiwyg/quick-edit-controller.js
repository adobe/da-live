import { updateDocument, updateState, getEditor } from '../editor-utils/editor-utils.js';
import { handleImageReplace } from './utils/image.js';
import {
  handleCursorMove,
  handleUndoRedo,
  handleNewVersion,
  handleIframeSelectionChange,
  handleNodeSelect,
  handleStoredMarks,
} from './utils/handlers.js';
import { MESSAGE_TYPES } from '../utils/quick-edit-messages.js';

const MUTATING_MESSAGES = new Set(['node-update', 'image-replace', 'history']);

// The iframe's mini-editor sends RELOAD (no payload) whenever it can't find the DOM
// element for its cached cursorOffset — which a concurrent remote edit can trigger
// repeatedly in a row, since it shifts every data-prose-index downstream of it. Each
// RELOAD asks for the same thing (a fresh full-body SET_BODY), so bursts are coalesced
// into one refresh per window instead of an unbounded reload-per-message loop that
// pegs the main thread (observed: getInstrumentedHTML calls piling up to 5-6s each).
const RELOAD_DEBOUNCE_MS = 150;

function scheduleReload(ctx) {
  if (ctx.reloadTimer) {
    // eslint-disable-next-line no-console
    console.debug(`[collab-diag] RELOAD coalesced (already pending) at ${performance.now().toFixed(1)}`);
    return;
  }
  // eslint-disable-next-line no-console
  console.debug(`[collab-diag] RELOAD scheduled at ${performance.now().toFixed(1)}`);
  ctx.reloadTimer = setTimeout(() => {
    ctx.reloadTimer = null;
    // eslint-disable-next-line no-console
    console.debug(`[collab-diag] RELOAD firing updateDocument at ${performance.now().toFixed(1)}`);
    updateDocument(ctx);
  }, RELOAD_DEBOUNCE_MS);
}

export function createControllerOnMessage(ctx) {
  return function onMessage(e) {
    const { type, payload = {} } = e.data ?? {};

    if (MUTATING_MESSAGES.has(type) && !ctx.canWrite) return;

    if (type === MESSAGE_TYPES.CURSOR_MOVE) {
      handleCursorMove(payload, ctx);
    } else if (type === MESSAGE_TYPES.RELOAD) {
      scheduleReload(ctx);
    } else if (type === MESSAGE_TYPES.IMAGE_REPLACE) {
      handleImageReplace(payload, ctx);
    } else if (type === MESSAGE_TYPES.GET_EDITOR) {
      getEditor(payload, ctx);
    } else if (type === MESSAGE_TYPES.NODE_UPDATE) {
      updateState(payload, ctx);
    } else if (type === MESSAGE_TYPES.HISTORY) {
      handleUndoRedo(payload, ctx);
    } else if (type === MESSAGE_TYPES.NEW_VERSION) {
      handleNewVersion();
    } else if (type === MESSAGE_TYPES.SELECTION_CHANGE) {
      handleIframeSelectionChange(payload, ctx);
    } else if (type === MESSAGE_TYPES.NODE_SELECT) {
      handleNodeSelect(payload, ctx);
    } else if (type === MESSAGE_TYPES.STORED_MARKS) {
      handleStoredMarks(payload, ctx);
    }
  };
}
