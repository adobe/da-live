import { LitElement, html } from 'da-lit';
import getSheet from '../../../../shared/sheet.js';

const sheet = await getSheet('/blocks/edit/prose/plugins/linkMenu/link-menu.css');

export default class LinkMenu extends LitElement {
  static properties = {
    items: { type: Array },
    selectedIndex: { type: Number, reflect: true },
    visible: { type: Boolean, reflect: true },
    left: { type: Number },
    top: { type: Number },
    linkText: { type: String },
  };

  constructor() {
    super();
    this.items = [];
    this.selectedIndex = 0;
    this.visible = false;
    this.left = 0;
    this.top = 0;
    this.linkText = '';
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  show(coords, linkText = '') {
    this.visible = true;
    this.left = coords.left;
    this.top = coords.top || (coords.bottom + 5);
    this.linkText = linkText;
    this.requestUpdate();
  }

  hide() {
    this.visible = false;
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

  next() {
    const newIndex = (this.selectedIndex + 1) % this.items.length;
    this.selectedIndex = newIndex;
    this.scrollSelectedIntoView();
    this.requestUpdate();
  }

  previous() {
    const len = this.items.length;
    const newIndex = (this.selectedIndex - 1 + len) % len;
    this.selectedIndex = newIndex;
    this.scrollSelectedIntoView();
    this.requestUpdate();
  }

  handleKeyDown(event) {
    if (!this.visible) return;

    if (!this.items.length) return;

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        this.next();
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        this.previous();
        break;
      }
      case 'Enter': {
        event.preventDefault();
        if (this.items[this.selectedIndex]) {
          const selectedItem = this.items[this.selectedIndex];
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
      const selectedItem = this.shadowRoot.querySelector('.link-menu-item.selected');
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  render() {
    return html`
      <div class="link-menu-items">
        ${this.items.map((item, index) => {
          return html`
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
            </div>`;
        })}
      </div>
    `;
  }
}

customElements.define('link-menu', LinkMenu);

