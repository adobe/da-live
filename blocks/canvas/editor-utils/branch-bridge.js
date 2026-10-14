import { getNx2 } from '../../../scripts/utils.js';
import { canvasBus } from '../utils/canvas-bus.js';

const { BRANCH_EVENT } = await import(`${getNx2()}/utils/branch-events.js`);

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
