// In-process pub/sub for canvas-local UI events (undo, selection, editor view, ...).
// Not for panel or chat — those cross into da-nx and use its PANEL_EVENT/CHAT_EVENT
// DOM CustomEvents instead, since components outside this block need to reach them too.

// Each channel is a private listener Set — no DOM element involved. `replay: true`
// re-delivers the last truthy emitted value to a subscriber that joins later.
function createChannel({ replay = false } = {}) {
  const listeners = new Set();
  let lastValue;
  return {
    emit(detail) {
      lastValue = detail;
      listeners.forEach((fn) => fn(detail));
    },
    subscribe(fn) {
      listeners.add(fn);
      if (replay && lastValue) fn(lastValue);
      return () => listeners.delete(fn);
    },
  };
}

// editor-utils.js owns selection enrichment (blockName/proseIndex/innerText lookup) and
// registers it here — importing it directly would cycle back through this file.
let enrichEditorSelect = (detail) => detail;
let enricherRegistered = false;
export function registerEditorSelectEnricher(fn) {
  if (enricherRegistered) {
    throw new Error('registerEditorSelectEnricher already called — extend the existing enricher instead of registering a second one.');
  }
  enricherRegistered = true;
  enrichEditorSelect = fn;
}
const editorSelectChannel = createChannel();

// Naming: `*Request` is a command (emitted by the UI that wants the action to happen);
// `*State`/`*Ready` is a broadcast of something that already happened.
export const canvasBus = Object.freeze({
  editorViewRequest: createChannel(),
  undoRequest: createChannel(),
  redoRequest: createChannel(),
  newVersionRequest: createChannel(),

  undoState: createChannel(),
  editorViewState: createChannel(),
  editorHtmlState: createChannel({ replay: true }),
  editorSelectState: {
    subscribe: editorSelectChannel.subscribe,
    emit: (detail) => editorSelectChannel.emit(enrichEditorSelect(detail)),
  },
  editorProseSelectState: createChannel(),

  wysiwygPortReady: createChannel(),
});
