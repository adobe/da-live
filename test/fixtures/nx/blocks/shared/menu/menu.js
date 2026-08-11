// Minimal stand-in for da-nx's nx-menu: enough of the open/close contract for tests.
class NxMenu extends HTMLElement {
  close() {
    this.open = false;
  }
}

if (!customElements.get('nx-menu')) {
  customElements.define('nx-menu', NxMenu);
}
