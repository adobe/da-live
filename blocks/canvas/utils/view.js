import { getNxEWFlags } from '../../../scripts/utils.js';

const CANVAS_EDITOR_VIEW_KEY = 'nx-canvas-editor-view';
const CANVAS_BLOCK_ANCHOR_KEY = 'nx-canvas-block-anchor';

const loadEWFlags = async (args) => (await getNxEWFlags()).getEWFlags(args);

export function normalizeCanvasEditorView(view) {
  if (view === 'content') return 'content';
  if (view === 'split') return 'split';
  // Transient focused-editing mode; a real view but never persisted (see persist below).
  if (view === 'block') return 'block';
  return 'layout';
}

export async function readInitialCanvasEditorView({ org, site }, getEWFlags = loadEWFlags) {
  try {
    const persisted = sessionStorage.getItem(CANVAS_EDITOR_VIEW_KEY);
    const normalized = persisted && normalizeCanvasEditorView(persisted);
    // 'block' is transient — never resume into it on load.
    if (normalized && normalized !== 'block') return normalized;
  } catch { /* ignore if browser disallows session storage */ }

  const flags = await getEWFlags({ org, site });
  const value = flags['ew.canvasDefaultView'];
  if (value) return normalizeCanvasEditorView(value);

  return 'layout';
}

export function persistCanvasEditorView(view) {
  const normalized = normalizeCanvasEditorView(view);
  if (normalized === 'block') return;
  try {
    sessionStorage.setItem(CANVAS_EDITOR_VIEW_KEY, normalized);
  } catch { /* ignore if browser disallows session storage */ }
}

// The focused block is remembered separately from the view (which stays layout/split
// underneath). On reload the doc editor re-selects this block — if it still exists on
// the same page — and re-opens block view. Keyed by path so navigating elsewhere and
// reloading there never resurrects a stale focus.
export function persistBlockAnchor(anchor) {
  try {
    if (!anchor || anchor.path == null || anchor.blockIndex == null || anchor.blockIndex < 0) {
      sessionStorage.removeItem(CANVAS_BLOCK_ANCHOR_KEY);
      return;
    }
    sessionStorage.setItem(CANVAS_BLOCK_ANCHOR_KEY, JSON.stringify(anchor));
  } catch { /* ignore if browser disallows session storage */ }
}

export function readBlockAnchor() {
  try {
    const raw = sessionStorage.getItem(CANVAS_BLOCK_ANCHOR_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearBlockAnchor() {
  try {
    sessionStorage.removeItem(CANVAS_BLOCK_ANCHOR_KEY);
  } catch { /* ignore if browser disallows session storage */ }
}
