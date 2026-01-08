import { LitElement, html } from 'da-lit';
import removeButtonStyles from './remove-button.css' with { type: 'css' };

/**
 * A two-stage confirmation remove button.
 * First click: Shows checkmark (confirmation state)
 * Second click: Dispatches 'confirm-remove' event
 * Auto-reverts to trash icon after 3 seconds if not confirmed
 */
class RemoveButton extends LitElement {
  static styles = [removeButtonStyles];

  static properties = {
    pointer: { type: String }, // The pointer of the item to remove
    disabled: { type: Boolean },
    index: { type: Number }, // For aria-label (e.g. "Remove item 2")
    showLabel: { type: Boolean }, // Whether to show text label
    _confirmState: { state: true }, // Internal: trash vs checkmark
  };

  constructor() {
    super();
    this.pointer = '';
    this.disabled = false;
    this.index = null;
    this.showLabel = false;
    this._confirmState = false;
    this._timeoutId = null;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._clearTimeout();
  }

  _clearTimeout() {
    if (this._timeoutId) {
      clearTimeout(this._timeoutId);
      this._timeoutId = null;
    }
  }

  _handleClick(e) {
    e.stopPropagation(); // Prevent section navigation

    if (this.disabled) return;

    if (this._confirmState) {
      // Second click - confirm removal
      this._clearTimeout();
      this._confirmState = false;

      this.dispatchEvent(new CustomEvent('confirm-remove', {
        detail: { pointer: this.pointer },
        bubbles: true,
        composed: true,
      }));
      return;
    }

    // First click - enter confirm state
    this._confirmState = true;
    this._timeoutId = setTimeout(() => {
      this._confirmState = false;
      this._timeoutId = null;
    }, 3000);
  }

  render() {
    const ariaLabel = this._confirmState
      ? 'Confirm removal'
      : this.index !== null
        ? `Remove item ${this.index}`
        : 'Remove item';

    const title = this._confirmState
      ? 'Click to confirm removal'
      : 'Remove this item';

    const labelText = this._confirmState ? 'Confirm' : 'Remove';

    return html`
      <button
        class="remove-btn ${this._confirmState ? 'confirm-state' : ''} ${this.showLabel ? 'with-label' : ''}"
        @click=${this._handleClick}
        ?disabled=${this.disabled}
        title="${title}"
        aria-label="${ariaLabel}"
      >
        ${this._confirmState
        ? html`<span class="check-icon">✓</span>`
        : html`
            <svg class="trash-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/>
              <path d="M14 11v6"/>
              <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
            </svg>
          `}
        ${this.showLabel ? html`<span class="button-label">${labelText}</span>` : ''}
      </button>
    `;
  }
}

customElements.define('remove-button', RemoveButton);
