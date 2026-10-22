class NxSearch extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    this.attachShadow({ mode: 'open' }).innerHTML = '<input type="search"><slot name="actions"></slot>';
    this.shadowRoot.querySelector('input').addEventListener('input', (e) => { this.value = e.target.value; });
  }
}

if (!customElements.get('nx-search')) customElements.define('nx-search', NxSearch);
