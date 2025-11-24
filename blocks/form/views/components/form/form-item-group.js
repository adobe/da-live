import { LitElement } from 'da-lit';

class FormItemGroup extends LitElement {
  static properties = {
    pointer: { type: String },
    label: { type: String },
  };

  // Render into light DOM so existing styles apply
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.ensureStructure();
    this._onClick = (e) => {
      e.stopPropagation();
      const { pointer } = this;
      if (!pointer) return;
      window.dispatchEvent(new CustomEvent('activate-item-group', {
        detail: { pointer, source: 'editor' },
        bubbles: true,
        composed: true,
      }));
    };
    this.addEventListener('click', this._onClick);
  }

  disconnectedCallback() {
    this.removeEventListener('click', this._onClick);
    super.disconnectedCallback();
  }

  updated(changed) {
    if (changed.has('label')) {
      const title = this.querySelector('p.item-title');
      if (title) title.textContent = this.label || '';
    }
    this.ensureStructure();
  }

  ensureStructure() {
    // Ensure title exists as first child
    let title = this.querySelector('p.item-title');
    if (!title || title.parentElement !== this) {
      title = document.createElement('p');
      title.className = 'item-title';
      title.textContent = this.label || '';
      this.insertBefore(title, this.firstChild);
    }
    // Ensure wrapper exists
    let wrapper = this.querySelector('.form-children');
    if (!wrapper || wrapper.parentElement !== this) {
      wrapper = document.createElement('div');
      wrapper.className = 'form-children';
      this.appendChild(wrapper);
    }
    // Move all non-title, non-wrapper nodes into wrapper
    const nodesToMove = Array.from(this.childNodes).filter((n) => {
      if (n === title || n === wrapper) return false;
      // Ignore empty text nodes
      return !(n.nodeType === Node.TEXT_NODE && !n.textContent.trim());
    });
    if (nodesToMove.length) {
      nodesToMove.forEach((n) => wrapper.appendChild(n));
    }
    // Ensure wrapper is after title
    if (wrapper.previousElementSibling !== title) {
      this.insertBefore(wrapper, title.nextSibling);
    }
  }
}

customElements.define('form-item-group', FormItemGroup);
