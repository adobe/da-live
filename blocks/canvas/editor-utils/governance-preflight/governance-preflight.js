import { LitElement, html } from 'da-lit';
import { getNx } from '../../../../scripts/utils.js';
import { getAuthToken } from '../../../shared/utils.js';
import { evaluatePage } from './index.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
// Reuse the governance card from da-nx (side-effect defines nx-governance-evaluation-card).
await import(`${getNx()}/blocks/chat/messages/governance-evaluation-card.js`);

const style = await loadStyle(import.meta.url);

class DaGovernancePreflight extends LitElement {
  static properties = {
    details: { attribute: false },
    _evaluation: { state: true },
    _loading: { state: true },
    _error: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.evaluate();
  }

  async evaluate() {
    if (this._loading) return;
    this._loading = true;
    this._error = undefined;
    const { org, site, path } = this.details;
    const token = await getAuthToken();
    const { json, error } = await evaluatePage({ org, site, path, token });
    if (error) {
      this._error = error;
    } else {
      this._evaluation = json;
    }
    this._loading = false;
  }

  render() {
    return html`
      <div class="gp-toolbar">
        <button
          class="gp-refresh"
          ?disabled=${this._loading}
          @click=${() => this.evaluate()}>
          ${this._loading ? 'Evaluating…' : 'Refresh'}
        </button>
      </div>
      <nx-governance-evaluation-card
        .evaluation=${this._evaluation}
        .loading=${this._loading}
        .error=${this._error}>
      </nx-governance-evaluation-card>
    `;
  }
}

customElements.define('da-governance-preflight', DaGovernancePreflight);

export default function render(details) {
  const el = document.createElement('da-governance-preflight');
  el.details = details;
  return el;
}
