import { LitElement, html } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const style = await loadStyle(import.meta.url);

function parseSelected(value) {
  return (value || '').split(',').map((v) => v.trim()).filter(Boolean);
}

class EwMetadataMultiselect extends LitElement {
  static properties = {
    items: { attribute: false },
    value: { type: String },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
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
      <ul class="ew-metadata-multiselect">
        ${(this.items || []).map((item) => html`
          <li>
            <label>
              <input type="checkbox" value=${item.value}
                     .checked=${selected.has(item.value)}
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
