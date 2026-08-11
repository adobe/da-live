/* eslint-disable import/no-unresolved -- importmap */
import { Plugin, PluginKey, NodeSelection } from 'da-y-wrapper';
import { getNx } from '../../../scripts/utils.js';

const NON_TEXT_NODES = new Set(['table']);

/** Set on transactions that mirror WYSIWYG iframe text selection into ProseMirror. */
export const NX_QUICK_EDIT_IFRAME_SELECTION_META = 'nxQuickEditIframeSelection';

/** Clears iframe-origin flag when the iframe reports a caret (no range). */
export const NX_QUICK_EDIT_CLEAR_IFRAME_SELECTION_ORIGIN_META = 'nxClearQuickEditIframeSelectionOrigin';

const selectionToolbarOriginKey = new PluginKey('nxSelectionToolbarOrigin');

function getSelectionOriginFromIframe(state) {
  return selectionToolbarOriginKey.getState(state)?.fromIframe ?? false;
}

let toolbar;
let componentLoaded;

let selectionToolbarCanWrite = false;

export function getSelectionToolbar() {
  if (toolbar) return toolbar;
  componentLoaded ??= import('../ew-selection-toolbar/ew-selection-toolbar.js');
  toolbar = document.createElement('ew-selection-toolbar');
  document.body.append(toolbar);
  return toolbar;
}

export function canShowSelectionToolbar() {
  return selectionToolbarCanWrite;
}

export function setSelectionToolbarCtx({
  org = null,
  site = null,
  sourceUrl = null,
  canWrite = false,
} = {}) {
  selectionToolbarCanWrite = canWrite === true;
  const tb = getSelectionToolbar();
  tb.org = org;
  tb.site = site;
  tb.sourceUrl = sourceUrl;
}

export function hideSelectionToolbar() {
  toolbar?.hide?.();
}

export function openLinkDialog(view) {
  getSelectionToolbar().openLinkDialog(view);
}

function isRelativeHref(href) {
  return href.startsWith('/') && !href.startsWith('//');
}

function resolveHref(href) {
  if (!isRelativeHref(href)) return href;
  const { org, site } = getSelectionToolbar();
  return org && site ? `https://main--${site}--${org}.aem.live${href}` : href;
}

let linkPreviewPopover;
let previewedLink;
let popoverLoaded;

function getLinkPreviewPopover() {
  if (linkPreviewPopover) return linkPreviewPopover;
  popoverLoaded ??= import(`${getNx()}/blocks/shared/popover/popover.js`);
  linkPreviewPopover = document.createElement('nx-popover');
  linkPreviewPopover.setAttribute('persistent', '');
  linkPreviewPopover.style.maxWidth = '320px';
  linkPreviewPopover.style.wordBreak = 'break-all';
  document.body.append(linkPreviewPopover);
  return linkPreviewPopover;
}

function hideLinkPreview() {
  previewedLink = null;
  linkPreviewPopover?.close();
}

function showLinkPreview(linkEl, href) {
  previewedLink = linkEl;
  const popover = getLinkPreviewPopover();
  popover.textContent = resolveHref(href);
  popover.show({ anchor: linkEl, placement: 'above' });
}

// Slack-style preview: only useful when the visible text doesn't already reveal
// the destination, e.g. "learn more" -> https://google.com.
function onLinkMouseOver(view, event) {
  const linkEl = event.target.closest?.('a');
  if (!linkEl || linkEl === previewedLink) return;
  const href = linkEl.getAttribute('href');
  if (href && linkEl.textContent.trim() !== href) showLinkPreview(linkEl, href);
}

function onLinkMouseOut(view, event) {
  if (previewedLink && !previewedLink.contains(event.relatedTarget)) hideLinkPreview();
}

export function openAltDialog() {
  getSelectionToolbar().openAltDialog();
}

export function triggerAddImage() {
  getSelectionToolbar().triggerAddImage();
}

function isNonTextSelection({ selection }) {
  return selection instanceof NodeSelection
    && NON_TEXT_NODES.has(selection.node.type.name);
}

function syncToolbar(view) {
  if (!view) return;
  if (!selectionToolbarCanWrite) {
    hideSelectionToolbar();
    return;
  }
  const tb = getSelectionToolbar();
  if (tb.linkDialogOpen || tb.altDialogOpen || tb.isInteracting) return;
  if (isNonTextSelection(view.state)) {
    hideSelectionToolbar();
    return;
  }
  if (!view.hasFocus()) return;
  tb.view = view;
  tb.show();
}

export function createSelectionToolbarPlugin() {
  getLinkPreviewPopover(); // Warm the nx-popover import before the first hover needs it.
  return new Plugin({
    key: selectionToolbarOriginKey,
    props: {
      handleDOMEvents: {
        mouseover: onLinkMouseOver,
        mouseout: onLinkMouseOut,
      },
    },
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
          if (ev !== 'content' && ev !== 'split') return;
          if (getSelectionOriginFromIframe(view.state)) return;
          syncToolbar(view);
        },
        destroy() {
          hideSelectionToolbar();
          hideLinkPreview();
        },
      };
    },
  });
}
