import { getNxEWFlags } from '../../../scripts/utils.js';

const CANVAS_EDITOR_VIEW_KEY = 'nx-canvas-editor-view';

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
