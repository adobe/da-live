import { getNxEWFlags } from '../../../scripts/utils.js';

const CANVAS_EDITOR_VIEW_KEY = 'nx-canvas-editor-view';

const loadEWFlags = async (args) => (await getNxEWFlags()).getEWFlags(args);

export function normalizeCanvasEditorView(view) {
  if (view === 'content') return 'content';
  if (view === 'split') return 'split';
  return 'layout';
}

export async function readInitialCanvasEditorView({ org, site }, getEWFlags = loadEWFlags) {
  try {
    const persisted = sessionStorage.getItem(CANVAS_EDITOR_VIEW_KEY);
    if (persisted) return normalizeCanvasEditorView(persisted);
  } catch { /* ignore if browser disallows session storage */ }

  const flags = await getEWFlags({ org, site });
  const value = flags['ew.canvasDefaultView'];
  if (value) return normalizeCanvasEditorView(value);

  return 'layout';
}

export function persistCanvasEditorView(view) {
  try {
    sessionStorage.setItem(CANVAS_EDITOR_VIEW_KEY, normalizeCanvasEditorView(view));
  } catch { /* ignore if browser disallows session storage */ }
}
