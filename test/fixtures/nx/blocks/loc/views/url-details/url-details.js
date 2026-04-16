class MockUrlDetails extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }
}

if (!customElements.get('nx-loc-url-details')) {
  customElements.define('nx-loc-url-details', MockUrlDetails);
}
