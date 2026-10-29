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
