import { LitElement, html } from 'da-lit';
import { getNx } from '../../../../../../scripts/utils.js';
import '../../shared/error-badge/error-badge.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const componentStyle = await getStyle(new URL('./navigation-header.css', import.meta.url).href);

/**
 * Navigation header component with title and error badge.
 *
 * @property {string} title - Header title text
 * @property {number} totalErrors - Total error count for badge
 *
 * @fires header-badge-click - Emitted when error badge is clicked
 */
class NavigationHeader extends LitElement {
  static properties = {
    title: { type: String },
    totalErrors: { type: Number },
  };

  constructor() {
    super();
    this.title = 'Navigation';
    this.totalErrors = 0;
  }

  connectedCallback() {
    super.connectedCallback();
    const sheets = this.shadowRoot.adoptedStyleSheets || [];
    this.shadowRoot.adoptedStyleSheets = [...sheets, componentStyle];
  }

  handleBadgeClick(e) {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('header-badge-click', {
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    return html`
      <div class="da-navigation-header nav-header">
        <p>${this.title}</p>
        <div class="nav-badges">
          <error-badge
            .count=${this.totalErrors ?? 0}
            label="Jump to first error (${this.totalErrors ?? 0} issues)"
            @error-badge-click=${this.handleBadgeClick}
          ></error-badge>
        </div>
      </div>
    `;
  }
}

customElements.define('navigation-header', NavigationHeader);
export default NavigationHeader;
