export const PANEL_EVENT = Object.freeze({
  CLOSE: 'nx-panel-close',
  OPEN: 'nx-panel-open',
});

export const wasPanelOpen = () => false;
export const sections = new Map();
export const registerPanelSection = (name, config) => sections.set(name, config);
export const getSectionAtPosition = () => undefined;
