import { fetchDaConfigs } from '../../shared/utils.js';

export const TOOL_PANEL_ACTIVE_VIEW_KEY = 'nx-tool-panel-active-view';

const CONFIG_FLAG_KEY = 'ew.canvasDefaultPanel';

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

export async function readConfiguredToolPanelView({ org, site }) {
  if (!org || !site) return undefined;

  try {
    const [, siteConfig] = await Promise.all(fetchDaConfigs({ org, site }));
    const flag = siteConfig?.flags?.data?.find((f) => f.key === CONFIG_FLAG_KEY);
    const value = flag?.value?.trim();
    return value || undefined;
  } catch (e) {
    if (!(e instanceof TypeError) && !(e instanceof SyntaxError)) throw e;
  }

  return undefined;
}

/** Session storage wins over site config; caller falls back when no match in `availableIds`. */
export async function resolveInitialToolPanelView({ org, site, availableIds }) {
  const ids = availableIds instanceof Set ? availableIds : new Set(availableIds);

  const persisted = readPersistedToolPanelView();
  if (persisted && ids.has(persisted)) return persisted;

  const configured = await readConfiguredToolPanelView({ org, site });
  if (configured && ids.has(configured)) return configured;

  return undefined;
}

/**
 * Auto-open the right panel when a site default tab is configured and the user
 * has not selected a tab yet this session (no session-storage tab preference).
 */
export async function shouldAutoOpenAfterPanel({ org, site }) {
  if (!org || !site) return false;
  const configured = await readConfiguredToolPanelView({ org, site });
  if (!configured) return false;
  if (readPersistedToolPanelView()) return false;
  return true;
}
