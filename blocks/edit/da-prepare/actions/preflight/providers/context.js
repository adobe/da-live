import { canvasBus } from '../../../../../canvas/utils/canvas-bus.js';

// ew-editor-wysiwyg registers the instant canvas's module graph loads, well before any
// instance mounts -- a synchronous "could a canvas host exist" check, independent of
// whether it's announced ready yet.
function canvasHostMayExist() {
  return !!customElements.get('ew-editor-wysiwyg');
}

// A host mounting in canvas can race a provider run starting the instant a lazily-created
// panel connects. validationHostReady replays its last value, so this resolves immediately
// once announced; the grace timeout only matters while genuinely racing it.
const HOST_READY_GRACE_MS = 3000;

function waitForCanvasReady(signal) {
  return new Promise((resolve) => {
    let settled = false;
    let timer;
    let unsubscribe;
    const finish = (ready) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe?.();
      resolve(ready);
    };
    // A replayed value can call finish() synchronously, before this assignment runs --
    // finish() no-ops on unsubscribe then, so clean up here once it's available.
    unsubscribe = canvasBus.validationHostReady.subscribe((ready) => finish(!!ready));
    if (settled) {
      unsubscribe();
      return;
    }
    timer = setTimeout(() => finish(false), HOST_READY_GRACE_MS);
    signal?.addEventListener('abort', () => finish(false), { once: true });
  });
}

// editorHtmlState replays its last value, so a synchronous subscribe+unsubscribe reads it
// without holding a live subscription. Returns undefined both when canvas never emitted
// and when it last emitted '' (doc torn down) -- either way there's nothing usable yet.
function getCurrentCanvasHtml() {
  let html;
  const unsubscribe = canvasBus.editorHtmlState.subscribe((value) => { html = value; });
  unsubscribe();
  return html;
}

// Merges execution-environment fields onto a run's details: `isCanvas` (sync) and
// `canvasReady` (Promise<boolean>, resolves once the WYSIWYG host announces ready, or the
// grace window / signal aborts) -- built fresh per run since canvasReady is tied to that
// run's own AbortSignal. `getCanvasHtml` reads the live instrumented HTML on demand.
export function buildPreflightContext({ details, signal }) {
  const isCanvas = canvasHostMayExist();
  return {
    ...details,
    isCanvas,
    canvasReady: isCanvas ? waitForCanvasReady(signal) : Promise.resolve(false),
    getCanvasHtml: getCurrentCanvasHtml,
  };
}
