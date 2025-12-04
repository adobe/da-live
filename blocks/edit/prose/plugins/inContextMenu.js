import { LitElement, html } from 'da-lit';

/* shared base class for slash menu and link menu */
export default class InContextMenu extends LitElement {
  static properties = {
    items: { type: Array },
    selectedIndex: { type: Number, reflect: true },
    visible: { type: Boolean, reflect: true },
    left: { type: Number },
    top: { type: Number },
  };

  constructor() {
    super();
    this.items = [];
    this.selectedIndex = 0;
    this.visible = false;
    this.left = 0;
    this.top = 0;
  }

  connectedCallback() {
    super.connectedCallback();
  }

  show(coords) {
    this.visible = true;
    this.left = coords.left;
    this.top = coords.top || (coords.bottom + 5);
    this.requestUpdate();
  }

  hide() {
    this.visible = false;
    this.selectedIndex = 0;
  }

  updatePosition() {
    const { left, top } = this;
    const rect = this.getBoundingClientRect();
    
    // Find the parent ProseMirror element
    const proseMirrorEl = this.closest('.da-prose-mirror');
    if (!proseMirrorEl) return;
    
    const parentRect = proseMirrorEl.getBoundingClientRect();
    const parentWidth = parentRect.width;
    const parentHeight = parentRect.height;

    // Convert viewport coordinates to parent-relative coordinates
    let adjustedLeft = left - parentRect.left;
    let adjustedTop = top - parentRect.top;

    // Adjust horizontal position if menu would overflow parent
    if (adjustedLeft + rect.width > parentWidth) {
      adjustedLeft = parentWidth - rect.width - 10;
    }

    // Adjust vertical position if menu would overflow parent
    if (adjustedTop + rect.height > parentHeight) {
      adjustedTop = adjustedTop - rect.height - 20;
    }

    // Ensure menu doesn't go off-screen to the left
    if (adjustedLeft < 0) {
      adjustedLeft = 10;
    }

    // Ensure menu doesn't go above parent
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

  // overridden by subclasses
  getDisplayItems() {
    return this.items;
  }

  next() {
    const displayItems = this.getDisplayItems();
    const newIndex = (this.selectedIndex + 1) % displayItems.length;
    this.selectedIndex = newIndex;
    this.scrollSelectedIntoView();
    this.requestUpdate();
  }

  previous() {
    const displayItems = this.getDisplayItems();
    const len = displayItems.length;
    const newIndex = (this.selectedIndex - 1 + len) % len;
    this.selectedIndex = newIndex;
    this.scrollSelectedIntoView();
    this.requestUpdate();
  }

  handleKeyDown(event) {
    if (!this.visible) return;

    const displayItems = this.getDisplayItems();
    if (!displayItems.length) return;

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
        if (displayItems[this.selectedIndex]) {
          const selectedItem = displayItems[this.selectedIndex];
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
      const selectedItem = this.shadowRoot.querySelector('.menu-item.selected');
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  render() {
    return html``;
  }
}
