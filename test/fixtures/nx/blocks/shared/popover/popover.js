// Minimal stand-in for da-nx's nx-popover (nx2/blocks/shared/popover/popover.js):
// enough of the show/close/anchor contract for tests, no positioning math.
class NxPopover extends HTMLElement {
  show({ anchor, x, y, placement } = {}) {
    this.anchor = anchor ?? null;
    this.x = x;
    this.y = y;
    this.placement = placement;
    this.open = true;
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }
}

if (!customElements.get('nx-popover')) {
  customElements.define('nx-popover', NxPopover);
}
