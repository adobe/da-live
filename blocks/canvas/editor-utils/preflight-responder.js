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

// Claim-and-clear: the panel takes the parked request exactly once on mount, so a later
// reconnect can never replay a stale run.
export function takePendingPreflightRequest() {
  const request = pendingRequest;
  pendingRequest = null;
  return request;
}

async function openPreflightPanel() {
  const { PANEL_EVENT } = await panelEvents();
  document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, { detail: { section: 'tools', id: 'governance' } }));
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
