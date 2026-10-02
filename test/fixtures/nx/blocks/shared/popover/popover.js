class NxPopover extends HTMLElement {
  show() {
    this.open = true;
  }

  close() {
    this.open = false;
  }
}

if (!customElements.get('nx-popover')) {
  customElements.define('nx-popover', NxPopover);
}
