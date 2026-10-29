class NxPills extends HTMLElement { items = []; }

if (!customElements.get('nx-pills')) {
  customElements.define('nx-pills', NxPills);
}
