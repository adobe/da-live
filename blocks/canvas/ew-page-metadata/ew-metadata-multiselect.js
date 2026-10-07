import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import getSheet from '../../shared/sheet.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const [formStyle, style] = await Promise.all([
  getSheet(`${getNx2()}/styles/form.css`),
  loadStyle(import.meta.url),
]);

function parseSelected(value) {
  return (value || '').split(',').map((v) => v.trim()).filter(Boolean);
}

class EwMetadataMultiselect extends LitElement {
  static properties = {
    items: { attribute: false },
    value: { type: String },
    disabled: { type: Boolean },
    label: { type: String },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [formStyle, style];
  }

  _onToggle(itemValue) {
    const selected = new Set(parseSelected(this.value));
    if (selected.has(itemValue)) selected.delete(itemValue); else selected.add(itemValue);
    const ordered = (this.items || []).map((i) => i.value).filter((v) => selected.has(v));
    this.dispatchEvent(new CustomEvent('change', { detail: { value: ordered.join(', ') } }));
  }

  render() {
    const selected = new Set(parseSelected(this.value));
    return html`
      <ul class="ew-metadata-multiselect" role="group" aria-label=${this.label ?? nothing}>
        ${(this.items || []).map((item) => html`
          <li>
            <label class="nx-checkbox">
              <input type="checkbox" value=${item.value}
                     .checked=${selected.has(item.value)}
                     ?disabled=${this.disabled}
                     @change=${() => this._onToggle(item.value)}>
              ${item.colorValue ? html`<span class="swatch" style="background-color:${item.colorValue}"></span>` : ''}
              <span class="label">${item.title}</span>
            </label>
          </li>
        `)}
      </ul>
    `;
  }
}

customElements.define('ew-metadata-multiselect', EwMetadataMultiselect);
