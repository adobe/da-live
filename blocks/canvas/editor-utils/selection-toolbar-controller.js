/**
 * Owns the selection-toolbar's visibility state across both editor modes (doc
 * and wysiwyg). Each editor declares activation/deactivation explicitly rather
 * than the toolbar introspecting `view.hasFocus()` — which lies in wysiwyg mode
 * (see editor-doc cursor-broadcast hack in handlers.js).
 */

const listeners = new Set();

const state = {
  mode: 'none', // 'doc' | 'wysiwyg' | 'none'
  hasRange: false,
  interacting: false,
  isNonTextSelection: false,
  view: null,
  iframe: null,
};

function shouldShow() {
  if (state.mode === 'none') return false;
  if (state.interacting) return false;
  // Hide for table/image node selections in doc mode (they have their own UI).
  // Don't apply in wysiwyg — trust the iframe's intent if it reports a text range.
  if (state.mode === 'doc' && state.isNonTextSelection) return false;
  return true;
}

function emit() {
  const snapshot = { ...state, shouldShow: shouldShow() };
  listeners.forEach((fn) => fn(snapshot));
}

export const selectionToolbarController = {
  getState() {
    return { ...state, shouldShow: shouldShow() };
  },

  subscribe(fn) {
    listeners.add(fn);
    fn({ ...state, shouldShow: shouldShow() });
    return () => listeners.delete(fn);
  },

  setActive(mode, { view, iframe } = {}) {
    if (mode !== 'doc' && mode !== 'wysiwyg') return;
    let changed = false;
    if (state.mode !== mode) {
      state.mode = mode;
      changed = true;
    }
    if (view !== undefined && state.view !== view) {
      state.view = view;
      changed = true;
    }
    if (iframe !== undefined && state.iframe !== iframe) {
      state.iframe = iframe;
      changed = true;
    }
    if (changed) emit();
  },

  setInactive(mode) {
    // Only deactivate if the caller owns the current mode — prevents a stale
    // blur from one editor wiping the active state of the other.
    if (mode && state.mode !== mode) return;
    if (state.mode === 'none' && !state.hasRange) return;
    state.mode = 'none';
    state.hasRange = false;
    state.isNonTextSelection = false;
    emit();
  },

  setRange(hasRange, { isNonTextSelection = false } = {}) {
    if (state.hasRange === hasRange && state.isNonTextSelection === isNonTextSelection) return;
    state.hasRange = hasRange;
    state.isNonTextSelection = isNonTextSelection;
    emit();
  },

  setInteracting(flag) {
    if (state.interacting === flag) return;
    state.interacting = flag;
    emit();
  },

  /** After a toolbar command — return focus to whichever editor owned it. */
  restoreFocus() {
    if (state.mode === 'doc') {
      state.view?.focus();
    }
    // wysiwyg: rely on mousedown.preventDefault keeping iframe focus.
  },
};
