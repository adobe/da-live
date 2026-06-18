class MockNxDialog extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = '<slot></slot><slot name="actions"></slot>';
  }

  close() {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }
}

if (!customElements.get('nx-dialog')) {
  customElements.define('nx-dialog', MockNxDialog);
}
