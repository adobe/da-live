/* eslint-disable import/no-unresolved -- importmap */
import { Plugin, PluginKey, NodeSelection } from 'da-y-wrapper';

/** Set on transactions that mirror WYSIWYG iframe text selection into ProseMirror. */
export const NX_QUICK_EDIT_IFRAME_SELECTION_META = 'nxQuickEditIframeSelection';

/** Clears iframe-origin flag when the iframe reports a caret (no range). */
export const NX_QUICK_EDIT_CLEAR_IFRAME_SELECTION_ORIGIN_META = 'nxClearQuickEditIframeSelectionOrigin';

const selectionToolbarOriginKey = new PluginKey('nxSelectionToolbarOrigin');

function getSelectionOriginFromIframe(state) {
  return selectionToolbarOriginKey.getState(state)?.fromIframe ?? false;
}

let textToolbar;
let imageOverlay;
let textToolbarReady;
let imageOverlayReady;

/**
 * Returns a fully-upgraded custom element, lazily importing its module and
 * waiting for `customElements.whenDefined` before resolving. This is critical
 * because plugin `update` can run as soon as y-sync hydrates the doc — before
 * any dynamic `import(...)` of the component module has resolved — and calling
 * methods on a not-yet-upgraded element throws `<method> is not a function`.
 */
async function ensureUpgradedElement(tagName, importer) {
  await importer();
  await customElements.whenDefined(tagName);
  const el = document.createElement(tagName);
  document.body.append(el);
  return el;
}

function ensureSelectionToolbar() {
  if (textToolbar) return textToolbar;
  textToolbarReady ??= ensureUpgradedElement(
    'ew-selection-toolbar',
    () => import('../ew-selection-toolbar/ew-selection-toolbar.js'),
  ).then((el) => {
    // If a sync fallback element was created in the meantime, prefer it
    // (its custom element class will have been upgraded automatically).
    textToolbar = textToolbar ?? el;
    return textToolbar;
  });
  return textToolbarReady;
}

/**
 * Backwards-compatible sync accessor for callers that tolerate the "may not be
 * upgraded yet" property-set pattern (the legacy text toolbar uses this from
 * `handlers.js`). Returns the cached element if available; otherwise kicks off
 * the upgrade and returns a synchronously-created element as a best-effort
 * fallback — the browser will retroactively upgrade it once
 * `customElements.define` runs.
 */
export function getSelectionToolbar() {
  if (textToolbar) return textToolbar;
  ensureSelectionToolbar();
  if (!textToolbar) {
    textToolbar = document.createElement('ew-selection-toolbar');
    document.body.append(textToolbar);
  }
  return textToolbar;
}

async function ensureImageOverlay() {
  if (imageOverlay) return imageOverlay;
  imageOverlayReady ??= ensureUpgradedElement(
    'ew-image-overlay',
    () => import('../ew-image-overlay/ew-image-overlay.js'),
  ).then((el) => {
    imageOverlay = imageOverlay ?? el;
    return imageOverlay;
  });
  return imageOverlayReady;
}

export function hideSelectionToolbar() {
  textToolbar?.hide?.();
  imageOverlay?.hide?.();
}

/**
 * Returns the toolbar mode for the current selection:
 *   - `'image'` when a single image node is selected
 *   - `'text'`  for ranges, cursors, and any other node selection we should
 *               still show the text toolbar for
 *   - `null`    when the toolbar should be hidden entirely (e.g. table NodeSelection)
 *
 * Exported for unit-testing; consumers should not call this directly.
 */
export function toolbarModeForSelection({ selection }) {
  if (!(selection instanceof NodeSelection)) return 'text';
  const nodeType = selection.node?.type?.name;
  if (nodeType === 'image') return 'image';
  // Other NodeSelections (table, hr, …) → keep the legacy "hide" behavior.
  return null;
}

/**
 * Find the DOM element backing the currently selected image node. Returns
 * `null` if the editor view does not have a DOM mapping for the selection
 * (e.g. the doc editor is unmounted in layout-only mode).
 */
function getImageElementAt(view, pos) {
  try {
    const dom = view.nodeDOM(pos);
    if (!dom) return null;
    if (dom.tagName === 'IMG') return dom;
    return dom.querySelector?.('img') ?? dom;
  } catch {
    return null;
  }
}

async function showImageOverlayFor(view) {
  const pos = view.state.selection.from;
  const getAnchor = () => getImageElementAt(view, pos);
  // If the anchor isn't ready yet (image still hydrating), bail rather than
  // showing the overlay at (0,0); the next view update will retry.
  if (!getAnchor()) return;
  const overlay = await ensureImageOverlay();
  // Selection may have moved on by the time the upgrade finished.
  if (!view.state || view.state.selection.from !== pos) return;
  if (toolbarModeForSelection(view.state) !== 'image') return;
  textToolbar?.hide?.();
  overlay.showFor({ view, placement: 'content', getAnchor });
}

async function showTextToolbarFor(view) {
  const tb = await ensureSelectionToolbar();
  if (tb.linkDialogOpen || tb.isInteracting) return;
  if (!view.hasFocus()) return;
  imageOverlay?.hide?.();
  tb.view = view;
  tb.show();
}

function syncForActiveView(view) {
  if (!view) return;
  const mode = toolbarModeForSelection(view.state);
  if (mode === null) {
    hideSelectionToolbar();
    return;
  }
  if (mode === 'image') {
    // Fire-and-forget: plugin `update` is sync. Errors are surfaced via the
    // ensure*() promise rejection handlers below.
    showImageOverlayFor(view).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[selection-toolbar] failed to show image overlay', err);
    });
    return;
  }
  if (imageOverlay?.isInteracting) return;
  showTextToolbarFor(view).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[selection-toolbar] failed to show text toolbar', err);
  });
}

export function createSelectionToolbarPlugin() {
  return new Plugin({
    key: selectionToolbarOriginKey,
    state: {
      init: () => ({ fromIframe: false }),
      apply(tr, prev) {
        if (tr.getMeta(NX_QUICK_EDIT_IFRAME_SELECTION_META)) return { fromIframe: true };
        if (tr.getMeta(NX_QUICK_EDIT_CLEAR_IFRAME_SELECTION_ORIGIN_META)) {
          return { fromIframe: false };
        }
        if (tr.selectionSet) return { fromIframe: false };
        return prev;
      },
    },
    view() {
      return {
        update(view) {
          const header = document.querySelector('ew-canvas-header');
          const ev = header?.editorView;
          // Image overlay + text toolbar only render over the doc editor
          // surface (content/split). Layout-mode image editing is handled
          // separately and is not part of this surface.
          if (ev !== 'content' && ev !== 'split') return;
          if (getSelectionOriginFromIframe(view.state)) return;
          syncForActiveView(view);
        },
        destroy() {
          hideSelectionToolbar();
        },
      };
    },
  });
}
