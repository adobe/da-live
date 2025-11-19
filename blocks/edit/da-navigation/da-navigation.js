import { LitElement, html } from 'da-lit';
import inlinesvg from '../../shared/inlinesvg.js';
import getSheet from '../../shared/sheet.js';

const sheet = await getSheet('/blocks/edit/da-navigation/da-navigation.css');

const ICONS = [
  '/blocks/edit/img/Smock_More_18_N.svg',
];

export default class DaNavigation extends LitElement {
  static properties = {
    parent: { type: String },
    _breadcrumbMenuOpen: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    inlinesvg({ parent: this.shadowRoot, paths: ICONS });
  }

  toggleBreadcrumbMenu() {
    this._breadcrumbMenuOpen = !this._breadcrumbMenuOpen;
  }

  renderBreadcrumbs() {
    const breadcrumbs = this.parent.split('/').filter((part) => part !== '');
    const visibleBreadcrumbs = breadcrumbs.slice(1);
    const totalChars = visibleBreadcrumbs.join('').length;

    if (totalChars > 35 && visibleBreadcrumbs.length > 2) {
      // Show first, more icon, and last
      const firstCrumb = visibleBreadcrumbs[0];
      const lastCrumb = visibleBreadcrumbs[visibleBreadcrumbs.length - 1];
      const firstPath = breadcrumbs.slice(0, 2).join('/');
      const lastPath = breadcrumbs.join('/');
      const middleCrumbs = visibleBreadcrumbs.slice(1, -1);

      return html`
        <a href="/#/${firstPath}" class="da-navigation-label">${firstCrumb}</a>
        <div class="da-navigation-dropdown ${this._breadcrumbMenuOpen ? 'open' : ''}">
          <button class="da-navigation-more-button" @click=${this.toggleBreadcrumbMenu}></button>
          <ul class="da-navigation-menu">
            ${middleCrumbs.map((crumb, index) => {
              const path = breadcrumbs.slice(0, index + 3).join('/');
              return html`
                <li>
                  <a href="/#/${path}" class="da-navigation-menu-item">${crumb}</a>
                </li>
              `;
            })}
          </ul>
        </div>
        <a href="/#/${lastPath}" class="da-navigation-label">${lastCrumb}</a>
      `;
    }

    return html`
      ${visibleBreadcrumbs.map((crumb, index) => {
        const path = breadcrumbs.slice(0, index + 2).join('/');
        return html`
          <a
            href="/#/${path}"
            class="da-navigation-label">${crumb}</a>
        `;
      })}
    `;
  }

  render() {
    if (!this.parent) return html``;
    return html`
      <nav class="da-navigation">
        ${this.renderBreadcrumbs()}
      </nav>
    `;
  }
}

customElements.define('da-navigation', DaNavigation);

