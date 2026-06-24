class NxPicker extends HTMLElement {}

if (!customElements.get('nx-picker')) {
  customElements.define('nx-picker', NxPicker);
}
