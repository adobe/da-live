import { canvasBus } from '../utils/canvas-bus.js';

// Stable wire names from Nexter's branch-events.js. Keep startup independent of
// that new module so this host also works with older or pinned Nexter releases.
const BRANCH_EVENT = Object.freeze({
  REQUEST: 'nx-branch-request',
  STATE: 'nx-branch-state',
});

let initialized = false;

// Like preflight-bridge, this is the single canvasBus ↔ da-nx DOM-event seam.
// Requests replay the last state so late-loaded consumers cannot miss resolution.
export function initBranchBridge() {
  if (initialized) return;
  initialized = true;
  let current;
  const report = (detail) => {
    document.dispatchEvent(new CustomEvent(BRANCH_EVENT.STATE, { detail }));
  };
  canvasBus.branchState.subscribe((detail) => {
    current = detail;
    report(detail);
  });
  document.addEventListener(BRANCH_EVENT.REQUEST, ({ detail }) => {
    if (current?.path === detail?.path) report(current);
  });
}
