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

/**
 * Creates the publish hook for the Preflight view and starts it at page load, because
 * the first publish fires while the view is closed. It then parks the request and
 * opens the view, which claims it once mounted.
 */
export default function createPublishHook() {
  const runRequests = createChannel();
  let pendingRequest = null;

  const onRunRequest = ({ detail }) => {
    const request = toPageRequest(detail);
    if (request) {
      pendingRequest = request;
      const open = { section: TOOL_PANEL_SECTION, id: PREFLIGHT_VIEW_ID };
      document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, { detail: open }));
    }
    runRequests.emit(detail);
  };

  return {
    start() {
      document.addEventListener(PREFLIGHT_EVENT.RUN, onRunRequest);
      return () => document.removeEventListener(PREFLIGHT_EVENT.RUN, onRunRequest);
    },
    subscribeRunRequest: (handler) => runRequests.subscribe(handler),
    takePendingRunRequest(requestId) {
      if (requestId && pendingRequest?.requestId !== requestId) {
        return null;
      }

      const request = pendingRequest;
      pendingRequest = null;
      return request;
    },
    reportStatus(detail) {
      document.dispatchEvent(new CustomEvent(PREFLIGHT_EVENT.STATUS, { detail }));
    },
  };
}
