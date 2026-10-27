import { createChannel } from '../../shared/channel.js';

// In-process pub/sub for canvas-local UI events (undo, selection, editor view, ...).
// Panel/chat commands cross into da-nx via PANEL_EVENT/CHAT_EVENT DOM CustomEvents.
// Bridges relay cross-repo notifications onto canvas-local channels.

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
  comparisonRequest: createChannel(),
  commentComposeRequest: createChannel(),
  blockEditRequest: createChannel(),
  preflightRunRequest: createChannel(),
  toolbarSurfaceRequest: createChannel(),

  undoState: createChannel(),
  mergeConflictsState: createChannel(),
  editorDocState: createChannel(),
  editorViewState: createChannel({ replay: Boolean }),
  branchState: createChannel({ replay: Boolean }),
  blockEditState: createChannel({ replay: Boolean }),
  toolbarSurfaceState: createChannel({ replay: Boolean }),
  // Doc selection does not claim focus; an iframe selection does.
  toolbarSelectionState: createChannel(),
  editorHtmlState: createChannel({ replay: Boolean }),
  editorSelectState: {
    subscribe: editorSelectChannel.subscribe,
    emit: (detail) => editorSelectChannel.emit(enrichEditorSelect(detail)),
  },
  editorProseSelectState: createChannel(),
  toolPanelViewState: createChannel({ replay: Boolean }),
  comparisonState: createChannel(),

  // Replays because the split layout re-appends `ew-editor-doc` on every hash
  // sync, so a late resubscribe would otherwise miss an already-emitted port.
  wysiwygPortReady: createChannel({ replay: Boolean }),

  commentsControllerState: createChannel(),
  versionCreatedState: createChannel(),
  chatTurnCompleted: createChannel(),

  preflightStatusState: createChannel(),
});
