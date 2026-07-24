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

class MockSlTextarea extends HTMLElement {
  static get observedAttributes() {
    return ['value'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    this.render();
  }

  set value(nextValue) {
    this._value = nextValue;
    this.render();
  }

  get value() {
    return this._value ?? '';
  }

  render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = '';
    const textarea = document.createElement('textarea');
    textarea.value = this.value;
    this.shadowRoot.appendChild(textarea);
  }
}

if (!customElements.get('sl-textarea')) {
  customElements.define('sl-textarea', MockSlTextarea);
}
