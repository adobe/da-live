import { getNx2 } from '../../../scripts/utils.js';
import { canvasBus } from '../utils/canvas-bus.js';

const { VERSION_EVENT } = await import(`${getNx2()}/utils/version-events.js`);

let initialized = false;

export function initVersionBridge() {
  if (initialized) return;
  initialized = true;
  document.addEventListener(
    VERSION_EVENT.CREATED,
    (e) => canvasBus.versionCreatedState.emit(e.detail),
  );
}
