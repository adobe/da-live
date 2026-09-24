class NxMenu extends HTMLElement {
  open = false;

  close() {
    this.open = false;
  }
}

if (!customElements.get('nx-menu')) {
  customElements.define('nx-menu', NxMenu);
}
