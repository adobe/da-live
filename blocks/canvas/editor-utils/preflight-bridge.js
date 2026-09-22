import { getNx2 } from '../../../scripts/utils.js';
import { canvasBus } from '../utils/canvas-bus.js';

// Single seam between the canvas-internal `canvasBus` and da-nx's document-level
// Preflight↔Publish contract (`nx-preflight-run` / `nx-preflight-status`). Canvas
// components (e.g. prepare-menu) talk only to `canvasBus`; this file is the one place
// that translates to/from the cross-repo DOM CustomEvents — mirroring comments-bridge.js.
const { PREFLIGHT_EVENT } = await import(`${getNx2()}/utils/preflight-events.js`);

let initialized = false;

// Idempotent: the document listeners are a persistent seam for the page lifetime, so
// re-mounting a canvas component (which calls this on connect) never double-wires them.
export function initPreflightBridge() {
  if (initialized) return;
  initialized = true;
  document.addEventListener(
    PREFLIGHT_EVENT.RUN,
    (e) => canvasBus.preflightRunRequest.emit(e.detail),
  );
  document.addEventListener(
    PREFLIGHT_EVENT.STATUS,
    (e) => canvasBus.preflightStatusState.emit(e.detail),
  );
}

// Outbound: let canvas report a Preflight verdict back on the da-nx document contract
// (e.g. a `cancelled` status when the user closes the dialog before checks settle).
export function reportPreflightStatus(detail) {
  document.dispatchEvent(new CustomEvent(PREFLIGHT_EVENT.STATUS, { detail }));
}
