class NxMenu extends HTMLElement {
  open = false;

  show() { this.open = true; }

  close() { this.open = false; }

  reposition() {}
}

if (!customElements.get('nx-menu')) {
  customElements.define('nx-menu', NxMenu);
}
