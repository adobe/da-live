export const PANEL_EVENT = Object.freeze({
  CLOSE: 'nx-panel-close',
  OPEN: 'nx-panel-open',
});

export const wasPanelOpen = (section) => {
  try {
    return !!JSON.parse(localStorage.getItem('nx-panels') || '{}')[section];
  } catch {
    return false;
  }
};
export const panelSections = new Map();
export const registerPanelSection = (section, options) => panelSections.set(section, options);
export const getSectionAtPosition = () => undefined;
