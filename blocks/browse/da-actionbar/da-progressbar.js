import { LitElement, html } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

// Styles
const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const STYLE = await getStyle(import.meta.url);

export default class DaProgressBar extends LitElement {
  static properties = { progress: { type: Number } };

  constructor() {
    super();
    this.progress = 0;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [STYLE];
  }

  render() {
    return html`
      <div class="progress-bar-container">
        <div class="progress-bar" style="width: ${this.progress}%;"></div>
      </div>
    `;
  }
}

customElements.define('da-progress-bar', DaProgressBar);
