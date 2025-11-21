import { LitElement, html } from 'da-lit';

class FormSidebarItem extends LitElement {
  static properties = {
    label: { type: String },
    pointer: { type: String },
    active: { type: Boolean, reflect: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this._onActivate = (e) => {
      const { pointer } = e.detail || {};
      this.active = !!pointer && pointer === this.pointer;
    };
    window.addEventListener('activate-item-group', this._onActivate);
  }

  disconnectedCallback() {
    window.removeEventListener('activate-item-group', this._onActivate);
    super.disconnectedCallback();
  }

  handleActivate() {
    const { pointer } = this;
    if (!pointer) return;
    const event = new CustomEvent('activate-item-group', {
      detail: { pointer },
      bubbles: true,
      composed: true,
    });
    window.dispatchEvent(event);
  }

  render() {
    return html`
      <span
        class="item"
        role="button"
        tabindex="0"
        style="color: inherit"
        @click=${() => this.handleActivate()}
      >${this.label}</span>
    `;
  }
}

customElements.define('sidebar-item', FormSidebarItem);
