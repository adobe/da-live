/**
 * Single owner of the selection- and block-toolbar visibility across the canvas doc
 * editor and the WYSIWYG iframe. See docs/canvas-toolbar-architecture.md.
 *
 * Nothing outside this module shows, hides, or positions the toolbar. Callers emit
 * intent (activate / deactivate / selection / editor-mode) and this module derives
 * visibility once per animation frame from an explicit "active surface" — never
 * from `view.hasFocus()`, which is legitimately false while the user edits in the
 * cross-origin iframe.
 */

import { refreshLocalCursor } from 'da-y-wrapper';

let toolbarEl;
let toolbarLoading;
let blockToolbarEl;
let blockToolbarLoading;
let pointerdownInstalled = false;
let windowBlurInstalled = false;

const state = {
  activeSurface: null, // 'doc' | 'wysiwyg' | null
  docView: null, // the single ProseMirror view — always the command target
  iframeEl: null, // for outside-click hit-testing
  // Whether each surface's current selection is one the toolbar serves. Kept per
  // surface: a single shared slot let a doc-side selection change (collab, a
  // mirrored dispatch, a background edit) overwrite the wysiwyg answer and hide a
  // toolbar the user was still using, which needed a guard in setDocSelection to
  // paper over. Each surface now owns its own answer.
  showableBySurface: { doc: false, wysiwyg: false },
  // Per surface: the block whose node is selected there (`{ name, variant }`), or
  // null for a text/caret selection. A block selection swaps the selection toolbar
  // for the block toolbar, in both the doc view and the WYSIWYG iframe.
  blockBySurface: { doc: null, wysiwyg: null },
  editorMode: 'layout', // 'layout' | 'content' | 'split'
  // The single-block edit modal hosts the doc view in a dialog, on top of (and
  // regardless of) the current editor mode — including layout mode, where the doc
  // surface is otherwise not servable.
  blockEditOpen: false,
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

function ensureBlockToolbar() {
  if (blockToolbarEl) return blockToolbarEl;
  blockToolbarEl = document.createElement('ew-block-toolbar');
  document.body.append(blockToolbarEl);
  blockToolbarLoading ??= import('../ew-block-toolbar/ew-block-toolbar.js')
    // eslint-disable-next-line no-use-before-define -- mutually recursive with render
    .then(() => scheduleRender());
  return blockToolbarEl;
}

/**
 * The single write path for the active surface.
 *
 * The doc view's cursor plugin publishes this user's caret to collaborators based
 * on which surface is active (see `daCursorPlugin`'s `shouldBroadcast` in
 * ew-editor-doc/prose.js). ProseMirror knows nothing about surfaces, so nothing
 * re-runs that predicate on its own — poke it here whenever the answer changes.
 */
function setSurface(next) {
  // The block edit modal is modal: the iframe behind its backdrop can't take the
  // surface back (its blur/selection messages keep arriving while it is open).
  if (state.blockEditOpen && next === 'wysiwyg') return;
  if (state.activeSurface === next) return;
  state.activeSurface = next;
  if (state.docView) refreshLocalCursor(state.docView);
}

function editorModeAllows(surface) {
  // The block edit modal covers everything: only the doc view it hosts is servable,
  // whichever editor mode opened it.
  if (state.blockEditOpen) return surface === 'doc';
  if (surface === 'doc') return state.editorMode === 'content' || state.editorMode === 'split';
  if (surface === 'wysiwyg') return state.editorMode === 'layout' || state.editorMode === 'split';
  return false;
}

/** The one visibility predicate. Interaction state is pulled from the element so
 * a dialog / picker / menu is the single source of truth for "is interacting". */
function shouldShow(tb) {
  if (tb.linkDialogOpen || tb.altDialogOpen || tb.isInteracting) return false;
  return state.activeSurface !== null
    && state.showableBySurface[state.activeSurface]
    && editorModeAllows(state.activeSurface);
}

/** The block toolbar's commands all run against the doc view's NodeSelection, which
 * the iframe's NODE_SELECT relay sets just like a click in the doc view does — so the
 * same toolbar serves both surfaces. */
function syncBlockToolbar(block) {
  const btb = ensureBlockToolbar();
  // Element not upgraded yet; ensureBlockToolbar re-renders when its module resolves.
  if (typeof btb.show !== 'function') return;
  if (!block) {
    if (btb.open && !btb.isInteracting) btb.hide();
    return;
  }
  if (state.docView) btb.view = state.docView;
  // Re-showing reloads the variant list and the multi-block template, so only do it
  // when the selected block actually changed — otherwise every mirrored transaction
  // would close the variant picker the user just opened.
  if (btb.open && btb.blockName === block.name && btb.blockVariant === block.variant) return;
  btb.show(block.name, block.variant);
}

let renderQueued = false;
function render() {
  const tb = ensureToolbar();
  // Element not upgraded yet; ensureToolbar re-renders when its module resolves.
  if (typeof tb.show !== 'function') return;
  // Only assign a known view; never clobber with null (teardown just hides, and a
  // fresh view arrives via setDocView on the next load).
  if (state.docView) tb.view = state.docView;
  // The element renders a surface-appropriate button set: the wysiwyg iframe owns
  // block-level structure, so it gets inline/link/image controls only.
  tb.activeSurface = state.activeSurface;

  const { activeSurface } = state;
  const block = activeSurface ? state.blockBySurface[activeSurface] : null;
  // The block toolbar is body-hosted, so inside the block edit modal it would render
  // behind the backdrop — and its commands target the block already being edited.
  const showBlock = block !== null && !state.blockEditOpen && editorModeAllows(activeSurface);
  syncBlockToolbar(showBlock ? block : null);

  if (!showBlock && shouldShow(tb)) {
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
        setSurface('wysiwyg');
        state.showableBySurface.wysiwyg = true;
        scheduleRender();
      }
    }, 0);
  });
}

/**
 * While the wysiwyg iframe owns editing, keep real focus out of the doc view.
 *
 * This is a policy about *actions*, not a lie about *state*. An earlier version
 * also patched `view.hasFocus()` to return true whenever the wysiwyg surface was
 * active, so y-prosemirror's cursor plugin would keep broadcasting. That backfired:
 * prosemirror-view reads the same method to decide whether it owns the document's
 * DOM selection (`editorOwnsSelection` -> `selectionToDOM`) and whether to trust
 * DOM selection changes (`hasFocusAndSelection` in the DOM observer). With the doc
 * view editable, the lie made `selectionToDOM` write the browser selection into the
 * doc pane on every mirrored transaction — which focused the doc pane, blurred the
 * iframe and destroyed its caret. The cursor broadcast is now handled honestly by
 * `daCursorPlugin`'s `shouldBroadcast` predicate, so only `view.focus()` needs
 * guarding: it really would steal focus from the iframe.
 */
const focusGuardedViews = new WeakSet();
function installDocFocusPolicy(view) {
  if (focusGuardedViews.has(view)) return;
  focusGuardedViews.add(view);
  const realFocus = view.focus.bind(view);
  view.focus = () => {
    if (state.activeSurface === 'wysiwyg') return;
    realFocus();
  };
}

function installOutsidePointerdown() {
  if (pointerdownInstalled) return;
  pointerdownInstalled = true;
  document.addEventListener('pointerdown', (e) => {
    if (state.activeSurface === null) return;
    const path = e.composedPath();
    if (toolbarEl && path.includes(toolbarEl)) return;
    if (blockToolbarEl && path.includes(blockToolbarEl)) return;
    // The doc *surface* is the mount container, not just `view.dom`: editor chrome
    // such as the table select handle and the comments gutter is rendered as a
    // sibling of the ProseMirror dom, and clicking it must not read as "the user
    // left the editor" — that would strand the controller with no active surface,
    // after which neither toolbar can ever show again.
    const docSurfaceEl = state.docView?.dom?.parentElement ?? state.docView?.dom;
    if (docSurfaceEl && path.includes(docSurfaceEl)) return;
    if (state.iframeEl && path.includes(state.iframeEl)) return;
    // A real pointerdown in the parent document outside every editing surface —
    // the user is leaving. (Clicks inside the cross-origin iframe never reach here,
    // and are handled by the iframe's own blur.)
    setSurface(null);
    scheduleRender();
  });
}

export const toolbarController = {
  ensureToolbar,
  ensureBlockToolbar,

  /** Read-only: which surface currently owns editing. Read by the doc view's
   * cursor plugin to decide whether to publish this user's caret. */
  get activeSurface() { return state.activeSurface; },

  /** Register the doc editor's view (the command target). */
  setDocView(view) {
    state.docView = view ?? null;
    if (view) installDocFocusPolicy(view);
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

  /** The single-block edit modal opened / closed. While open the doc view it hosts is
   * the only servable surface, so the toolbar works even in layout mode — and opening
   * claims the doc surface so `view.focus()` isn't suppressed by the focus policy. */
  setBlockEditOpen(open) {
    if (state.blockEditOpen === open) return;
    state.blockEditOpen = open;
    if (open) setSurface('doc');
    scheduleRender();
  },

  /** The user is now editing in `surface` (driven by real focus / positional intent). */
  activate(surface, { iframeEl } = {}) {
    if (surface !== 'doc' && surface !== 'wysiwyg') return;
    if (iframeEl !== undefined) state.iframeEl = iframeEl;
    setSurface(surface);
    installOutsidePointerdown();
    scheduleRender();
  },

  /** Ownership-guarded: only the surface that currently owns the toolbar may
   * deactivate it, so a late blur from one editor can't wipe the other. */
  deactivate(surface) {
    if (surface && state.activeSurface !== surface) return;
    setSurface(null);
    scheduleRender();
  },

  /** Doc selection changed. Never claims the surface — a background/collab/mirror
   * dispatch must not show the toolbar on a doc the user isn't editing. Writing a
   * surface-scoped slot means it also can't clobber the wysiwyg answer, so no
   * cross-surface guard is needed. */
  setDocSelection({ showable, block = null }) {
    state.showableBySurface.doc = showable;
    state.blockBySurface.doc = block;
    scheduleRender();
  },

  /** A positional message from the iframe: the user is editing there. */
  setWysiwygSelection({ showable, block = null }) {
    setSurface('wysiwyg');
    state.showableBySurface.wysiwyg = showable;
    state.blockBySurface.wysiwyg = block;
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
    setSurface(null);
    state.blockEditOpen = false;
    state.showableBySurface.doc = false;
    state.showableBySurface.wysiwyg = false;
    state.blockBySurface.doc = null;
    state.blockBySurface.wysiwyg = null;
    state.docView = null;
    scheduleRender();
  },
};
