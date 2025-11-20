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

  constructor() {
    super();
    this._isDragging = false;
    this._currentTransform = { x: 0, y: 0 };
    this._boundOnDrag = this._onDrag.bind(this);
    this._boundStopDrag = this._stopDrag.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [SL, STYLE];
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
    this._dialog?.close();

    const event = new CustomEvent('close', { bubbles: true, composed: true });
    this.dispatchEvent(event);
  }

  get _action() {
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

  _startDrag(e) {
    if (e.target.closest('.da-dialog-close-btn')) return;

    this._isDragging = true;
    this._initialMouseX = e.clientX;
    this._initialMouseY = e.clientY;
    this._initialTransformX = this._currentTransform.x;
    this._initialTransformY = this._currentTransform.y;

    e.stopPropagation();
  }

  _onDrag(e) {
    if (!this._isDragging) return;

    const nativeDialog = this._getNativeDialog();
    if (!nativeDialog) return;

    const deltaX = e.clientX - this._initialMouseX;
    const deltaY = e.clientY - this._initialMouseY;
    const transformX = this._initialTransformX + deltaX;
    const transformY = this._initialTransformY + deltaY;

    nativeDialog.style.transform = `translate(${transformX}px, ${transformY}px)`;

    this._currentTransform.x = transformX;
    this._currentTransform.y = transformY;
  }

  _stopDrag() {
    if (this._isDragging) {
      this._isDragging = false;
    }
  }

  _getNativeDialog() {
    return this._dialog?.shadowRoot?.querySelector('dialog');
  }

  firstUpdated() {
    document.addEventListener('mousemove', this._boundOnDrag);
    document.addEventListener('mouseup', this._boundStopDrag);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('mousemove', this._boundOnDrag);
    document.removeEventListener('mouseup', this._boundStopDrag);
  }

  render() {
    return html`
      <sl-dialog @close=${this.close}>
        <div class="da-dialog-inner">
          <div class="da-dialog-header" @mousedown=${this._startDrag}>
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
