import { LitElement, html } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import './ew-preflight.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);

// Preflight panel content. Today it only wraps the built-in <ew-preflight>; it is kept
// as the seam for swapping in a custom Preflight should that ever be needed in canvas.
class EwPreflightHost extends LitElement {
  constructor() {
    super();
    this._preflight = document.createElement('ew-preflight');
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  // Honored by the tool panel for first-party views (see tool-panel.js).
  getHeaderActions() {
    return this._preflight.getHeaderActions?.();
  }

  render() {
    return html`${this._preflight}`;
  }
}

if (!customElements.get('ew-preflight-host')) {
  customElements.define('ew-preflight-host', EwPreflightHost);
}
