import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../scripts/utils.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);

const style = await getStyle('/blocks/sheet/da-version-review.css');

class DaVersionReview extends LitElement {
  static properties = { data: { type: Object } };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.data[0].active = true;
  }

  handleRestore() {
    const opts = { detail: { action: 'restore' }, bubbles: true, composed: true };
    const event = new CustomEvent('restore', opts);
    this.dispatchEvent(event);
  }

  handleCancel() {
    const opts = { detail: { action: 'close' }, bubbles: true, composed: true };
    const event = new CustomEvent('close', opts);
    this.dispatchEvent(event);
  }

  handleTab(clickedTab) {
    this.data.forEach((tab) => {
      tab.active = false;
    });
    clickedTab.active = true;
    this.requestUpdate();
  }

  renderTable(tab) {
    return html`
      <div class="table-wrapper ${tab.active ? 'is-active' : ''}">
        <table class="da-table da-table-${tab.sheetName}">
          ${tab.data.map((row) => html`
            <tr>
              ${row.map((col) => html`<td>${col}</td>`)}
            </tr>
          `)}
        </table>
      </div>
    `;
  }

  render() {
    return html`
      <div class="da-version-preview">
        <div class="da-version-action-area">
          <button @click=${this.handleCancel}>Cancel</button>
          <button class="accent" @click=${this.handleRestore}>Restore</button>
        </div>
        <div class="da-version-content">
          <div class="da-sheet-data-tabs">
            ${this.data.map((tab) => html`
              <button class="sheet-tab ${tab.active ? 'is-active' : ''}" @click=${() => this.handleTab(tab)}>
                ${tab.sheetName}
              </button>`)}
          </div>
          <div class="da-sheet-data-tables">
              ${this.data.map((tab) => this.renderTable(tab))}
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('da-version-review', DaVersionReview);
