import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../../../../scripts/utils.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const globalStyle = await getStyle(new URL('../../../../global.css', import.meta.url).href);
const componentStyle = await getStyle(new URL('./breadcrumb-nav.css', import.meta.url).href);

/**
 * Generic breadcrumb navigation component.
 * Works for any hierarchical navigation (file system, sitemap, forms).
 *
 * @property {Array<{id: string, label: string}>} segments - Breadcrumb segments
 * @property {string} separator - Separator between segments
 *
 * @fires segment-click - { detail: { id } }
 */
class BreadcrumbNav extends LitElement {
  static properties = {
    segments: { attribute: false },
    separator: { type: String },
  };

  constructor() {
    super();
    this.segments = [];
    this.separator = ' › ';
  }

  connectedCallback() {
    super.connectedCallback();
    const sheets = this.shadowRoot.adoptedStyleSheets || [];
    this.shadowRoot.adoptedStyleSheets = [...sheets, globalStyle, componentStyle];
  }

  handleClick(id) {
    this.dispatchEvent(new CustomEvent('segment-click', {
      detail: { id },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    if (!Array.isArray(this.segments) || this.segments.length === 0) {
      return nothing;
    }

    return html`
      <div class="form-content-breadcrumb">
        ${this.segments.map((seg, idx) => html`<button
            type="button"
            class="form-ui-breadcrumb-item"
            data-id="${seg.id}"
            @click=${() => this.handleClick(seg.id)}
          >${seg.label}</button>${idx < this.segments.length - 1 ? html`<span>${this.separator}</span>` : nothing}`)}
      </div>
    `;
  }
}

customElements.define('breadcrumb-nav', BreadcrumbNav);
export default BreadcrumbNav;
