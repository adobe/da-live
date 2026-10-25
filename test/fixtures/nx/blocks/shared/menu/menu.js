class NxMenu extends HTMLElement {
  open = false;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = '<slot name="trigger"></slot><div role="menu"></div>';
  }

  show() {
    this.open = true;
    const list = this.shadowRoot.querySelector('[role="menu"]');
    list.replaceChildren(...(this.items ?? []).filter((item) => item.id).map((item) => {
      const button = document.createElement('button');
      button.setAttribute('role', 'menuitem');
      button.dataset.id = item.id;
      button.textContent = item.label;
      return button;
    }));
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  reposition() {}

  _focusItem(id) {
    this.show();
    const items = [...this.shadowRoot.querySelectorAll('[role="menuitem"]')];
    (items.find((item) => item.dataset.id === id) ?? items[0])?.focus();
  }

  choose(id) {
    this._focusItem(id);
    this.close();
    this.dispatchEvent(new CustomEvent('select', { detail: { id }, bubbles: true, composed: true }));
  }

  pressEscape() {
    this._focusItem();
    this.close();
  }

  clickOutside(target) {
    this._focusItem();
    target.focus();
    this.close();
  }
}

if (!customElements.get('nx-menu')) {
  customElements.define('nx-menu', NxMenu);
}
