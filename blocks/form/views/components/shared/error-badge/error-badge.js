import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../../../../scripts/utils.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const componentStyle = await getStyle(new URL('./error-badge.css', import.meta.url).href);

/**
 * Error badge component - displays error count with click interaction.
 * Shared by navigation and navigation-header components.
 * 
 * @property {number} count - Error count to display
 * @property {string} label - Accessible label for the badge
 * 
 * @fires error-badge-click - { detail: { count } }
 */
class ErrorBadge extends LitElement {
  static properties = {
    count: { type: Number },
    label: { type: String },
  };

  connectedCallback() {
    super.connectedCallback();
    const sheets = this.shadowRoot.adoptedStyleSheets || [];
    this.shadowRoot.adoptedStyleSheets = [...sheets, componentStyle];
  }

  handleClick(e) {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('error-badge-click', {
      bubbles: true,
      composed: true,
      detail: { count: this.count },
    }));
  }

  render() {
    if (!this.count || this.count <= 0) return nothing;

    const ariaLabel = this.label || `Jump to errors (${this.count} issues)`;

    return html`
      <button
        class="error-badge"
        type="button"
        aria-label="${ariaLabel}"
        @click=${this.handleClick}
      >
        ${this.count}
      </button>
    `;
  }
}

customElements.define('error-badge', ErrorBadge);
export default ErrorBadge;

