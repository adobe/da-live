/* eslint-disable max-len */
import { html, nothing } from 'da-lit';
import InContextMenu from '../inContextMenu.js';
import getSheet from '../../../../shared/sheet.js';

const sheet = await getSheet('/blocks/edit/prose/plugins/slashMenu/slash-menu.css');

function isColorCode(str) {
  const hexColorRegex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
  const rgbColorRegex = /^rgba?\(\s*(\d{1,3}\s*,\s*){2}\d{1,3}(\s*,\s*(0|1|0?\.\d+))?\s*\)$/;

  return hexColorRegex.test(str) || rgbColorRegex.test(str) || str?.includes('-gradient(');
}

function createColorSquare(color) {
  return html`
    <div style="width: 24px; height: 24px; background: ${color}; margin-left: -4px;"></div>
  `;
}

export default class SlashMenu extends InContextMenu {
  static properties = {
    ...InContextMenu.properties,
    command: { type: String },
    parent: { type: Object, attribute: false },
  };

  constructor() {
    super();
    this.command = '';
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  show(coords) {
    super.show(coords);
    this.showSubmenu();
  }

  hide() {
    this.dispatchEvent(new CustomEvent('reset-slashmenu'));
    this.command = '';
    super.hide();
  }

  getSubmenuItems() {
    const selectedIndex = this.getFilteredItems()[this.selectedIndex];
    return selectedIndex?.submenu;
  }

  getSubmenuElement() {
    return this.shadowRoot.querySelector('.submenu slash-menu');
  }

  showSubmenu() {
    const submenuElement = this.getSubmenuElement();
    const items = this.getSubmenuItems();
    if (!submenuElement || !items) return;

    submenuElement.items = items;

    // calculate submenu position
    const selectedItem = this.shadowRoot.querySelector('.slash-menu-item.selected');
    const topOffset = selectedItem?.offsetTop ?? 0;
    const width = selectedItem?.offsetWidth ?? 0;
    submenuElement.show({ top: this.top + topOffset, left: this.left + width });
    submenuElement.focus();
  }

  updated(changedProperties) {
    super.updated(changedProperties);
    if (changedProperties.has('selectedIndex')) {
      this.showSubmenu();
    }
  }

  next() {
    const filteredItems = this.getFilteredItems();
    if (this.parent && this.selectedIndex === filteredItems.length - 1) {
      this.parent.next();
      return;
    }
    super.next();
  }

  previous() {
    const filteredItems = this.getFilteredItems();
    if (this.parent && this.selectedIndex === 0) {
      this.parent.previous();
      return;
    }
    super.previous();
  }

  handleKeyDown(event) {
    const submenu = this.getSubmenuElement();
    if (submenu) {
      submenu.handleKeyDown(event);
      return;
    }

    super.handleKeyDown(event);
  }

  scrollSelectedIntoView() {
    this.updateComplete.then(() => {
      const selectedItem = this.shadowRoot.querySelector('.slash-menu-item.selected');
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  getDisplayItems() {
    return this.getFilteredItems();
  }

  getFilteredItems() {
    const searchText = this.command.toLowerCase().trim();
    const inputText = searchText.split(' ')[0];

    return this.items
      .filter((item) => {
        const itemTitle = item.title.toLowerCase();
        return item.argument
          ? itemTitle.includes(inputText)
          : itemTitle.includes(searchText);
      })
      .sort((a, b) => {
        const aTitle = a.title.toLowerCase();
        const bTitle = b.title.toLowerCase();

        // Calculate score:
        // 2 points for exact match at start
        // 1 point for containing the search text
        // 0 otherwise
        const getScore = (title) => {
          if (title.startsWith(searchText)) return 2;
          if (title.includes(searchText)) return 1;
          return 0;
        };

        // First sort by score, then alphabetically if scores are equal
        return getScore(bTitle) - getScore(aTitle)
          || aTitle.localeCompare(bTitle);
      });
  }

  render() {
    const filteredItems = this.getFilteredItems();

    if (!filteredItems.length) {
      this.hide();
      return '';
    }

    const rules = [...sheet.cssRules];

    return html`
      <div class="slash-menu-items">
        ${filteredItems.map((item, index) => {
          const isColor = isColorCode(item.value);
          const hasIcon = rules.find((rule) => rule.cssText.startsWith(`.slash-menu-icon.${item.class}`));

          return html`
            <div
              class="slash-menu-item ${index === this.selectedIndex ? 'selected' : ''}"
              @mouseenter=${() => { this.selectedIndex = index; }}
              @mousedown=${(e) => { e.preventDefault(); /* prevent close before click handler */ }}
              @click=${() => { this.handleItemClick(item); }}
            >
              ${isColor ? createColorSquare(item.value) : ''}
              ${hasIcon ? html`<span class="slash-menu-icon ${item.class}"></span>` : ''}
              <span class="slash-menu-label">
                ${item.title}
              </span>
            </div>`;
        })}
        ${this.getSubmenuItems() ? html`
          <div class="submenu">
            <slash-menu @item-selected=${(e) => this.handleItemClick(e.detail.item)} .parent=${this}>
          </slash-menu></div>
        ` : nothing}
      </div>
    `;
  }
}

customElements.define('slash-menu', SlashMenu);
