import { LitElement, html } from 'da-lit';
import { EVENT_FOCUS_GROUP, EVENT_VISIBLE_GROUP } from '../../../utils/events.js';

class FormSidebarItem extends LitElement {
  static properties = {
    label: { type: String },
    pointer: { type: String },
    active: { type: Boolean, reflect: true },
    visible: { type: Boolean, reflect: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this._onActivate = (e) => {
      const { pointer } = e.detail || {};
      this.active = pointer === this.pointer;
    };
    this._onVisible = (e) => {
      const { pointer } = e.detail || {};
      this.visible = pointer === this.pointer;
    };
    window.addEventListener(EVENT_FOCUS_GROUP, this._onActivate);
    // Listen on parent host (da-form-sidebar) for visible-group
    this.getRootNode().host?.addEventListener(EVENT_VISIBLE_GROUP, this._onVisible);
  }

  disconnectedCallback() {
    window.removeEventListener(EVENT_FOCUS_GROUP, this._onActivate);
    this.getRootNode().host?.removeEventListener(EVENT_VISIBLE_GROUP, this._onVisible);
    super.disconnectedCallback();
  }

  handleActivate() {
    const { pointer } = this;
    if (pointer == null) return;
    const event = new CustomEvent(EVENT_FOCUS_GROUP, {
      detail: { pointer, source: 'sidebar' },
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
        style="color: inherit; cursor: pointer;"
        @click=${() => this.handleActivate()}
      >${this.label}</span>
    `;
  }
}

customElements.define('sidebar-item', FormSidebarItem);
