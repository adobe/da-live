// Test fixture mirroring da-nx's nx/public/plugins/quick-edit/src/message-types.js.
export const MessageTypes = Object.freeze({
  INIT: 'init',
  READY: 'ready',

  SET_BODY: 'set-body',
  SET_EDITOR_STATE: 'set-editor-state',
  SET_CURSORS: 'set-cursors',

  CURSOR_MOVE: 'cursor-move',
  RELOAD: 'reload',
  GET_EDITOR: 'get-editor',
  NODE_UPDATE: 'node-update',
  HISTORY: 'history',
  NEW_VERSION: 'new-version',
  SELECTION_CHANGE: 'selection-change',
  STORED_MARKS: 'stored-marks',
  PREVIEW: 'preview',

  IMAGE_REPLACE: 'image-replace',

  UPDATE_IMAGE_SRC: 'update-image-src',
  IMAGE_ERROR: 'image-error',
});
