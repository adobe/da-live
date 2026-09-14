class NxPopover extends HTMLElement {}

if (!customElements.get('nx-popover')) {
  customElements.define('nx-popover', NxPopover);
}
