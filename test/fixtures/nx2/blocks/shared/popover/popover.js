/** Mirrors the show, close and reposition contract of nx2's `nx-popover`. */
class MockNxPopover extends HTMLElement {
  /** Marks the popover open. */
  show() {
    this.open = true;
  }

  /** Closes an open popover and fires `close`. */
  close() {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  /** Does nothing, as there is no layout to follow. */
  reposition() {}
}

if (!customElements.get('nx-popover')) {
  customElements.define('nx-popover', MockNxPopover);
}
