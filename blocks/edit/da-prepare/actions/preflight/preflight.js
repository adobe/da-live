import { LitElement, html, nothing } from 'da-lit';
import getSheet from '../../../../shared/sheet.js';
import { loadDoc, loadResults } from './utils/utils.js';
import { canvasBus } from '../../../../canvas/utils/canvas-bus.js';

// Components
import './views/label.js';
import './views/link.js';

const sheet = await getSheet(import.meta.url.replace('js', 'css'));

class DaPreflight extends LitElement {
  static properties = {
    details: { attribute: false },
    _categories: { state: true },
    _status: { state: true },
    _validationResults: { state: true },
    _validationTimedOut: { state: true },
    _validationCategoryOpen: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.listenForReasons();
    this.loadResults();
    this._unsubscribeValidationResult = canvasBus.validationResultState
      .subscribe(({ items, timedOut }) => {
        this._validationResults = items;
        this._validationTimedOut = timedOut;
      });
    canvasBus.validationRunRequest.emit();
  }

  disconnectedCallback() {
    this._unsubscribeValidationResult?.();
    super.disconnectedCallback();
  }

  listenForReasons() {
    this.addEventListener('reason', () => {
      this.requestUpdate();
    });
  }

  async loadResults() {
    const { error, doc } = await loadDoc(this.details);
    if (error) {
      this._status = error;
      return;
    }
    const requestUpdate = this.requestUpdate.bind(this);
    this._categories = loadResults(doc, requestUpdate);
  }

  get _validationCategory() {
    let results;
    if (this._validationTimedOut) {
      results = [{ reason: 'Content validation timed out or is unavailable.', badge: 'warn' }];
    } else if (!this._validationResults) {
      results = [];
    } else if (this._validationResults.length === 0) {
      results = [{ reason: 'No content-validation issues found.', badge: 'success' }];
    } else {
      results = this._validationResults.map(
        ({ severity, message }) => ({ reason: message, badge: severity }),
      );
    }
    return {
      title: 'Custom',
      open: this._validationCategoryOpen,
      checks: [{ title: 'Content validation', results }],
    };
  }

  expandCategory(cat) {
    if (cat.title === 'Custom') {
      this._validationCategoryOpen = !this._validationCategoryOpen;
    } else {
      cat.open = !cat.open;
    }
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

    const categories = [...this._categories, this._validationCategory];
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
