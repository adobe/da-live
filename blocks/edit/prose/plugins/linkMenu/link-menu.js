import { html } from 'da-lit';
import InContextMenu from '../inContextMenu.js';
import getSheet from '../../../../shared/sheet.js';

const sheet = await getSheet('/blocks/edit/prose/plugins/linkMenu/link-menu.css');

export default class LinkMenu extends InContextMenu {
  static properties = {
    ...InContextMenu.properties,
    linkText: { type: String },
  };

  constructor() {
    super();
    this.linkText = '';
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  show(coords, linkText = '') {
    super.show(coords);
    this.linkText = linkText;
    this.selectedIndex = undefined;
  }

  scrollSelectedIntoView() {
    this.updateComplete.then(() => {
      const selectedItem = this.shadowRoot.querySelector('.link-menu-item.selected');
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  handleKeyDown(event) {
    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && this.selectedIndex === undefined) {
      return false;
    }
    if (event.key === 'Tab' && this.selectedIndex === undefined) {
      event.preventDefault();
      this.selectedIndex = 0;
    }
    super.handleKeyDown(event);
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
              <span class="link-menu-icon ${item.class}"></span>
              <span class="link-menu-label">
                ${item.title}
              </span>
            </div>`)}
      </div>
    `;
  }
}

customElements.define('link-menu', LinkMenu);
