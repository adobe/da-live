import { LitElement, html, nothing } from 'da-lit';
import getSheet from '../../../../shared/sheet.js';
import { getNx2 } from '../../../../../scripts/utils.js';
import { loadProviderResults } from './providers/provider-registry.js';
import { buildPreflightContext } from './providers/context.js';
import {
  isItemSettled,
  isHiddenItem,
  buildLoadErrorCategories,
  computeOverallStatus,
  LOAD_TIMEOUT_MS,
} from './providers/engine.js';

import './views/label.js';
import { SEVERITY } from './views/result.js';

const sheet = await getSheet(import.meta.url.replace('js', 'css'));
const { PREFLIGHT_EVENT } = await import(`${getNx2()}/utils/preflight-events.js`);

const SEVERITY_ORDER = [
  SEVERITY.ERROR, SEVERITY.WARN, SEVERITY.INFO, SEVERITY.SUCCESS, SEVERITY.NA,
];

class DaPreflight extends LitElement {
  static properties = {
    details: { attribute: false },
    requestId: { attribute: false },
    _categories: { state: true },
  };

  constructor() {
    super();
    this._statusEmitted = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.loadResults();
  }

  async loadResults() {
    this._statusEmitted = false;

    try {
      const signal = AbortSignal.timeout(LOAD_TIMEOUT_MS);
      this._categories = await loadProviderResults({
        context: buildPreflightContext({ details: this.details, signal }),
        signal,
        onUpdate: () => this.handleProviderUpdate(),
      });
    } catch (err) {
      this._categories = buildLoadErrorCategories(err);
    }

    this.requestUpdate();
    this.maybeEmitStatus();
  }

  handleProviderUpdate() {
    this.requestUpdate();
    this.maybeEmitStatus();
  }

  maybeEmitStatus() {
    if (this._statusEmitted || !this._categories) return;

    const status = computeOverallStatus(this._categories);
    if (!status) return;

    this._statusEmitted = true;
    const detail = { path: this.details?.fullpath, status, requestId: this.requestId };
    document.dispatchEvent(new CustomEvent(PREFLIGHT_EVENT.STATUS, { detail }));
  }

  expandCategory(category) {
    category.open = !category.open;
    this.requestUpdate();
  }

  renderItem(item) {
    return html`<li class="result-item">${item}</li>`;
  }

  renderLabels(checks, expand) {
    const items = checks.flatMap((check) => check.items ?? [])
      .filter((item) => isItemSettled(item) && !isHiddenItem(item));
    const groups = Object.groupBy(items, (item) => item.result);

    return SEVERITY_ORDER.filter((badge) => groups[badge]?.length).map(
      (badge) => html`
        <pf-label
          @click=${expand}
          .badge=${badge}
          .clickable=${true}
          .text=${groups[badge].length}>
        </pf-label>`,
    );
  }

  renderChecks(checks) {
    return html`
      <ul class="category-details">
        ${checks.map((check) => {
          const items = check.items.filter((item) => !isHiddenItem(item));
          if (items.length === 0) return nothing;

          return html`
            <li class="sub-category">
              <p class="check-label">${check.title}</p>
              <ul>
                ${items.toSorted((a, b) => SEVERITY_ORDER.indexOf(a.result) - SEVERITY_ORDER.indexOf(b.result))
                  .map((item) => this.renderItem(item))}
              </ul>
            </li>
          `;
        })}
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
    if (!this._categories) return nothing;

    return html`
      <div class="preflight-inner">
        <ul class="categories">
          ${this._categories.map((category) => this.renderCategory(category))}
        </ul>
      </div>`;
  }
}

customElements.define('da-preflight', DaPreflight);

export default function render(details, requestId) {
  const cmp = document.createElement('da-preflight');
  cmp.details = details;
  if (requestId) cmp.requestId = requestId;
  return cmp;
}
