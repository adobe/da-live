import { html } from 'da-lit';
import InContextMenu from '../inContextMenu.js';
import getSheet from '../../../../shared/sheet.js';

const sheet = await getSheet('/blocks/edit/prose/plugins/linkMenu/link-menu.css');

export default class LinkMenu extends InContextMenu {
  static properties = {
    ...InContextMenu.properties,
    linkHref: { type: String },
    linkText: { type: String },
  };

  constructor() {
    super();
    this.linkHref = '';
    this.linkText = '';
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  show(coords, linkHref = '', linkText = '') {
    super.show(coords);
    this.linkHref = linkHref;
    this.linkText = linkText;
  }

  scrollSelectedIntoView() {
    this.updateComplete.then(() => {
      const selectedItem = this.shadowRoot.querySelector('.link-menu-item.selected');
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  getFaviconUrl(url, size = 32) {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
    } catch (e) {
      return '';
    }
  }

  renderItem(item) {
    if (item.title === 'Open link') {
      return html`
        <div class="link-text-display">
          <div class="link-text">${this.linkText}</div>
          <div class="link-href-wrapper">
            <span class="link-href">${this.linkHref}</span>
            <span class="link-open-icon"></span>
          </div>
        </div>
      `;
    }
    return item.title;
  }

  renderIcon(item) {
    if (item.title === 'Open link') {
      const faviconUrl = this.getFaviconUrl(this.linkHref);
      if (faviconUrl) {
        return html`<img class="link-favicon-icon" src="${faviconUrl}" alt="" />`;
      }
    }
    return html`<span class="link-menu-icon ${item.class}"></span>`;
  }

  render() {
    return html`
      <div class="link-menu-items">
        ${this.items.map((item, index) => html`
            <div
              class="link-menu-item ${index === this.selectedIndex ? 'selected' : ''}"
              @mouseenter=${() => { this.selectedIndex = index; }}
              @mousedown=${(e) => { e.preventDefault(); /* prevent close before click handler */ }}
              @click=${() => { this.handleItemClick(item); }}
            >
              ${this.renderIcon(item)}
              <span class="link-menu-label">
                ${this.renderItem(item)}
              </span>
            </div>`)}
      </div>
    `;
  }
}

customElements.define('link-menu', LinkMenu);
