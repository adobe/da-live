// Test-only replacement for the external NX menu; product handlers stay real.
class LocalNxMenu extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = '<slot name="trigger"></slot><div role="menu" hidden></div>';
    this.shadowRoot.querySelector('slot').addEventListener('click', () => this.show());
  }

  show() {
    const menu = this.shadowRoot.querySelector('[role=menu]');
    menu.replaceChildren(...(this.items || []).filter((item) => item.id).map((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.textContent = item.label;
      button.addEventListener('click', () => {
        menu.hidden = true;
        this.dispatchEvent(new CustomEvent('select', { detail: { id: item.id }, bubbles: true, composed: true }));
      });
      return button;
    }));
    menu.hidden = false;
  }

  close() { this.shadowRoot.querySelector('[role=menu]').hidden = true; }
  reposition() {}
}
customElements.define('nx-menu', LocalNxMenu);
