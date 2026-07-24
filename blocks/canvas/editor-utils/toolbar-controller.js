/**
 * Single owner of the selection-toolbar's visibility across the canvas doc editor
 * and the WYSIWYG iframe. See docs/canvas-toolbar-architecture.md.
 *
 * Nothing outside this module shows, hides, or positions the toolbar. Callers emit
 * intent (activate / deactivate / selection / editor-mode) and this module derives
 * visibility once per animation frame from an explicit "active surface" — never
 * from `view.hasFocus()`, which lies while the user edits in the iframe.
 */

let toolbarEl;
let toolbarLoading;
let pointerdownInstalled = false;
let windowBlurInstalled = false;

const state = {
  activeSurface: null, // 'doc' | 'wysiwyg' | null
  docView: null, // the single ProseMirror view — always the command target
  iframeEl: null, // for outside-click hit-testing
  showable: false, // current selection is one the toolbar serves
  editorMode: 'layout', // 'layout' | 'content' | 'split'
};

function ensureToolbar() {
  if (toolbarEl) return toolbarEl;
  toolbarEl = document.createElement('ew-selection-toolbar');
  document.body.append(toolbarEl);
  // The element definition loads lazily; re-render once it upgrades so a render
  // scheduled before the module resolved takes effect.
  toolbarLoading ??= import('../ew-selection-toolbar/ew-selection-toolbar.js')
    // eslint-disable-next-line no-use-before-define -- mutually recursive with render
    .then(() => scheduleRender());
  return toolbarEl;
}

function editorModeAllows(surface) {
  if (surface === 'doc') return state.editorMode === 'content' || state.editorMode === 'split';
  if (surface === 'wysiwyg') return state.editorMode === 'layout' || state.editorMode === 'split';
  return false;
}

/** The one visibility predicate. Interaction state is pulled from the element so
 * a dialog / picker / menu is the single source of truth for "is interacting". */
function shouldShow(tb) {
  if (tb.linkDialogOpen || tb.altDialogOpen || tb.isInteracting) return false;
  return state.activeSurface !== null
    && state.showable
    && editorModeAllows(state.activeSurface);
}

let renderQueued = false;
function render() {
  const tb = ensureToolbar();
  // Element not upgraded yet; ensureToolbar re-renders when its module resolves.
  if (typeof tb.show !== 'function') return;
  // Only assign a known view; never clobber with null (teardown just hides, and a
  // fresh view arrives via setDocView on the next load).
  if (state.docView) tb.view = state.docView;
  if (shouldShow(tb)) {
    tb.show();
  } else if (!tb.linkDialogOpen && !tb.altDialogOpen && !tb.isInteracting) {
    tb.hide();
  }
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

/** Pierce shadow roots to find the truly focused element. `document.activeElement`
 * stops at a shadow host, so a focused iframe nested in a shadow root reports the
 * host, not the iframe. */
function deepActiveElement() {
  let el = document.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  return el;
}

/** Detect focus entering the wysiwyg iframe. The iframe element's own focus event
 * is unreliable for cross-origin frames, and da-nx sends no message when a click
 * doesn't change the block selection (e.g. clicking where the caret already sits).
 * When focus moves into an iframe the parent window blurs and the (deep) active
 * element becomes that iframe — a robust, message-independent signal. */
function installIframeFocusDetection() {
  if (windowBlurInstalled) return;
  windowBlurInstalled = true;
  window.addEventListener('blur', () => {
    setTimeout(() => {
      if (state.iframeEl && deepActiveElement() === state.iframeEl) {
        // Entering an editable pane; assume showable so the toolbar appears even
        // when no positional message follows. A later node-select (e.g. a table)
        // refines it.
        state.activeSurface = 'wysiwyg';
        state.showable = true;
        scheduleRender();
      }
    }, 0);
  });
}

function installOutsidePointerdown() {
  if (pointerdownInstalled) return;
  pointerdownInstalled = true;
  document.addEventListener('pointerdown', (e) => {
    if (state.activeSurface === null) return;
    const path = e.composedPath();
    if (toolbarEl && path.includes(toolbarEl)) return;
    if (state.docView?.dom && path.includes(state.docView.dom)) return;
    if (state.iframeEl && path.includes(state.iframeEl)) return;
    // A real pointerdown in the parent document outside every editing surface —
    // the user is leaving. (Clicks inside the cross-origin iframe never reach here,
    // and are handled by the iframe's own blur.)
    state.activeSurface = null;
    scheduleRender();
  });
}

export const toolbarController = {
  ensureToolbar,

  /** Register the doc editor's view (the command target). */
  setDocView(view) {
    state.docView = view ?? null;
    installOutsidePointerdown();
    scheduleRender();
  },

  setIframe(iframeEl) {
    state.iframeEl = iframeEl ?? null;
    if (iframeEl) installIframeFocusDetection();
  },

  setEditorMode(mode) {
    if (state.editorMode === mode) return;
    state.editorMode = mode;
    scheduleRender();
  },

  /** The user is now editing in `surface` (driven by real focus / positional intent). */
  activate(surface, { iframeEl } = {}) {
    if (surface !== 'doc' && surface !== 'wysiwyg') return;
    if (iframeEl !== undefined) state.iframeEl = iframeEl;
    state.activeSurface = surface;
    installOutsidePointerdown();
    scheduleRender();
  },

  /** Ownership-guarded: only the surface that currently owns the toolbar may
   * deactivate it, so a late blur from one editor can't wipe the other. */
  deactivate(surface) {
    if (surface && state.activeSurface !== surface) return;
    state.activeSurface = null;
    scheduleRender();
  },

  /** Doc selection changed. Never claims the surface — a background/collab/mirror
   * dispatch must not show the toolbar on a doc the user isn't editing. */
  setDocSelection({ showable }) {
    if (state.activeSurface === 'wysiwyg') return;
    state.showable = showable;
    scheduleRender();
  },

  /** A positional message from the iframe: the user is editing there. */
  setWysiwygSelection({ showable }) {
    state.activeSurface = 'wysiwyg';
    state.showable = showable;
    installOutsidePointerdown();
    scheduleRender();
  },

  /** Re-query the toolbar's command/visibility state (e.g. after a command runs
   * or a dialog/picker closes) without changing surface. */
  refresh() {
    scheduleRender();
  },

  /** After a toolbar command / dialog close — return focus to the active surface. */
  restoreFocus() {
    if (state.activeSurface === 'doc') state.docView?.focus();
    // wysiwyg: focus never left the iframe (toolbar suppresses it via mousedown).
  },

  reset() {
    state.activeSurface = null;
    state.showable = false;
    state.docView = null;
    scheduleRender();
  },
};
