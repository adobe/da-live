import { getNx1 } from '../../../scripts/utils.js';
import { updateDocument, updateState, getEditor } from '../editor-utils/editor-utils.js';
import { handleImageReplace } from './utils/image.js';
import {
  handleCursorMove,
  handleUndoRedo,
  handleNewVersion,
  handleIframeSelectionChange,
} from './utils/handlers.js';

const { MessageTypes } = await import(`${getNx1()}/public/plugins/quick-edit/src/message-types.js`);

export function createControllerOnMessage(ctx) {
  return function onMessage(e) {
    // @deprecated flat fields alongside `type` — prefer nesting under `payload`.
    // Normalize once here so handlers can keep reading flat fields regardless of
    // which shape the quick-edit iframe script (da-nx) sends.
    // todo: cleanup once nx side is updated
    const data = e.data?.payload ? { ...e.data, ...e.data.payload } : e.data;

    if (data.type === MessageTypes.CURSOR_MOVE) {
      handleCursorMove(data, ctx);
    } else if (data.type === MessageTypes.RELOAD) {
      updateDocument(ctx);
    } else if (data.type === MessageTypes.IMAGE_REPLACE) {
      handleImageReplace(data, ctx);
    } else if (data.type === MessageTypes.GET_EDITOR) {
      getEditor(data, ctx);
    } else if (data.type === MessageTypes.NODE_UPDATE) {
      updateState(data, ctx);
    } else if (data.type === MessageTypes.HISTORY) {
      handleUndoRedo(data, ctx);
    } else if (data.type === MessageTypes.NEW_VERSION) {
      handleNewVersion();
    } else if (data.type === MessageTypes.SELECTION_CHANGE) {
      handleIframeSelectionChange(data, ctx);
    }
  };
}
