import { LitElement, html, nothing } from 'da-lit';
import getSheet from '../../../../shared/sheet.js';
import { getPreflightProviders } from './registry.js';

// Components
import './views/label.js';
import './views/link.js';

const sheet = await getSheet(import.meta.url.replace('js', 'css'));

class DaPreflight extends LitElement {
  static properties = {
    details: { attribute: false },
    _providerCategories: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.listenForReasons();
    this._providerAbortController = new AbortController();
    this.loadProviderCategories();
  }

  disconnectedCallback() {
    this._providerAbortController?.abort();
    super.disconnectedCallback();
  }

  listenForReasons() {
    this.addEventListener('reason', () => {
      this.requestUpdate();
    });
  }

  // Every provider settles independently — one slow/failed provider (e.g. a remote
  // extended-checks call) doesn't hold up the others' categories from appearing.
  async loadProviderCategories() {
    const { signal } = this._providerAbortController;
    const requestUpdate = this.requestUpdate.bind(this);
    const providers = getPreflightProviders();
    this._providerCategories = providers.map(() => null);
    providers.forEach(async (provider, index) => {
      let result = null;
      try {
        result = await provider(this.details, { signal, requestUpdate });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[preflight] provider failed', e);
      }
      if (signal.aborted) return;
      this._providerCategories[index] = result;
      requestUpdate();
    });
  }

  expandCategory(cat) {
    cat.open = !cat.open;
    this.requestUpdate();
  }

  renderResultItem(result) {
    // Complex results will have their own web component
    const isCmp = result instanceof HTMLElement;
    if (isCmp) return html`<li class="result-item">${result}</li>`;

    // Otherwise return the simple result
    return html`
      <li class="result-item">
        <div>${result.reason}</div>
        <pf-label .badge=${result.badge}></pf-label>
      </li>`;
  }

  renderLabels(checks, expand) {
    const items = checks.flatMap((check) => check.results ?? []);
    const groups = Object.groupBy(items, (item) => item.badge);

    return Object.entries(groups).map(
      ([badge, group]) => html`
        <pf-label
          @click=${expand}
          .badge=${badge}
          .text=${group.length}>
        </pf-label>`,
    );
  }

  renderChecks(checks) {
    return html`
      <ul class="category-details">
        ${checks.map((check) => html`
          <li class="sub-category">
            <p class="check-label">${check.title}</p>
            <ul>
              ${check.results.toSorted((a, b) => {
                const order = ['error', 'warn', 'info', 'success'];
                return order.indexOf(a.badge) - order.indexOf(b.badge);
              }).map((result) => this.renderResultItem(result))}
            </ul>
          </li>
        `)}
      </ul>`;
  }

  renderCategory(category) {
    const { title, checks, open } = category;
    const expand = () => this.expandCategory(category);

    return html`
      <li class="category ${open ? 'is-open' : ''}">
        <div class="category-header">
          <button class="category-title" @click=${expand}>${title}</button>
          <div class="category-labels">
            ${this.renderLabels(checks, expand)}
          </div>
        </div>
        ${this.renderChecks(checks)}
      </li>`;
  }

  render() {
    if (!this._providerCategories) return nothing;

    const categories = this._providerCategories.flatMap((category) => category ?? []);
    return html`
      <div class="preflight-inner">
        <ul class="categories">
          ${categories.map((category) => this.renderCategory(category))}
        </ul>
      </div>`;
  }
}

customElements.define('da-preflight', DaPreflight);

export default function render(details) {
  const cmp = document.createElement('da-preflight');
  cmp.details = details;
  return cmp;
}
