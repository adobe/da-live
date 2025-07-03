import { LitElement, html } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

const MODAL_CLOSE_EVENT = 'modal-closed';

// Styles
const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const STYLE = await getStyle(import.meta.url);

export default class DaActionModal extends LitElement {
  static properties = {
    open: { type: Boolean, attribute: 'open', reflect: true },
    _isOpen: { state: true },
  };

  constructor() {
    super();
    this.open = true;
    this._isOpen = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [STYLE];
  }

  get _dialog() {
    return this.shadowRoot.querySelector('sl-dialog');
  }

  showModal() {
    this._dialog?.showModal();
  }

  close() {
    this._dialog?.close();
    this.dispatchEvent(new Event(MODAL_CLOSE_EVENT));
  }

  render() {
    return html`
      <sl-dialog open=${this.open} @close=${this.close}>
        <div class="da-action-modal">
          <div class="da-action-modal-header">
            <h3><slot name="title"></slot></h3>
            <div class="da-actionbar-modal-close" @click=${this.close}>
              <img src="/blocks/edit/img/Smock_Close_18_N.svg" />
            </div>
          </div>
          <div class="da-action-modal-content">
            <slot></slot>
          </div>
          <div class="da-action-modal-footer">
            <slot name="footer"></slot>
          </div>
        </div>
      </sl-dialog>
    `;
  }
}

customElements.define('da-action-modal', DaActionModal);
