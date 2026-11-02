import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../scripts/utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const styles = await loadStyle(import.meta.url);

export default class DaLandingTile extends LitElement {
  static properties = {
    heading: {},
    description: {},
    iconHref: {},
    tone: {},
    href: {},
    action: { type: Boolean },
    disabled: { type: Boolean },
    actionId: {},
    size: { reflect: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  render() {
    const source = this.actionId ? `landing-action-${this.actionId}` : nothing;
    // Optel reads data-rum-source on the clicked element, not its ancestors.
    const content = html`
      <span class="icon ${this.tone || ''}" aria-hidden="true" data-rum-source=${source}
        style="--tile-icon: url('${this.iconHref}')"></span>
      <div class="content" data-rum-source=${source}>
        <h3 data-rum-source=${source}>${this.heading}</h3>
        <p data-rum-source=${source}>${this.description}</p>
      </div>`;
    const classes = `${this.actionId ? `${source} ` : ''}tile`;
    if (this.href) return html`<a class=${classes} href=${this.href} data-rum-source=${source}>${content}</a>`;
    if (this.action) {
      return html`<button class=${classes} type="button" ?disabled=${this.disabled}
        data-rum-source=${source}>${content}</button>`;
    }
    return html`<div class="tile">${content}</div>`;
  }
}

customElements.define('da-landing-tile', DaLandingTile);
