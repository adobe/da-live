import { canvasBus } from './canvas-bus.js';

let current;
canvasBus.branchState.subscribe((state) => { current = state; });

/** The hostname form used by both the preview proxy and AEM delivery hosts. */
export function normalizeBranch(branch = 'main') {
  return branch.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

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
