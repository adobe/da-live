// Mirrors the real backdrop-click-to-close behavior of da-nx's nx-dialog
// (nx2/blocks/shared/dialog/dialog.js) so tests can exercise it.
class MockNxDialog extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = '<dialog><slot></slot><slot name="actions"></slot></dialog>';
    this.shadowRoot.querySelector('dialog').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.close();
    });
  }

  connectedCallback() {
    this.shadowRoot.querySelector('dialog').showModal();
  }

  close() {
    const dialog = this.shadowRoot.querySelector('dialog');
    if (!dialog.open) return;
    dialog.close();
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }
}

if (!customElements.get('nx-dialog')) {
  customElements.define('nx-dialog', MockNxDialog);
}
