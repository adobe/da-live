import { parseSiteSegment, withBranch } from '../content-branch-context.js';
import { branchContext, validateBranch, defaultSourceMatchesBinding } from './context.js';

function currentEditor(root) {
  return root.querySelector('ew-editor-doc') || root.querySelector('da-content')
    || root.querySelector('.da-sheet') || root.querySelector('nx-form');
}

/** Durable editor barrier shared by switching and later Sync/Publish actions. */
export async function flushForBranchAction(root = document) {
  const editor = currentEditor(root);
  if (!editor) return { ok: true };
  if (typeof editor.forceSave !== 'function'
    || (editor.localName === 'ew-editor-doc' && !editor.hasCollaborationProvider()
      && !editor.hasSingleAuthorProvider?.())) {
    return { ok: false, error: 'The editor is not ready to confirm its save.' };
  }
  try {
    const result = await editor.forceSave();
    return result?.ok === true ? { ok: true } : { ok: false, error: result?.error || 'Save was not confirmed.' };
  } catch (error) {
    return { ok: false, error: error.message || 'Save was not confirmed.' };
  }
}

/** Freeze edits until a durable flush and the supplied branch operation finish. */
export async function withBranchBarrier(operation, options = {}) {
  const { root = document, flush = flushForBranchAction, keepInertOnSuccess = false } = options;
  const editor = currentEditor(root);
  const wasInert = editor?.inert;
  const page = root.body;
  const pageWasInert = page?.inert;
  if (page) page.inert = true;
  if (editor) editor.inert = true;
  let success = false;
  try {
    const result = await flush(root);
    if (!result?.ok) throw new Error(result?.error || 'Save was not confirmed.');
    const value = await operation();
    success = true;
    return value;
  } finally {
    if (!success || !keepInertOnSuccess) {
      if (editor) editor.inert = wasInert;
      if (page) page.inert = pageWasInert;
    }
  }
}

export async function switchContentBranch(branch, options = {}) {
  const { location = window.location, root = document, navigate } = options;
  const { history: navigationHistory = window.history } = options;
  const { flush = flushForBranchAction } = options;
  const { validate = validateBranch } = options;
  const { defaultMatches = defaultSourceMatchesBinding } = options;
  const { hash: originalHash, pathname, search } = location;
  if (!originalHash.startsWith('#/')) throw new Error('No current site');
  const parts = originalHash.slice(2).split('/');
  const { site } = parseSiteSegment(parts[1]);
  const nextSite = withBranch(site, branch);
  if (nextSite === parts[1]) return;
  if (branch) {
    await validate({ org: parts[0], site, branch, siteSegment: nextSite }, { forceFresh: true });
  } else if (!await defaultMatches(parts[0], site)) throw new Error('Default Source is not bound to da-rs');
  const isCurrent = () => location.hash === originalHash
    && location.pathname === pathname && location.search === search;
  if (!isCurrent()) throw new Error('The current location changed');
  await withBranchBarrier(async () => {
    if (!isCurrent()) throw new Error('The current location changed');
    parts[1] = nextSite;
    const url = `${pathname}${search}#/${parts.join('/')}`;
    if (navigate) navigate(url);
    else {
      navigationHistory.pushState(navigationHistory.state, '', url);
      location.reload();
    }
  }, { root, flush, keepInertOnSuccess: true });
}

/** Switch the URL to Default before retiring a published branch. The caller must flush first. */
export async function retirePublishedBranch(branchId, remove, options = {}) {
  const { location = window.location, history: navigationHistory = window.history } = options;
  const { defaultMatches = defaultSourceMatchesBinding, valid = () => true } = options;
  const { root = document } = options;
  const { hash, pathname, search } = location;
  const branch = branchContext(hash);
  const isCurrent = () => valid() && location.hash === hash
    && location.pathname === pathname && location.search === search;
  if (branch?.branch !== branchId || !isCurrent()) throw new Error('The current branch changed');
  if (!await defaultMatches(branch.org, branch.site)) {
    throw new Error('Default Source is not bound to da-rs');
  }
  if (!isCurrent()) throw new Error('The current location changed');
  // The current editor path may not exist on Default, so return to site Browse.
  const defaultHash = `#/${branch.org}/${branch.site}`;
  const isDefault = () => location.pathname === '/' && location.search === search
    && location.hash === defaultHash;
  const { body } = root;
  const wasInert = body?.inert;
  if (body) body.inert = true;
  try {
    navigationHistory.replaceState(navigationHistory.state, '', `/${search}${defaultHash}`);
    if (!isDefault()) throw new Error('Could not switch to Default');
    try { await remove(); } catch (error) {
      if (isDefault()) navigationHistory.replaceState(navigationHistory.state, '', `${pathname}${search}${hash}`);
      throw error;
    }
    if (isDefault()) location.reload();
  } finally {
    if (body) body.inert = wasInert;
  }
}

let hashGuardInstalled = false;

// Hash-only Back/Forward must use the same barrier as the selector rather than
// letting the existing hash router reuse an editor and its Y.Doc in place.
export function installBranchHashGuard(options = {}) {
  if (hashGuardInstalled) return;
  hashGuardInstalled = true;
  const { validate = validateBranch, defaultMatches = defaultSourceMatchesBinding } = options;
  const { reload = () => window.location.reload() } = options;
  let stableHash = window.location.hash;
  let generation = 0;
  window.addEventListener('hashchange', (event) => {
    generation += 1;
    const currentGeneration = generation;
    const targetHash = window.location.hash;
    const { pathname, search } = window.location;
    const originalHash = stableHash;
    let target;
    let old;
    try {
      target = branchContext(targetHash);
      old = branchContext(stableHash);
    } catch (error) {
      event.stopImmediatePropagation();
      history.replaceState(history.state, '', `${pathname}${search}${originalHash}`);
      const message = document.createElement('p');
      message.setAttribute('role', 'alert');
      message.textContent = `Unable to open branch: ${error.message}`;
      document.body.prepend(message);
      return;
    }
    const oldScope = stableHash.slice(2).split('/').slice(0, 2).join('/');
    const newScope = targetHash.slice(2).split('/').slice(0, 2).join('/');
    const mounted = currentEditor(document);
    const direct = mounted?.wsProvider?.singleAuthor || mounted?.hasSingleAuthorProvider?.();
    if (!direct && ((!target && !old) || oldScope === newScope)) {
      stableHash = targetHash;
      return;
    }
    event.stopImmediatePropagation();
    history.replaceState(history.state, '', `${pathname}${search}${originalHash}`);
    const isCurrent = () => generation === currentGeneration
      && window.location.hash === originalHash && window.location.pathname === pathname
      && window.location.search === search;
    const navigate = async () => {
      if (target) await validate(target, { forceFresh: true });
      if (!target && old && newScope === `${old.org}/${old.site}`
        && !await defaultMatches(old.org, old.site)) {
        throw new Error('Default Source is not bound to da-rs');
      }
      if (!isCurrent()) throw new Error('The current location changed');
      await withBranchBarrier(() => {
        if (!isCurrent()) throw new Error('The current location changed');
        history.replaceState(history.state, '', `${pathname}${search}${targetHash}`);
        reload();
      }, { keepInertOnSuccess: true });
    };
    navigate().catch((error) => {
      if (generation !== currentGeneration) return;
      const message = document.createElement('p');
      message.setAttribute('role', 'alert');
      message.textContent = `Unable to switch branches: ${error.message}`;
      document.body.prepend(message);
    });
  }, { capture: true });
}
