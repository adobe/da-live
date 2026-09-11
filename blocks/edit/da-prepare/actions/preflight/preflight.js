import { LitElement, html, nothing } from 'da-lit';
import getSheet from '../../../../shared/sheet.js';
import { getNx2 } from '../../../../../scripts/utils.js';
import { loadDoc, loadResults } from './utils/utils.js';
import { REASONS } from './utils/constants.js';

// Components
import './views/label.js';
import './views/link.js';

const sheet = await getSheet(import.meta.url.replace('js', 'css'));
// Shared cross-repo Preflight ↔ Publish contract (single source lives in da-nx).
const { PREFLIGHT_EVENT } = await import(`${getNx2()}/utils/preflight-events.js`);

class DaPreflight extends LitElement {
  static properties = {
    details: { attribute: false },
    requestId: { attribute: false },
    _categories: { state: true },
    _status: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.listenForReasons();
    this.loadResults();
  }

  listenForReasons() {
    this.addEventListener('reason', () => {
      this.requestUpdate();
      this.maybeEmitStatus();
    });
  }

  async loadResults() {
    const { error, doc } = await loadDoc(this.details);
    if (error) {
      this._status = error;
      return;
    }
    const requestUpdate = () => {
      this.requestUpdate();
      this.maybeEmitStatus();
    };
    this._categories = loadResults(doc, requestUpdate);
    this.maybeEmitStatus();
  }

  static isResultSettled(result) {
    if (result instanceof HTMLElement) {
      return result.reason !== REASONS['link.working'].reason;
    }
    return true;
  }

  maybeEmitStatus() {
    if (this._statusEmitted || !this._categories) return;

    const checks = this._categories.flatMap((category) => category.checks);
    const complete = checks.every((check) => check.done
      && check.results.every((result) => DaPreflight.isResultSettled(result)));
    if (!complete) return;

    const badges = checks.flatMap((check) => check.results.map((result) => result.badge));
    const status = badges.includes('error') ? 'fail' : 'success';

    this._statusEmitted = true;
    const detail = { path: this.details?.fullpath, status, requestId: this.requestId };
    document.dispatchEvent(new CustomEvent(PREFLIGHT_EVENT.STATUS, { detail }));
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
