import { LitElement, html } from 'da-lit';
import '../../browse/da-action-modal/da-action-modal.js';
import { getNx } from '../../../scripts/utils.js';

// Styles
const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const STYLE = await getStyle(import.meta.url);

export default class DaPermissionsModal extends LitElement {
  static properties = {
    title: { type: String },
    message: { type: String },
    action: { type: String },
    _permissionRequested: { state: true },
  };

  constructor() {
    super();
    this.title = '';
    this.message = '';
    this.action = '';
    this._permissionRequested = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [STYLE];
  }

  showModal() {
    this.message = `Would you like to request permission to ${this.action}?`;
    this._permissionRequested = false;
    this._modal?.showModal();
  }

  get _modal() {
    return this.shadowRoot.querySelector('da-action-modal');
  }

  get _deleteButton() {
    return this.shadowRoot.querySelector('.delete-button');
  }

  close() {
    this._modal?.close();
    this.dispatchEvent(new Event('modal-closed'));
  }

  handlePrimaryAction() {
    console.log('primary action');
    this.message = 'Permission request has been sent.';
    this._permissionRequested = true;
  }

  getFooter() {
    if (this._permissionRequested) {
      return html`
        <sl-button @click=${this.close} class="outline">OK</sl-button>
      `;
    }
    return html`
      <sl-button @click=${this.close} class="primary outline">Cancel</sl-button>
      <sl-button @click=${this.handlePrimaryAction} class="outline">Request Permission</sl-button>
    `;
  }

  render() {
    return html`
      <da-action-modal>
        <span slot="title">${this.title}</span>
        ${this.message}
        <span class="permissions-footer" slot="footer">
          ${this.getFooter()}
        </span>
      </da-action-modal>
    `;
  }
}

customElements.define('da-permissions-modal', DaPermissionsModal);
