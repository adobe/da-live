export const PANEL_EVENT = Object.freeze({
  CLOSE: 'nx-panel-close',
  OPEN: 'nx-panel-open',
});

let isOpen = () => false;
let onRegister = () => {};
export const wasPanelOpen = (section) => isOpen(section);
export const registerPanelSection = (...args) => onRegister(...args);
export const getSectionAtPosition = () => undefined;

export function setPanelMocks({ wasOpen = () => false, register = () => {} } = {}) {
  isOpen = wasOpen;
  onRegister = register;
}

const visibilitySubscribers = new Set();
let visibleSections = [];

export function subscribePanelVisibility(callback) {
  visibilitySubscribers.add(callback);
  callback([...visibleSections], []);
  return () => visibilitySubscribers.delete(callback);
}

// Shows exactly these panel sections and tells subscribers, like the panel registry.
export function setVisiblePanelSections(sections) {
  visibleSections = [...sections];
  visibilitySubscribers.forEach((callback) => callback([...visibleSections], []));
}
