import { fetchWysiwygBranch } from './editor-utils.js';
import { canvasBus } from '../utils/canvas-bus.js';

let activeRequest;

// Canvas owns resolution; the iframe and external consumers share this result.
// Every navigation invalidates earlier completions, including leaving a document.
export function resolveCanvasBranch({ org, repo, path } = {}) {
  const request = {};
  activeRequest = request;
  if (!org || !repo || !path) {
    canvasBus.branchState.emit({ path: null, status: 'pending' });
    return Promise.resolve(undefined);
  }
  const detail = { org, site: repo, path: `/${path}` };
  canvasBus.branchState.emit({ ...detail, status: 'pending' });
  const pending = fetchWysiwygBranch({ org, site: repo, path });
  pending.then(
    (branch) => {
      if (activeRequest === request) {
        canvasBus.branchState.emit({ ...detail, status: 'ready', branch });
      }
    },
    (error) => {
      if (activeRequest === request) {
        canvasBus.branchState.emit({ ...detail, status: 'error', error: error.message });
      }
    },
  );
  return pending;
}
