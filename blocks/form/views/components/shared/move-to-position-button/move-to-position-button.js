import { LitElement, html, nothing } from 'da-lit';
import moveToPositionButtonStyles from './move-to-position-button.css' with { type: 'css' };

/**
 * A button that allows moving an array item to a specific position.
 * Displays a dropdown with available position options (1, 2, 3, etc.)
 */
class MoveToPositionButton extends LitElement {
  static styles = [moveToPositionButtonStyles];

  static properties = {
    pointer: { type: String },
    disabled: { type: Boolean },
    currentIndex: { type: Number }, // Current 0-based index
    totalItems: { type: Number }, // Total number of items in array
    showLabel: { type: Boolean },
    _expanded: { state: true },
  };

  constructor() {
    super();
    this.pointer = '';
    this.disabled = false;
    this.currentIndex = null;
    this.totalItems = 0;
    this.showLabel = false;
    this._expanded = false;
    this._closeTimeout = null;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._clearTimeout();
  }

  willUpdate(changedProps) {
    // Close dropdown when array changes (items added/removed/moved)
    // This ensures the dropdown always shows the current state
    if (changedProps.has('totalItems') || changedProps.has('currentIndex')) {
      if (this._expanded) {
        this._expanded = false;
        this._clearTimeout();
      }
    }
  }

  _clearTimeout() {
    if (this._closeTimeout) {
      clearTimeout(this._closeTimeout);
      this._closeTimeout = null;
    }
  }

  _handleClick(e) {
    e.stopPropagation(); // Prevent section navigation

    if (this.disabled || this.totalItems <= 1) return;

    this._expanded = !this._expanded;

    // Clear any pending close timeout when opening
    if (this._expanded && this._closeTimeout) {
      this._clearTimeout();
    }
  }

  _handleMouseEnter() {
    // Cancel any pending close timeout when hovering back
    this._clearTimeout();
  }

  _handleMouseLeave() {
    // Close after 500ms of no hover
    if (this._expanded) {
      this._closeTimeout = setTimeout(() => {
        this._expanded = false;
        this._closeTimeout = null;
      }, 500);
    }
  }

  _handlePositionSelect(e, targetPosition) {
    e.stopPropagation();

    if (this.disabled) return;

    // Close the dropdown immediately
    this._expanded = false;
    this._clearTimeout();

    // Dispatch event with target position (0-based)
    this.dispatchEvent(new CustomEvent('confirm-move', {
      detail: {
        pointer: this.pointer,
        targetPosition: targetPosition - 1, // Convert to 0-based
      },
      bubbles: true,
      composed: true,
    }));
  }

  _renderPositionOptions() {
    if (!this._expanded || this.totalItems <= 1) return nothing;

    // Ensure we have valid values
    const total = Number(this.totalItems) || 0;
    const current = Number(this.currentIndex) ?? 0;

    const options = [];
    for (let i = 1; i <= total; i += 1) {
      const isCurrent = i === current + 1;
      options.push(html`
        <button
          class="position-option ${isCurrent ? 'current' : ''}"
          ?disabled=${isCurrent}
          @click=${(e) => this._handlePositionSelect(e, i)}
          title="${isCurrent ? 'Current position' : `Move to position ${i}`}"
        >
          ${i}${isCurrent ? ' (current)' : ''}
        </button>
      `);
    }

    return html`
      <div class="position-dropdown">
        ${options}
      </div>
    `;
  }

  render() {
    const ariaLabel = this.currentIndex !== null
      ? `Move item ${this.currentIndex + 1} to position`
      : 'Move to position';

    const title = 'Move to position';
    const labelText = 'Move to position';

    // Check if move is possible
    const canMove = this.totalItems > 1 && !this.disabled;

    return html`
      <div
        class="move-to-position-container ${this._expanded ? 'expanded' : ''}"
        @mouseenter=${this._handleMouseEnter}
        @mouseleave=${this._handleMouseLeave}
      >
        <button
          class="move-btn ${this.showLabel ? 'with-label' : ''}"
          @click=${this._handleClick}
          ?disabled=${!canMove}
          title="${title}"
          aria-label="${ariaLabel}"
          aria-expanded="${this._expanded}"
        >
          <svg
            class="move-icon"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m8 18l4 4m0 0l4-4m-4 4V2M8 6l4-4m0 0l4 4"/>
          </svg>
          ${this.showLabel ? html`<span class="button-label">${labelText}</span>` : ''}
          ${this.showLabel && canMove ? html`
            <svg
              class="chevron-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          ` : ''}
        </button>
        ${this._renderPositionOptions()}
      </div>
    `;
  }
}

customElements.define('move-to-position-button', MoveToPositionButton);
