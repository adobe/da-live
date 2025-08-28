import { LitElement, html } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

const nx = getNx();

// Styles
const { default: getStyle } = await import(`${nx}/utils/styles.js`);
const { default: getSvg } = await import(`${nx}/utils/svg.js`);
const STYLE = await getStyle(import.meta.url);

// Icons
const ICONS = [`${nx}/img/icons/S2IconClose20N-icon.svg`];

export default class DaActionModal extends LitElement {
  static properties = { open: { type: Boolean } };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [STYLE];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
    this.open = true;
  }

  showModal() {
    this._dialog?.showModal();
  }

  close() {
    this._dialog?.close();
    this.dispatchEvent(new Event('modal-closed'));
  }

  get _dialog() {
    return this.shadowRoot.querySelector('sl-dialog');
  }

  render() {
    return html`
      <sl-dialog open=${this.open} @close=${this.close}>
        <div class="da-action-modal">
          <div class="da-action-modal-header">
            <slot name="title"></slot>
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
