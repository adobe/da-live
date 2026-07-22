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

export function createControllerOnMessage(ctx) {
  return function onMessage(e) {
    // @deprecated flat fields alongside `type` — prefer nesting under `payload`.
    // Normalize once here so handlers can keep reading flat fields regardless of
    // which shape the quick-edit iframe script (da-nx) sends.
    // todo: cleanup once nx side is updated
    const data = e.data?.payload ? { ...e.data, ...e.data.payload } : e.data;

    if (data.type === MESSAGE_TYPES.CURSOR_MOVE) {
      handleCursorMove(data, ctx);
    } else if (data.type === MESSAGE_TYPES.RELOAD) {
      updateDocument(ctx);
    } else if (data.type === MESSAGE_TYPES.IMAGE_REPLACE) {
      handleImageReplace(data, ctx);
    } else if (data.type === MESSAGE_TYPES.GET_EDITOR) {
      getEditor(data, ctx);
    } else if (data.type === MESSAGE_TYPES.NODE_UPDATE) {
      updateState(data, ctx);
    } else if (data.type === MESSAGE_TYPES.HISTORY) {
      handleUndoRedo(data, ctx);
    } else if (data.type === MESSAGE_TYPES.NEW_VERSION) {
      handleNewVersion();
    } else if (data.type === MESSAGE_TYPES.SELECTION_CHANGE) {
      handleIframeSelectionChange(data, ctx);
    } else if (data.type === MESSAGE_TYPES.NODE_SELECT) {
      handleNodeSelect(data, ctx);
    } else if (data.type === MESSAGE_TYPES.STORED_MARKS) {
      handleStoredMarks(data, ctx);
    }
  };
}
