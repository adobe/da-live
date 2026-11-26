class MockNxMenu extends HTMLElement {
  show() {}

  close() {}
}

if (!customElements.get('nx-menu')) {
  customElements.define('nx-menu', MockNxMenu);
}
