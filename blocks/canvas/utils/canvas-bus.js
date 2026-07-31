const target = new EventTarget();

const CANVAS_EVENT = {
  EDITOR_VIEW_STATE: 'canvas:editor-view-state',
  UNDO_REQUEST: 'canvas:undo-request',
  REDO_REQUEST: 'canvas:redo-request',
  EDITOR_VIEW_REQUEST: 'canvas:editor-view-request',
  UNDO_STATE: 'canvas:undo-state',
  NEW_VERSION_REQUEST: 'canvas:new-version-request',
  WYSIWYG_PORT_READY: 'canvas:wysiwyg-port-ready',
  EDITOR_HTML_STATE: 'canvas:editor-html-state',
  EDITOR_SELECT_STATE: 'canvas:editor-select-state',
  EDITOR_PROSE_SELECT_STATE: 'canvas:editor-prose-select-state',
};

// Shared channel factory: one EventTarget backs every canvas-local, in-process
// event instead of each call site picking its own dispatch target (mountRoot,
// header element, document, a sibling...). `replay: true` re-delivers the last
// truthy emitted value to a subscriber that joins later.
function createChannel(type, { replay = false } = {}) {
  let lastValue;
  return {
    emit(detail) {
      lastValue = detail;
      target.dispatchEvent(new CustomEvent(type, { detail }));
    },
    subscribe(fn) {
      const handler = (e) => fn(e.detail);
      target.addEventListener(type, handler);
      if (replay && lastValue) fn(lastValue);
      return () => target.removeEventListener(type, handler);
    },
  };
}

// Single namespaced entry point, and the only place `createChannel` is called:
// `canvasBus.<name>.emit()` / `.subscribe()` is autocomplete-discoverable, and every
// canvas-local event that exists is listed right here. Naming convention: `*Request` is
// a command asking something to happen (emitted by the UI that wants the action);
// `*State`/`*Ready` is a broadcast of something that already happened (emitted by
// whatever resolved/owns that state).
export const canvasBus = Object.freeze({
  editorViewRequest: createChannel(CANVAS_EVENT.EDITOR_VIEW_REQUEST),
  undoRequest: createChannel(CANVAS_EVENT.UNDO_REQUEST),
  redoRequest: createChannel(CANVAS_EVENT.REDO_REQUEST),
  newVersionRequest: createChannel(CANVAS_EVENT.NEW_VERSION_REQUEST),

  undoState: createChannel(CANVAS_EVENT.UNDO_STATE),
  editorViewState: createChannel(CANVAS_EVENT.EDITOR_VIEW_STATE),
  editorHtmlState: createChannel(CANVAS_EVENT.EDITOR_HTML_STATE, { replay: true }),
  editorSelectState: createChannel(CANVAS_EVENT.EDITOR_SELECT_STATE),
  editorProseSelectState: createChannel(CANVAS_EVENT.EDITOR_PROSE_SELECT_STATE),

  wysiwygPortReady: createChannel(CANVAS_EVENT.WYSIWYG_PORT_READY),
});
