import { LitElement, html } from '../../../deps/lit/lit-core.min.js';
import { getNx } from '../../../scripts/utils.js';

// Styles & Icons
const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const { default: getSvg } = await import(`${getNx()}/utils/svg.js`);
const STYLE = await getStyle(import.meta.url);
const ICONS = ['/blocks/browse/da-browse/img/Smock_Settings_18_N.svg'];

export default class DaBreadcrumbs extends LitElement {
  static properties = {
    fullpath: { type: String },
    depth: { type: Number },
    _breadcrumbs: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [STYLE];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  update(props) {
    this._breadcrumbs = this.getBreadcrumbs();
    super.update(props);
  }

  getBreadcrumbs() {
    const pathSplit = this.fullpath.split('/').filter((part) => part !== '');
    return pathSplit.map((part, idx) => ({
      name: part,
      path: `#/${pathSplit.slice(0, idx + 1).join('/')}`,
    }));
  }

  renderConfig(length, crumb, idx) {
    if (this.depth <= 2 && idx + 1 === length) {
      return html`
        <a class="da-breadcrumb-list-item-config"
           href="/config${crumb.path}/"
           aria-label="Config">
           <svg class="da-breadcrumb-list-item-icon"><use href="#spectrum-settings"/></svg>
        </a>`;
    }
    return null;
  }

  render() {
    return html`
      <div class="da-breadcrumb">
        <ul class="da-breadcrumb-list">
          ${this._breadcrumbs.map((crumb, idx) => html`
            <li class="da-breadcrumb-list-item">
              <div class=da-breadcrumb-list-item-link-wrapper>
                <a href="${crumb.path}">${crumb.name}</a>
                ${this.renderConfig(this._breadcrumbs.length, crumb, idx)}
                </a>
            </li>
          `)}
        </ul>
      </div>
    `;
  }
}

customElements.define('da-breadcrumbs', DaBreadcrumbs);
