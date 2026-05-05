/* eslint-disable max-classes-per-file */
class MockSlSelect extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }
}

if (!customElements.get('se-select')) {
  customElements.define('se-select', MockSlSelect);
}

class MockSlButton extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }
}

if (!customElements.get('se-button')) {
  customElements.define('se-button', MockSlButton);
}

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
  }

  close() {
    this.open = false;
    this.removeAttribute('open');
  }
}

if (!customElements.get('se-dialog')) {
  customElements.define('se-dialog', MockSlDialog);
}

class MockSlInput extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }
}

if (!customElements.get('se-input')) {
  customElements.define('se-input', MockSlInput);
}

class MockSlTextarea extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }
}

if (!customElements.get('se-textarea')) {
  customElements.define('se-textarea', MockSlTextarea);
}

class MockSlCheckbox extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }
}

if (!customElements.get('se-checkbox')) {
  customElements.define('se-checkbox', MockSlCheckbox);
}
