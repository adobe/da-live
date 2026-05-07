import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
const { loadStyle } = await import(`${getNx()}/utils/utils.js`);

const styles = await loadStyle(import.meta.url);

class NxChatPills extends LitElement {
  static properties = {
    items: { type: Array },
  };

  constructor() {
    super();
    this.items = [];
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  _remove(id) {
    this.dispatchEvent(new CustomEvent('nx-pill-remove', { detail: { id } }));
  }

  _renderPill({ id, label }) {
    return html`
      <li class="pill">
        <button
          class="pill-icon"
          type="button"
          aria-label="Remove ${label}"
          @click=${() => this._remove(id)}
        ></button>
        <span class="pill-label" title=${label}>${label}</span>
      </li>
    `;
  }

  render() {
    if (!this.items?.length) return nothing;
    return html`
      <ul class="pills-container" aria-label="Attached items" aria-live="polite">
        ${this.items.map((item) => this._renderPill(item))}
      </ul>
    `;
  }
}

customElements.define('nx-chat-pills', NxChatPills);
