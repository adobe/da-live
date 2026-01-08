import { LitElement, html } from 'da-lit';
import navigationItemStyles from './navigation-item.css' with { type: 'css' };
import { EVENT_FOCUS_ELEMENT } from '../../../../constants.js';

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
    const event = new CustomEvent(EVENT_FOCUS_ELEMENT, {
      detail: { pointer, source: 'navigation' },
      bubbles: true,
      composed: true,
    });
    window.dispatchEvent(event);
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
