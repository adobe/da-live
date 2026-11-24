import { getNxEWFlags } from '../../../scripts/utils.js';

export const TOOL_PANEL_ACTIVE_VIEW_KEY = 'nx-tool-panel-active-view';
export const TOOL_PANEL_PINNED_VIEWS_KEY = 'nx-tool-panel-pinned-views';

const CONFIG_FLAG_KEY = 'ew.canvasDefaultPanel';

const loadEWFlags = async (args) => (await getNxEWFlags()).getEWFlags(args);

function readRequestedToolPanelView() {
  return new URLSearchParams(window.location.search).get('panel')?.trim() || undefined;
}

export function readPersistedToolPanelView() {
  try {
    return sessionStorage.getItem(TOOL_PANEL_ACTIVE_VIEW_KEY);
  } catch {
    return null;
  }
}

export function persistToolPanelView(viewId) {
  try {
    if (viewId) sessionStorage.setItem(TOOL_PANEL_ACTIVE_VIEW_KEY, viewId);
  } catch { /* ignore if browser disallows session storage */ }
}

export function readPinnedToolPanelViews() {
  const defaults = ['files', 'outline'];
  try {
    const ids = JSON.parse(sessionStorage.getItem(TOOL_PANEL_PINNED_VIEWS_KEY));
    const validIds = Array.isArray(ids)
      ? [...new Set(ids.filter((id) => typeof id === 'string' && id))]
      : [];
    return validIds.length ? validIds : defaults;
  } catch {
    return defaults;
  }
}

export function persistPinnedToolPanelViews(ids) {
  try {
    sessionStorage.setItem(TOOL_PANEL_PINNED_VIEWS_KEY, JSON.stringify(ids));
  } catch { /* ignore if browser disallows session storage */ }
}

export async function readConfiguredToolPanelView({ org, site }, getEWFlags = loadEWFlags) {
  if (!org || !site) return undefined;
  const flags = await getEWFlags({ org, site });
  const value = flags[CONFIG_FLAG_KEY];
  return value?.trim() || undefined;
}

/** URL wins over session storage and site config; only registered view IDs are selected. */
export async function resolveInitialToolPanelView(
  { org, site, availableIds },
  getEWFlags = loadEWFlags,
) {
  const ids = availableIds instanceof Set ? availableIds : new Set(availableIds);

  const requested = readRequestedToolPanelView();
  if (requested && ids.has(requested)) return requested;

  const persisted = readPersistedToolPanelView();
  if (persisted && ids.has(persisted)) return persisted;

  const configured = await readConfiguredToolPanelView({ org, site }, getEWFlags);
  if (configured && ids.has(configured)) return configured;

  return undefined;
}

/**
 * Auto-open the right panel for an explicit link, or a site default when the user
 * has not selected a tab yet this session.
 */
export async function shouldAutoOpenAfterPanel({ org, site }, getEWFlags = loadEWFlags) {
  if (!org || !site) return false;
  if (readRequestedToolPanelView()) return true;
  const configured = await readConfiguredToolPanelView({ org, site }, getEWFlags);
  if (!configured) return false;
  if (readPersistedToolPanelView()) return false;
  return true;
}
