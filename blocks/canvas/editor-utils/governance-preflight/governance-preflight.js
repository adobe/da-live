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
          class="gp-refresh ${this._loading ? 'is-loading' : ''}"
          ?disabled=${this._loading}
          aria-label="Re-evaluate page"
          title="Re-evaluate page"
          @click=${() => this.evaluate()}>
          <svg class="gp-icon"><use href="/img/icons/s2-icon-refresh-20-n.svg#icon"></use></svg>
        </button>
      </div>
      <div class="gp-card-scroll">
        <nx-governance-evaluation-card
          .evaluation=${this._evaluation}
          .loading=${this._loading}
          .error=${this._error}>
        </nx-governance-evaluation-card>
      </div>
    `;
  }
}

customElements.define('da-governance-preflight', DaGovernancePreflight);

export default function render(details) {
  const el = document.createElement('da-governance-preflight');
  el.details = details;
  return el;
}
