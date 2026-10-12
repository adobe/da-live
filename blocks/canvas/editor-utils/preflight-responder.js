import { getNx } from '../../../scripts/utils.js';
import { canvasBus } from '../utils/canvas-bus.js';
import { initPreflightBridge } from './preflight-bridge.js';

// Always-on canvas seam that turns the "Preflight" side panel into the responder for
// the publish gate's `nx-preflight-run` request. It must outlive any single panel mount:
// the first publish fires the run while the panel is still closed, so this module (booted
// from canvas.js) opens the panel and parks the request until the panel picks it up.
let panelEventsPromise;
const panelEvents = () => {
  panelEventsPromise ??= import(`${getNx()}/utils/panel.js`);
  return panelEventsPromise;
};

let initialized = false;
let pendingRequest = null;

// Claim on mount or live delivery; an older run must not clear a newer parked request.
export function takePendingPreflightRequest(requestId) {
  if (requestId && pendingRequest?.requestId !== requestId) return null;
  const request = pendingRequest;
  pendingRequest = null;
  return request;
}

// Non-claiming read, so a container can decide what to mount before the panel claims it.
export function peekPendingPreflightRequest() {
  return pendingRequest;
}

async function openPreflightPanel() {
  const { PANEL_EVENT } = await panelEvents();
  document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, { detail: { section: 'tools', id: 'preflight' } }));
}

const handleRunRequest = (detail) => {
  const { paths, requestId } = detail || {};
  if (!requestId || !Array.isArray(paths) || paths.length !== 1) return;
  // Park it for a not-yet-mounted panel; an already-mounted panel handles its own
  // `preflightRunRequest` subscription and dedupes by requestId.
  pendingRequest = { path: paths[0], requestId };
  openPreflightPanel();
};

// Idempotent: the bridge + subscription are a persistent seam for the page lifetime.
export function initPreflightResponder() {
  if (initialized) return;
  initialized = true;
  initPreflightBridge();
  canvasBus.preflightRunRequest.subscribe(handleRunRequest);
}
