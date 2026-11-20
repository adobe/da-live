// Visible local stand-ins for external Spectrum elements used by DA dialogs.
class LocalSlDialog extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = '<slot></slot>';
  }
  showModal() { this.setAttribute('open', ''); }
  close() { this.removeAttribute('open'); }
}
class LocalSlButton extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = '<button type="button"><slot></slot></button>';
  }
}
customElements.define('sl-dialog', LocalSlDialog);
customElements.define('sl-button', LocalSlButton);
