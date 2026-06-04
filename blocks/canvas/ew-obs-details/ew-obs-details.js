import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const style = await loadStyle(import.meta.url);

function md2html(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/gs, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
    .replace(/\n/g, '<br>');
}

class EwObsDetails extends LitElement {
  static properties = {
    obs: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  updated() {
    const el = this.shadowRoot.querySelector('.od-markdown');
    if (el) el.innerHTML = md2html(this.obs?.businessImpact ?? '');
  }

  _field(label, value) {
    if (!value) return nothing;
    return html`
      <div class="od-field">
        <p class="od-label">${label}</p>
        <p class="od-value">${value.replace(/_/g, ' ')}</p>
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
        ${o.businessImpact ? html`
          <div class="od-field">
            <p class="od-label">Business impact</p>
            <div class="od-markdown od-value"></div>
          </div>` : nothing}
      </div>`;
  }
}

customElements.define('ew-obs-details', EwObsDetails);
