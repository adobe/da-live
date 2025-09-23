import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

const nx = getNx();

// SL Components
await import(`${nx}/public/sl/components.js`);

// Styles
const { default: getStyle } = await import(`${nx}/utils/styles.js`);
const SL = await getStyle(`${nx}/public/sl/styles.css`);
const STYLE = await getStyle(import.meta.url);

export default class DaDialog extends LitElement {
  static properties = {
    title: { type: String },
    message: { attribute: false },
    action: { state: true },
    _showLazyModal: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [SL, STYLE];
    // Trigger animation and show modal by default
    setTimeout(() => { this.showModal(); }, 20);
  }

  updated() {
    if (this._showLazyModal && this._dialog) {
      this._showLazyModal = undefined;
      this.showModal();
    }
  }

  showModal() {
    if (!this._dialog) {
      this._showLazyModal = true;
      return;
    }
    this._dialog.showModal();
  }

  close() {
    // Close the SL dialog
    this._dialog?.close();

    const event = new CustomEvent('close', { bubbles: true, composed: true });
    this.dispatchEvent(event);
  }

  get _action() {
    // If supplied an action, use it.
    if (this.action) return this.action;

    // Build out a default action.
    return {
      label: 'OK',
      style: 'accent',
      onClick: this.close(),
    };
  }

  get _dialog() {
    return this.shadowRoot.querySelector('sl-dialog');
  }

  render() {
    return html`
      <sl-dialog @close=${this.close}>
        <div class="da-dialog-inner">
          <div class="da-dialog-header">
            <p class="sl-heading-m">${this.title}</p>
            <button
              class="da-dialog-close-btn"
              @click=${this.close}
              aria-label="Close dialog">
              <svg class="icon"><use href="/blocks/browse/img/S2IconClose20N-icon.svg#S2IconClose20N-icon"></use></svg>
            </button>
          </div>
          <hr/>
          <div class="da-dialog-content">
            <slot></slot>
          </div>
          <div class="da-dialog-footer">
            <p class="da-dialog-footer-message">${this.message || nothing}</p>
              <sl-button class="${this._action.style}" @click=${this._action.click} ?disabled=${this._action.disabled}>
                ${this._action.label}
              </sl-button>
          </div>
        </div>
      </sl-dialog>
    `;
  }
}

customElements.define('da-dialog', DaDialog);
