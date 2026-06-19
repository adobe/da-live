class NxMenu extends HTMLElement {}

if (!customElements.get('nx-menu')) {
  customElements.define('nx-menu', NxMenu);
}
