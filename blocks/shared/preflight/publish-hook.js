import { getNx, getNx2 } from '../../../scripts/utils.js';
import { createChannel } from '../channel.js';
import { TOOL_PANEL_SECTION } from '../tool-panel/tool-panel-section.js';
import { PREFLIGHT_VIEW_ID } from './preflight-view.js';

const nx = getNx();
const { PANEL_EVENT } = await import(`${nx}/utils/panel.js`);

const nx2 = getNx2();
const { PREFLIGHT_EVENT } = await import(`${nx2}/utils/preflight-events.js`);

function toPageRequest(detail) {
  const { paths, requestId } = detail ?? {};
  if (!requestId || !Array.isArray(paths) || paths.length !== 1) {
    return null;
  }

  return { path: paths[0], requestId };
}

const runRequests = createChannel();
let pendingRequest = null;

function onRunRequest({ detail }) {
  const request = toPageRequest(detail);
  if (request) {
    pendingRequest = request;
    const open = { section: TOOL_PANEL_SECTION, id: PREFLIGHT_VIEW_ID };
    document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, { detail: open }));
  }
  runRequests.emit(detail);
}

// An editor that publishes starts the hook at page load, because the first publish
// fires while the view is closed. It then parks the request and opens the view, which
// claims it once mounted.
function start() {
  document.addEventListener(PREFLIGHT_EVENT.RUN, onRunRequest);
  return () => {
    document.removeEventListener(PREFLIGHT_EVENT.RUN, onRunRequest);
    pendingRequest = null;
  };
}

const subscribeRunRequest = (handler) => runRequests.subscribe(handler);

function takePendingRunRequest(requestId) {
  if (requestId && pendingRequest?.requestId !== requestId) {
    return null;
  }

  const request = pendingRequest;
  pendingRequest = null;
  return request;
}

function reportStatus(detail) {
  document.dispatchEvent(new CustomEvent(PREFLIGHT_EVENT.STATUS, { detail }));
}

/** Connects Preflight to publishing. */
export const publishHook = { start, subscribeRunRequest, takePendingRunRequest, reportStatus };
