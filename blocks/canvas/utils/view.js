import { getEWFlag } from '../../shared/ewFlags.js';

const CANVAS_EDITOR_VIEW_KEY = 'nx-canvas-editor-view';

export function normalizeCanvasEditorView(view) {
  if (view === 'content') return 'content';
  if (view === 'split') return 'split';
  return 'layout';
}

export async function readInitialCanvasEditorView({ org, site }) {
  try {
    const persisted = sessionStorage.getItem(CANVAS_EDITOR_VIEW_KEY);
    if (persisted) return normalizeCanvasEditorView(persisted);
  } catch { /* ignore if browser disallows session storage */ }

  const value = await getEWFlag({ org, site, flagName: 'ew.canvasDefaultView' });
  if (value) return normalizeCanvasEditorView(value);

  return 'layout';
}

export function persistCanvasEditorView(view) {
  try {
    sessionStorage.setItem(CANVAS_EDITOR_VIEW_KEY, normalizeCanvasEditorView(view));
  } catch { /* ignore if browser disallows session storage */ }
}
