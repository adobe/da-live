import { LitElement, html } from 'da-lit';

import { getNx } from '../../../scripts/utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);

const ICONS = { splitLeft: '/img/icons/s2-icon-splitleft-20-n.svg' };

// The form's own header: a slim bar with the chat toggle. Emits
// `form-toggle-chat`; exposes the toggle as a part so form.css can hide it.
class CanvasHeader extends LitElement {
  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  _toggleChat() {
    this.dispatchEvent(
      new CustomEvent('form-toggle-chat', { bubbles: true, composed: true }),
    );
  }

  _renderIcon(name) {
    return html`<svg aria-hidden="true" class="icon" viewBox="0 0 20 20"><use href="${ICONS[name]}#icon"></use></svg>`;
  }

  render() {
    return html`
      <header class="bar" part="bar">
        <div class="group group-start" part="group-start">
          <button
            type="button"
            class="icon-btn"
            part="btn toggle-before"
            aria-label="Toggle chat"
            @click=${this._toggleChat}
          >
            ${this._renderIcon('splitLeft')}
          </button>
        </div>
      </header>
    `;
  }
}

customElements.define('canvas-header', CanvasHeader);
