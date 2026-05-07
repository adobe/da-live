import { updateDocument } from '../editor-utils/document.js';
import { updateState, getEditor } from '../editor-utils/state.js';
import { hideSelectionToolbar } from '../editor-utils/selection-toolbar.js';
import { handleImageReplace } from './utils/image.js';
import {
  handleCursorMove,
  handleUndoRedo,
  handleIframeSelectionChange,
} from './utils/handlers.js';

export function createControllerOnMessage(ctx) {
  return function onMessage(e) {
    if (e.data.type === 'cursor-move') {
      hideSelectionToolbar();
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
    }
  };
}
