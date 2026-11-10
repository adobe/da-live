export const TOOL_PANEL_SECTION = 'tools';
export const TOOL_PANEL_TAG = 'da-tool-panel';

export function syncOpenToolPanel(context) {
  document.querySelector(TOOL_PANEL_TAG)?.setContext(context);
}

export function createToolPanelSection({ host, getContext, onShow }) {
  return {
    position: 'after',
    width: '400px',
    getContent: async () => {
      await import('./tool-panel.js');
      return Object.assign(document.createElement(TOOL_PANEL_TAG), { host });
    },
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
