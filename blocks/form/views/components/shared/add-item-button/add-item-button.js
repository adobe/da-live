import { LitElement, html } from 'da-lit';
import addItemButtonStyles from './add-item-button.css' with { type: 'css' };

/**
 * A button to add a new item to an array.
 * Displays a "+" icon with "Add Item" label.
 */
class AddItemButton extends LitElement {
  static styles = [addItemButtonStyles];

  static properties = {
    pointer: { type: String }, // The pointer of the array to add to
    disabled: { type: Boolean },
    title: { type: String }, // Custom tooltip text
    label: { type: String }, // Custom button label
  };

  constructor() {
    super();
    this.pointer = '';
    this.disabled = false;
    this.title = 'Add new item';
    this.label = 'Add Item';
  }

  _handleClick(e) {
    e.stopPropagation();

    if (this.disabled) return;

    this.dispatchEvent(new CustomEvent('confirm-add', {
      detail: { pointer: this.pointer },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    return html`
      <div class="add-item-wrapper">
        <button
          class="add-item-btn"
          @click=${this._handleClick}
          ?disabled=${this.disabled}
          title="${this.title}"
          aria-label="${this.title}"
        >
          <svg
            class="add-icon"
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
          <span class="add-label">${this.label}</span>
        </button>
      </div>
    `;
  }
}

customElements.define('add-item-button', AddItemButton);
