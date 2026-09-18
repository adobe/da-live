import { LitElement, html, nothing } from 'da-lit';
import getSheet from '../../../../shared/sheet.js';
import { getPreflightProviders } from './registry.js';
import { STATUS_TO_BADGE } from './utils/constants.js';

// Components
import './views/label.js';
import './views/link.js';

const sheet = await getSheet(import.meta.url.replace('js', 'css'));

// A single slow/hung provider shouldn't block the rest, or leave the user staring at a
// spinner — drop it past this point, same as a thrown error.
const PROVIDER_TIMEOUT_MS = 5000;

// Groups a flat list of checks (possibly from several providers) into categories, in the
// order each category title was first seen — no provider owns category ordering.
export function groupChecksByCategory(checks) {
  const order = [];
  const byTitle = new Map();
  checks.forEach((check) => {
    if (!byTitle.has(check.category)) {
      byTitle.set(check.category, []);
      order.push(check.category);
    }
    byTitle.get(check.category).push(check);
  });
  return order.map((title) => ({ title, checks: byTitle.get(title) }));
}

class DaPreflight extends LitElement {
  static properties = {
    details: { attribute: false },
    _providerChecks: { state: true },
  };

  constructor() {
    super();
    this._openCategories = new Map();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.listenForReasons();
    this.loadProviderChecks();
  }

  disconnectedCallback() {
    this._providerControllers?.forEach((controller) => controller.abort());
    super.disconnectedCallback();
  }

  listenForReasons() {
    this.addEventListener('reason', () => {
      this.requestUpdate();
    });
  }

  // Every provider settles independently, each under its own abort controller and
  // timeout — one slow/failed provider (e.g. a remote extended-checks call) doesn't hold
  // up the others' checks from appearing.
  async loadProviderChecks() {
    const requestUpdate = this.requestUpdate.bind(this);
    const providers = getPreflightProviders();
    this._providerChecks = providers.map(() => null);
    this._providerControllers = providers.map(() => new AbortController());

    providers.forEach(async (provider, index) => {
      const controller = this._providerControllers[index];
      const { signal } = controller;

      let timeoutId;
      const timeout = new Promise((resolve) => {
        timeoutId = setTimeout(() => {
          // eslint-disable-next-line no-console
          console.warn('[preflight] provider timed out', index);
          controller.abort();
          resolve(null);
        }, PROVIDER_TIMEOUT_MS);
      });

      let result = null;
      try {
        result = await Promise.race([
          provider(this.details, { signal, requestUpdate }),
          timeout,
        ]);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[preflight] provider failed', e);
      } finally {
        clearTimeout(timeoutId);
      }

      this._providerChecks[index] = result ?? [];
      requestUpdate();
    });
  }

  expandCategory(category) {
    const isOpen = this._openCategories.get(category.title) ?? false;
    this._openCategories.set(category.title, !isOpen);
    this.requestUpdate();
  }

  renderResultItem(result) {
    // ootb's link/fragment checks are the one exception that render their own component
    // instead of a plain status/reason row.
    const isCmp = result instanceof HTMLElement;
    if (isCmp) return html`<li class="result-item">${result}</li>`;

    // Otherwise return the simple result
    return html`
      <li class="result-item">
        <div>${result.reason}</div>
        <pf-label .badge=${STATUS_TO_BADGE[result.status]}></pf-label>
      </li>`;
  }

  renderLabels(checks, expand) {
    const items = checks.flatMap((check) => check.results ?? []);
    const groups = Object.groupBy(items, (item) => item.status);

    return Object.entries(groups).map(
      ([status, group]) => html`
        <pf-label
          @click=${expand}
          .badge=${STATUS_TO_BADGE[status]}
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
                return order.indexOf(a.status) - order.indexOf(b.status);
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
    if (!this._providerChecks) return nothing;

    const checks = this._providerChecks.flatMap((providerChecks) => providerChecks ?? []);
    const categories = groupChecksByCategory(checks).map((category) => ({
      ...category,
      open: this._openCategories.get(category.title) ?? false,
    }));

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
