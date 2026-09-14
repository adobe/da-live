import { getNxEWFlags } from '../../../scripts/utils.js';

export const TOOL_PANEL_ACTIVE_VIEW_KEY = 'nx-tool-panel-active-view';

const CONFIG_FLAG_KEY = 'ew.canvasDefaultPanel';

const loadEWFlags = async (args) => (await getNxEWFlags()).getEWFlags(args);

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

export async function readConfiguredToolPanelView({ org, site }, getEWFlags = loadEWFlags) {
  if (!org || !site) return undefined;
  const flags = await getEWFlags({ org, site });
  const value = flags[CONFIG_FLAG_KEY];
  return value?.trim() || undefined;
}

/** Session storage wins over site config; caller falls back when no match in `availableIds`. */
export async function resolveInitialToolPanelView(
  { org, site, availableIds },
  getEWFlags = loadEWFlags,
) {
  const ids = availableIds instanceof Set ? availableIds : new Set(availableIds);

  const persisted = readPersistedToolPanelView();
  if (persisted && ids.has(persisted)) return persisted;

  const configured = await readConfiguredToolPanelView({ org, site }, getEWFlags);
  if (configured && ids.has(configured)) return configured;

  return undefined;
}

/**
 * Auto-open the right panel when a site default tab is configured and the user
 * has not selected a tab yet this session (no session-storage tab preference).
 */
export async function shouldAutoOpenAfterPanel({ org, site }, getEWFlags = loadEWFlags) {
  if (!org || !site) return false;
  const configured = await readConfiguredToolPanelView({ org, site }, getEWFlags);
  if (!configured) return false;
  if (readPersistedToolPanelView()) return false;
  return true;
}
