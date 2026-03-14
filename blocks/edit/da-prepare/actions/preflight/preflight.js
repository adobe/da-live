import { LitElement, html, nothing } from 'da-lit';
import getSheet from '../../../../shared/sheet.js';

const sheet = await getSheet(import.meta.url.replace('js', 'css'));

const ICONS = new Map([
  ['info', ''],
  ['warning', ''],
  ['error', ''],
]);

class DaPreflight extends LitElement {
  static properties = {
    details: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  renderLabel(type, count) {
    return html`
      <div class="category-label label-${type}">
        <svg class="icon" viewBox=""><use href="${ICONS.get(type)}"/></svg>
        <p class="label-count">${count}</p>
        <p class="label-type hide-visually">${type}</p>
      </div>`;
  }

  render() {
    return html`
      <ul>
        <li>
          <div class="category-header">
            <button>References</button>
            <div class="category-labels">
              ${this.renderLabel('info', 5)}
              ${this.renderLabel('warning', 12)}
              ${this.renderLabel('error', 98)}
            </div>
          </div>
          <div class="category-details">
          </div>
        </li>
      </ul>`;
  }
}

customElements.define('da-preflight', DaPreflight);

export default function render(details) {
  const cmp = document.createElement('da-preflight');
  cmp.details = details;
  return cmp;
}
