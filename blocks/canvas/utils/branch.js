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

const toDocPath = (value) => value.replace(/\/+/g, '/');

/**
 * Resolve once the canvas branch settles; `undefined` if resolution failed.
 * With `path`, only that page's state counts, never a previous page's.
 */
export function whenCanvasBranch({ org, site, path } = {}) {
  const docPath = path ? toDocPath(`/${org}/${site}/${path}`) : undefined;
  return new Promise((resolve) => {
    let settled = false;
    let unsub;
    const onState = (state) => {
      if (settled) return;
      if (docPath && (!state?.path || toDocPath(state.path) !== docPath)) return;
      const branch = getCanvasBranch({ org, site });
      const failed = state?.status === 'error' && state.org === org && state.site === site;
      if (!branch && !failed) return;
      settled = true;
      unsub?.();
      resolve(branch);
    };
    unsub = canvasBus.branchState.subscribe(onState);
    if (settled) unsub();
    else onState(current);
  });
}
