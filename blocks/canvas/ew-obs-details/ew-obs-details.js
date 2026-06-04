import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const style = await loadStyle(import.meta.url);

class EwObsDetails extends LitElement {
  static properties = {
    obs: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  _field(label, value) {
    if (!value) return nothing;
    return html`
      <div class="od-field">
        <p class="od-label">${label}</p>
        <p class="od-value">${value}</p>
      </div>`;
  }

  render() {
    const o = this.obs;
    if (!o) return html`<p class="od-empty">No observation data.</p>`;
    return html`
      <div class="od-body">
        ${this._field('Description', o.description)}
        ${this._field('Summary', o.summary)}
        ${this._field('Classification', o.classification)}
        ${this._field('Status', o.status)}
        ${this._field('Priority', o.priority)}
        ${this._field('Confidence', o.confidence)}
        ${this._field('Recommended action', o.recommendedAction)}
        ${this._field('Rationale', o.recommendedActionRationale)}
        ${this._field('Business impact', o.businessImpact)}
      </div>`;
  }
}

customElements.define('ew-obs-details', EwObsDetails);
