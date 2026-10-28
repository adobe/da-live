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
export const registerPanelSection = () => {};
export const getSectionAtPosition = () => undefined;
