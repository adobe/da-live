import { updateDocument, updateState, getEditor } from '../editor-utils/editor-utils.js';
import { getCommentsBridge, openCommentsPanel } from '../editor-utils/comments-bridge.js';
import { handleImageReplace } from './utils/image.js';
import {
  handleCursorMove,
  handleUndoRedo,
  handleIframeSelectionChange,
} from './utils/handlers.js';

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
    if (e.data.type === 'cursor-move') {
      handleCursorMove(e.data, ctx);
    } else if (e.data.type === 'reload') {
      updateDocument(ctx);
    } else if (e.data.type === 'image-replace') {
      handleImageReplace(e.data, ctx);
    } else if (e.data.type === 'get-editor') {
      getEditor(e.data, ctx);
    } else if (e.data.type === 'node-update') {
      updateState(e.data, ctx);
    } else if (e.data.type === 'history') {
      handleUndoRedo(e.data, ctx);
    } else if (e.data.type === 'selection-change') {
      handleIframeSelectionChange(e.data, ctx);
    } else if (e.data.type === 'comment-marker-click') {
      handleCommentMarkerClick(e.data);
    } else if (e.data.type === 'comment-marker-clear') {
      handleCommentMarkerClear();
    } else if (e.data.type === 'comment-shortcut') {
      handleCommentShortcut();
    }
  };
}
