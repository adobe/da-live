import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const style = await loadStyle(import.meta.url);

export default class DaBreadcrumbs extends LitElement {
  static properties = {
    details: { attribute: false },
    _breadcrumbs: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  update(props) {
    this.getBreadcrumbs();
    super.update(props);
  }

  getBreadcrumbs() {
    const pathSplit = this.details.fullpath.split('/').filter((part) => part !== '');
    this._breadcrumbs = pathSplit.map((part, idx) => ({
      name: part,
      path: `#/${pathSplit.slice(0, idx + 1).join('/')}`,
    }));
  }

  renderConfig(crumb) {
    if (this.details.path) return nothing;
    return html`
      <a class="da-breadcrumb-list-item-config"
        href="/config${crumb.path}/"
        aria-label="Config">
        <svg class="da-breadcrumb-list-item-icon" viewBox="0 0 20 20">
          <use href="/img/icons/s2-icon-settings-20-n.svg#icon"/>
        </svg>
      </a>`;
  }

  render() {
    return html`
      <div class="da-breadcrumb">
        <ul class="da-breadcrumb-list">
          ${this._breadcrumbs.map((crumb, idx) => html`
            <li class="da-breadcrumb-list-item">
              <div class=da-breadcrumb-list-item-link-wrapper>
                <a href="${crumb.path}">${crumb.name}</a>
                ${this._breadcrumbs.length === idx + 1 ? this.renderConfig(crumb) : nothing}
                </a>
            </li>
          `)}
        </ul>
      </div>
    `;
  }
}

customElements.define('da-breadcrumbs', DaBreadcrumbs);
