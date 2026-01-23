import { LitElement, html } from 'da-lit';
import navigationItemStyles from './navigation-item.css' with { type: 'css' };
import {
  EVENT_FOCUS_ELEMENT,
  EVENT_ACTIVE_STATE_CHANGE,
} from '../../../../constants.js';

/**
 * Navigation item component - displays a clickable navigation item label.
 * Icons are now rendered inline by the parent component.
 * Receives active state as props from parent for better performance.
 *
 * @property {string} label - Display label
 * @property {string} pointer - Item pointer/ID
 * @property {boolean} active - Whether this item is currently active
 *
 * @fires Custom event via window for navigation
 */
class FormNavigationItem extends LitElement {
  static styles = [navigationItemStyles];

  static properties = {
    label: { type: String },
    pointer: { type: String },
    active: { type: Boolean, reflect: true },
  };

  constructor() {
    super();
    this.active = false;
  }

  handleActivate() {
    const { pointer } = this;
    if (pointer == null) return;

    // Dispatch active state change
    window.dispatchEvent(new CustomEvent(EVENT_ACTIVE_STATE_CHANGE, {
      detail: { pointer },
      bubbles: true,
      composed: true,
    }));

    // Dispatch focus element for scroll coordination
    // Navigation doesn't need scrolling (you just clicked it, it's visible)
    // But editor should scroll to show the corresponding content
    window.dispatchEvent(new CustomEvent(EVENT_FOCUS_ELEMENT, {
      detail: {
        pointer,
        scrollEditor: true,
        scrollNavigation: false,
      },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    return html`
      <span
        class="item"
        role="button"
        tabindex="0"
        @click=${() => this.handleActivate()}
      >${this.label}</span>
    `;
  }
}

customElements.define('navigation-item', FormNavigationItem);
