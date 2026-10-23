class NxCard extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    this.attachShadow({ mode: 'open' }).innerHTML = `<slot name="preview"></slot><slot name="selection"></slot>
      <slot name="badge"></slot><slot name="title"></slot>
      <slot name="actions"></slot><slot name="metadata"></slot>`;
  }
}

customElements.define('nx-card', NxCard);
