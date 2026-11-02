class NxCard extends HTMLElement {}

if (!customElements.get('nx-card')) {
  customElements.define('nx-card', NxCard);
}
