// Mirrors the show, close and reposition contract of nx2's nx-popover.
class MockNxPopover extends HTMLElement {
  show() {
    this.open = true;
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  reposition() {}
}

if (!customElements.get('nx-popover')) {
  customElements.define('nx-popover', MockNxPopover);
}
