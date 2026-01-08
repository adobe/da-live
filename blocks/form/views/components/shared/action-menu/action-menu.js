import { LitElement, html } from 'da-lit';
import actionMenuStyles from './action-menu.css' with { type: 'css' };

/**
 * A contextual action menu that displays action buttons in a dropdown.
 *
 * Behavior:
 * - Always shows three-dot trigger icon with dropdown submenu
 * - Click trigger: Opens the submenu
 * - Hover: Keeps the submenu open while hovering
 * - Mouse leave: Closes after 1 second of no hover
 * - Action confirmed: Closes immediately to prevent confusion during DOM updates
 * - All actions displayed with labels in the submenu
 *
 * Usage:
 * <action-menu label="Actions">
 *   <insert-button slot="actions" .pointer=${ptr} @confirm-insert=${h}>
 *   </insert-button>
 *   <remove-button slot="actions" .pointer=${ptr} @confirm-remove=${h}>
 *   </remove-button>
 * </action-menu>
 */
class ActionMenu extends LitElement {
  static styles = [actionMenuStyles];

  static properties = {
    label: { type: String },
    align: { type: String }, // 'left' (default) or 'right' - controls dropdown alignment
    _expanded: { state: true },
    _actionCount: { state: true },
  };

  constructor() {
    super();
    this.label = 'Actions';
    this.align = 'left';
    this._expanded = false;
    this._actionCount = 0;
    this._closeTimeout = null;
  }

  _handleClick(e) {
    // Toggle expanded state on click
    e.preventDefault();
    e.stopPropagation();
    this._expanded = !this._expanded;

    // Clear any pending close timeout when opening
    if (this._expanded && this._closeTimeout) {
      clearTimeout(this._closeTimeout);
      this._closeTimeout = null;
    }
  }

  _handleMouseEnter() {
    // Cancel any pending close timeout when hovering back
    if (this._closeTimeout) {
      clearTimeout(this._closeTimeout);
      this._closeTimeout = null;
    }
  }

  _handleMouseLeave() {
    // Close after 1 second of no hover
    if (this._expanded) {
      this._closeTimeout = setTimeout(() => {
        this._expanded = false;
        this._closeTimeout = null;
      }, 1000); // 1 second delay
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._closeTimeout) {
      clearTimeout(this._closeTimeout);
    }
  }

  _handleSlotChange(e) {
    const slot = e.target;
    const elements = slot.assignedElements();
    this._actionCount = elements.length;

    // Set showLabel property on slotted action buttons
    // Always show labels in the dropdown submenu
    elements.forEach((el) => {
      if (el.tagName === 'INSERT-BUTTON' || el.tagName === 'REMOVE-BUTTON' || el.tagName === 'MOVE-TO-POSITION-BUTTON') {
        el.showLabel = true;
      }
    });
  }

  _handleActionConfirmed(e) {
    // Close the menu when any action is confirmed (remove, insert, or move)
    // This prevents confusion when items shift position after deletion/move
    if (e.type === 'confirm-remove' || e.type === 'confirm-insert' || e.type === 'confirm-move') {
      this._expanded = false;
      if (this._closeTimeout) {
        clearTimeout(this._closeTimeout);
        this._closeTimeout = null;
      }
    }
  }

  render() {
    const alignClass = this.align === 'right' ? 'align-right' : 'align-left';
    return html`
      <div
        class="action-menu ${this._expanded ? 'expanded' : ''} ${alignClass}"
        @mouseenter=${this._handleMouseEnter}
        @mouseleave=${this._handleMouseLeave}
        @confirm-remove=${this._handleActionConfirmed}
        @confirm-insert=${this._handleActionConfirmed}
        @confirm-move=${this._handleActionConfirmed}
        role="group"
        aria-label="${this.label}"
      >
        <button
          class="action-menu-trigger"
          @click=${this._handleClick}
          aria-label="${this.label}"
          aria-expanded="${this._expanded}"
          tabindex="-1"
        >
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" class="trigger-icon">
  <defs>
    <style>
      .fill {
        fill: currentColor;
      }
    </style>
  </defs>
  <title>S MoreSmallListVert 18 N</title>
  <circle class="fill" cx="9" cy="13.5" r="1.425" />
  <circle class="fill" cx="9" cy="9" r="1.425" />
  <circle class="fill" cx="9" cy="4.5" r="1.425" />
</svg>
        </button>
        <div class="action-menu-items">
          <slot name="actions" @slotchange=${this._handleSlotChange}></slot>
        </div>
      </div>
    `;
  }
}

customElements.define('action-menu', ActionMenu);
