import { updateDocument, updateState, getEditor } from '../editor-utils/editor-utils.js';
import { getCommentsBridge, openCommentsPanel } from '../editor-utils/comments-bridge.js';
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

export function handleCommentShortcut() {
  getCommentsBridge().controller?.requestCompose();
  openCommentsPanel();
}

export function handleCommentMarkerClick({ threadId }) {
  if (!threadId) return;
  const { controller } = getCommentsBridge();
  controller?.setSelectedThread(threadId);
  controller?.scrollToThread(threadId);
  openCommentsPanel();
}

export function handleCommentMarkerClear() {
  getCommentsBridge().controller?.setSelectedThread(null);
}

export function createControllerOnMessage(ctx) {
  return function onMessage(e) {
    const { type, payload = {} } = e.data ?? {};

    if (MUTATING_MESSAGES.has(type) && !ctx.canWrite) return;

    if (type === MESSAGE_TYPES.CURSOR_MOVE) {
      handleCursorMove(payload, ctx);
    } else if (type === MESSAGE_TYPES.RELOAD) {
      updateDocument(ctx);
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
    } else if (type === MESSAGE_TYPES.COMMENT_MARKER_CLICK) {
      handleCommentMarkerClick(payload);
    } else if (type === MESSAGE_TYPES.COMMENT_MARKER_CLEAR) {
      handleCommentMarkerClear();
    } else if (type === MESSAGE_TYPES.COMMENT_SHORTCUT) {
      handleCommentShortcut();
    }
  };
}
