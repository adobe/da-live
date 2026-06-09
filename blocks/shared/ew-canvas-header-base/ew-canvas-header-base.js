import { LitElement, html } from 'da-lit';

import { getNx } from '../../../scripts/utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);

const ICONS = { splitLeft: '/img/icons/s2-icon-splitleft-20-n.svg' };

class EwCanvasHeaderBase extends LitElement {
  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  _toggleBefore() {
    this.dispatchEvent(
      new CustomEvent('header-toggle-before', { bubbles: true, composed: true }),
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
            aria-label="Toggle panel"
            @click=${this._toggleBefore}
          >
            ${this._renderIcon('splitLeft')}
          </button>
          <slot name="start"></slot>
        </div>

        <div class="group group-center" part="group-center">
          <slot name="center"></slot>
        </div>

        <div class="group group-end" part="group-end">
          <slot name="end"></slot>
        </div>
      </header>
    `;
  }
}

customElements.define('ew-canvas-header-base', EwCanvasHeaderBase);
