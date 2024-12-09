import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../scripts/utils.js';
import getPathDetails from '../shared/pathDetails.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);

const style = await getStyle('/blocks/sheet/da-sheet-preview.css');

class DaSheetPreview extends LitElement {
  static properties = {
    data: { type: Object },
    _formatted: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.details = getPathDetails();
  }

  update(props) {
    if (props.has('data')) {
      if (this.data) {
        const type = this.data[':type'];
        const baseData = type === 'sheet' ? { data: this.data } : this.data;
        this._formatted = Object.keys(baseData).reduce((acc, key) => {
          if (!key.startsWith(':')) {
            acc.push({ key, data: baseData[key].data });
          }
          return acc;
        }, []);
      }
    }
    super.update(props);
  }

  handleClose() {
    const opts = { detail: { action: 'close' }, bubbles: true, composed: true };
    const event = new CustomEvent('close', opts);
    this.dispatchEvent(event);
  }

  getUrl(value) {
    if (value.startsWith('http')) return value;
    return `https://main--${this.details.repo}--${this.details.owner}.aem.page${value}`;
  }

  renderValue(value) {
    if (!(value.startsWith('/') || value.startsWith('http'))) return value;
    const links = value.split(',').map((val) => val.replaceAll(' ', ''));
    return links.map((link) => html`<a href="${this.getUrl(link)}" target="_blank">${link}</a> `);
  }

  renderFormatted() {
    return html`
      <ul>
        ${this._formatted.map((tab) => html`
          <li class="da-sheet-tab-key">${tab.key}</li>
            ${tab.data.map((row) => html`
              <ul class="da-sheet-key-value">
              ${Object.keys(row).map((col) => html`
                <li>
                  <div class="da-sheet-key">${col}</div>
                  <div class="da-sheet-value">${this.renderValue(row[col])}</div>
                </li>
              `)}
              </ul>
            `)}
        `)}
      </ul>
    `;
  }

  render() {
    return html`
      <div class="da-sheet-preview">
        ${this._formatted ? this.renderFormatted() : nothing}
      </div>
      <div class="da-preview-menubar">
        <button class="da-preview-menuitem" @click=${this.handleClose}>Close</button>
      </div>
    `;
  }
}

customElements.define('da-sheet-preview', DaSheetPreview);
