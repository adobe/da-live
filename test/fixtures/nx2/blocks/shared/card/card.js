class NxCard extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    if (!this.querySelector('[slot="preview"], [slot="selection"], [slot="badge"], [slot="title"]')) return;
    this.attachShadow({ mode: 'open' }).innerHTML = `<slot name="preview"></slot><slot name="selection"></slot>
      <slot name="badge"></slot><slot name="title"></slot>
      <slot name="actions"></slot><slot name="metadata"></slot>
      <slot name="media"></slot><slot name="heading"></slot><slot name="content"></slot>`;
  }
}

if (!customElements.get('nx-card')) {
  customElements.define('nx-card', NxCard);
}
