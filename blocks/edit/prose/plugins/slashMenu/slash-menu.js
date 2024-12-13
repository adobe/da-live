/* eslint-disable max-len */
import { LitElement, html } from 'da-lit';
import getSheet from '../../../../shared/sheet.js';

const sheet = await getSheet('/blocks/edit/prose/plugins/slashMenu/slash-menu.css');

export default class SlashMenu extends LitElement {
  static properties = {
    items: { type: Array },
    selectedIndex: { type: Number, reflect: true },
    command: { type: String },
    visible: { type: Boolean, reflect: true },
    left: { type: Number },
    top: { type: Number },
  };

  constructor() {
    super();
    this.items = [];
    this.selectedIndex = 0;
    this.command = '';
    this.visible = false;
    this.left = 0;
    this.top = 0;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  show(coords) {
    this.visible = true;
    this.left = coords.left;
    this.top = coords.bottom + 5;
    this.requestUpdate();
  }

  hide() {
    this.visible = false;
    this.command = '';
    this.selectedIndex = 0;
  }

  updatePosition() {
    const { left, top } = this;
    const rect = this.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedLeft = left;
    let adjustedTop = top;

    // Adjust horizontal position if menu would overflow viewport
    if (adjustedLeft + rect.width > viewportWidth) {
      adjustedLeft = viewportWidth - rect.width - 10;
    }

    // Adjust vertical position if menu would overflow viewport
    if (adjustedTop + rect.height > viewportHeight) {
      adjustedTop = top - rect.height - 20;
    }

    // Ensure menu doesn't go off-screen to the left
    if (adjustedLeft < 0) {
      adjustedLeft = 10;
    }

    // Ensure menu doesn't go above viewport
    if (adjustedTop < 0) {
      adjustedTop = 10;
    }

    this.style.left = `${adjustedLeft}px`;
    this.style.top = `${adjustedTop}px`;
  }

  updated(changedProperties) {
    if (changedProperties.has('left') || changedProperties.has('top')) {
      this.updatePosition();
    }
  }

  handleItemClick(item) {
    this.dispatchEvent(new CustomEvent('item-selected', { detail: { item } }));
    this.hide();
  }

  handleKeyDown(event) {
    if (!this.visible) return;

    const filteredItems = this.getFilteredItems();
    if (!filteredItems.length) return;

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        const newIndex = (this.selectedIndex + 1) % filteredItems.length;
        this.selectedIndex = newIndex;
        this.scrollSelectedIntoView();
        this.requestUpdate();
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        const len = filteredItems.length;
        const newIndex = (this.selectedIndex - 1 + len) % len;
        this.selectedIndex = newIndex;
        this.scrollSelectedIntoView();
        this.requestUpdate();
        break;
      }
      case 'Enter': {
        event.preventDefault();
        if (filteredItems[this.selectedIndex]) {
          const selectedItem = filteredItems[this.selectedIndex];
          this.handleItemClick({ ...selectedItem });
        }
        this.requestUpdate();
        break;
      }
      case 'Escape': {
        event.preventDefault();
        this.hide();
        this.requestUpdate();
        break;
      }
      default:
        break;
    }
  }

  scrollSelectedIntoView() {
    this.updateComplete.then(() => {
      const selectedItem = this.shadowRoot.querySelector('.slash-menu-item.selected');
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  getFilteredItems() {
    return this.items.filter(
      (item) => {
        const inputText = item.argument
          ? this.command.toLowerCase().trim().split(' ')[0]
          : this.command.toLowerCase();
        return item.title.toLowerCase().includes(inputText);
      },
    );
  }

  render() {
    const filteredItems = this.getFilteredItems();

    if (!filteredItems.length) {
      this.hide();
      return '';
    }

    return html`
      <div class="slash-menu-items">
        ${filteredItems.map((item, index) => html`
          <div
            class="slash-menu-item ${index === this.selectedIndex ? 'selected' : ''}"
            @click=${() => this.handleItemClick(item)}
          >
            <span class="slash-menu-icon ${item.class || ''}"></span>
            <span class="slash-menu-label">
              ${item.title}
            </span>
          </div>
        `)}
      </div>
    `;
  }
}

customElements.define('slash-menu', SlashMenu);
