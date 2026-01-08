import { LitElement, html } from 'da-lit';
import insertButtonStyles from './insert-button.css' with { type: 'css' };

/**
 * An insert button that adds a new item before or after the current position.
 * Displays a "+" icon to indicate addition.
 */
class InsertButton extends LitElement {
  static styles = [insertButtonStyles];

  static properties = {
    pointer: { type: String },
    disabled: { type: Boolean },
    index: { type: Number },
    showLabel: { type: Boolean },
    mode: { type: String },
    label: { type: String },
  };

  constructor() {
    super();
    this.pointer = '';
    this.disabled = false;
    this.index = null;
    this.showLabel = false;
    this.mode = 'after';
    this.label = 'Insert sibling';
  }

  _handleClick(e) {
    e.stopPropagation(); // Prevent section navigation

    if (this.disabled) return;

    this.dispatchEvent(new CustomEvent('confirm-insert', {
      detail: {
        pointer: this.pointer,
        mode: this.mode, // Pass mode to handler
      },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    const isBefore = this.mode === 'before';
    const position = isBefore ? 'before' : 'after';

    const ariaLabel = this.index !== null
      ? `${this.label} ${position} item ${this.index}`
      : this.label;

    const title = this.index !== null
      ? `${this.label} ${position} #${this.index}`
      : this.label;

    const labelText = this.label;

    return html`
      <button
        class="insert-btn ${this.showLabel ? 'with-label' : ''}"
        @click=${this._handleClick}
        ?disabled=${this.disabled}
        title="${title}"
        aria-label="${ariaLabel}"
      >
        <svg
          class="insert-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        ${this.showLabel ? html`<span class="button-label">${labelText}</span>` : ''}
      </button>
    `;
  }
}

customElements.define('insert-button', InsertButton);

