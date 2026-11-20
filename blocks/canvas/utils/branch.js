import { canvasBus } from './canvas-bus.js';
import { normalizeBranch } from '../../shared/constants.js';

let current;
canvasBus.branchState.subscribe((state) => { current = state; });

/** Read resolved canvas state; pending/error state must not guess another branch. */
export function getCanvasBranch({ org, site } = {}) {
  if (current?.path) {
    if ((org && current.org !== org) || (site && current.site !== site)) return undefined;
    return current.status === 'ready' && typeof current.branch === 'string' && current.branch
      ? normalizeBranch(current.branch) : undefined;
  }
  // Standalone extension helpers can also be used before a canvas context exists.
  const ref = new URLSearchParams(window.location.search).get('ref');
  return normalizeBranch(ref && ref !== 'local' ? ref : 'main');
}
