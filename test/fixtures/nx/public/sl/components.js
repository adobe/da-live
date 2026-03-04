/* eslint-disable max-classes-per-file */
class MockSlDialog extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    const dialog = document.createElement('dialog');
    this.shadowRoot.appendChild(dialog);
  }

  showModal() {
    this.open = true;
    this.setAttribute('open', '');
    // Fire show event if needed
  }

  close() {
    this.open = false;
    this.removeAttribute('open');
    // Fire hide/close event if needed
  }
}

if (!customElements.get('sl-dialog')) {
  customElements.define('sl-dialog', MockSlDialog);
}

class MockSlButton extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }
}

if (!customElements.get('sl-button')) {
  customElements.define('sl-button', MockSlButton);
}
