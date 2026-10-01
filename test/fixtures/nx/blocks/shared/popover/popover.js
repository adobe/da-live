/** Mock NX nx-popover for tests: the API da-live calls, none of the layout. */
class NxPopover extends HTMLElement {
  open = false;

  anchor = null;

  placement = null;

  show({ anchor, placement } = {}) {
    this.open = true;
    this.anchor = anchor ?? null;
    this.placement = placement ?? null;
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new CustomEvent('close'));
  }
}

if (!customElements.get('nx-popover')) {
  customElements.define('nx-popover', NxPopover);
}
