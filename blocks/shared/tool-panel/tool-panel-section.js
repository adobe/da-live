export const TOOL_PANEL_SECTION = 'tools';
export const TOOL_PANEL_TAG = 'da-tool-panel';

/**
 * Points the open tool panel, if any, at a new context.
 *
 * @param {object} context - The host's current org and site.
 */
export function syncOpenToolPanel(context) {
  document.querySelector(TOOL_PANEL_TAG)?.setContext(context);
}

/**
 * Builds the config for nx's `registerPanelSection(TOOL_PANEL_SECTION, ...)`.
 *
 * @param {object} config
 * @param {object} config.host - The delegate that supplies the views.
 * @param {Function} config.host.getViews - Returns the views for an org and site.
 * @param {Function} [config.host.resolveInitialView] - Picks the first view to show.
 * @param {Function} [config.host.persistView] - Remembers the active view.
 * @param {Function} [config.host.readPinnedViews] - Returns the view ids pinned as tabs.
 * @param {Function} [config.host.persistPinnedViews] - Remembers the pinned view ids.
 * @param {Function} [config.host.onActiveViewChange] - Hears the visible view, or null.
 * @param {() => object} config.getContext - Reads the host's org and site.
 * @param {Function} [config.onShow] - Handles host specific open options.
 * @returns {object} The panel section config.
 */
export function createToolPanelSection({ host, getContext, onShow }) {
  return {
    position: 'after',
    width: '400px',
    /**
     * Creates the tool panel for the host.
     *
     * @returns {Promise<HTMLElement>} The `da-tool-panel` element.
     */
    getContent: async () => {
      await import('./tool-panel.js');
      return Object.assign(document.createElement(TOOL_PANEL_TAG), { host });
    },
    /**
     * Points the tool panel at the host's context and shows the requested view.
     *
     * @param {HTMLElement} aside - The nx panel that holds the tool panel.
     * @param {string} [id] - The view to show.
     * @param {object} [options] - The host specific open options.
     * @returns {Promise<void>}
     */
    onShow: async (aside, id, options) => {
      const toolPanel = aside?.querySelector(TOOL_PANEL_TAG);
      if (!toolPanel) {
        return;
      }

      await toolPanel.setContext(getContext(), id);
      await onShow?.(toolPanel, id, options);
    },
  };
}
