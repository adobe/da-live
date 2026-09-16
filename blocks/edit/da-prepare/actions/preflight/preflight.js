import { LitElement, html, nothing } from 'da-lit';
import getSheet from '../../../../shared/sheet.js';
import { getPreflightProviders } from './registry.js';
import { buildRenderModel } from './render-model.js';
import { ICONS } from './utils/constants.js';

// Components
import './views/label.js';
import './views/link.js';
import '../../../../shared/da-dialog/da-dialog.js';

const sheet = await getSheet(import.meta.url.replace('js', 'css'));

const PAGE_SIZE = 5;

const BADGE_BY_TONE = { negative: 'error', positive: 'success', neutral: 'info' };

class DaPreflight extends LitElement {
  static properties = {
    details: { attribute: false },
    _providerCategories: { state: true },
    _pages: { state: true },
  };

  constructor() {
    super();
    this._pages = {};
  }

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

  _setPage(sectionIndex, page, total) {
    if (page < 0 || page * PAGE_SIZE >= total) return;
    this._pages = { ...this._pages, [sectionIndex]: page };
  }

  // Detail view for a single plain (non-component) result — no suggestion/copy-to-clipboard
  // flow, since we have no AI-suggested fix text to offer, unlike da-nx's page-evaluation.
  _openDetail(item) {
    const dialog = document.createElement('da-dialog');
    dialog.title = item.title;
    const message = document.createElement('div');
    message.className = 'pf-detail-message';
    const reason = document.createElement('p');
    reason.textContent = item.result.reason;
    message.append(reason);
    const category = document.createElement('p');
    category.className = 'pf-detail-category';
    category.textContent = `From: ${item.category}`;
    message.append(category);
    dialog.message = message;
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    document.body.append(dialog);
  }

  renderToneIcon(tone) {
    const icon = ICONS.get(BADGE_BY_TONE[tone] ?? 'info');
    return html`<svg class="pf-icon" viewBox="0 0 20 20"><use href="${icon}"></use></svg>`;
  }

  renderTile({ label, value, tone }) {
    return html`
      <div class="pf-tile">
        <span class="pf-tile-label">${label}</span>
        <span class="pf-tile-value pf-tone-${tone}">${value}</span>
      </div>`;
  }

  renderSummary(summary) {
    return html`<div class="pf-summary">${summary.map((tile) => this.renderTile(tile))}</div>`;
  }

  renderItem(item, hidden) {
    const { result } = item;
    const isCmp = result instanceof HTMLElement;
    return html`
      <div class="pf-item" ?hidden=${hidden}>
        <span class="pf-item-chip pf-tone-${item.tone}-bg">${this.renderToneIcon(item.tone)}</span>
        ${isCmp ? html`<div class="pf-item-body pf-item-body-cmp">${result}</div>` : html`
          <div class="pf-item-body">
            <span class="pf-item-title">${item.title}</span>
            <span class="pf-item-desc">${result.reason}</span>
          </div>
          <button class="pf-item-action" @click=${() => this._openDetail(item)}>View</button>
        `}
      </div>`;
  }

  renderPaging(sectionIndex, end, total) {
    const page = this._pages[sectionIndex] ?? 0;
    return html`
      <div class="pf-paging">
        <button
          class="pf-paging-btn pf-paging-prev"
          aria-label="Previous checks"
          ?disabled=${page === 0}
          @click=${() => this._setPage(sectionIndex, page - 1, total)}
        ></button>
        <span class="pf-paging-label">${end} of ${total} checks</span>
        <button
          class="pf-paging-btn pf-paging-next"
          aria-label="Next checks"
          ?disabled=${end >= total}
          @click=${() => this._setPage(sectionIndex, page + 1, total)}
        ></button>
      </div>`;
  }

  renderItems(items, sectionIndex) {
    const total = items.length;
    const page = this._pages[sectionIndex] ?? 0;
    const start = page * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, total);
    return html`
      <div class="pf-items">
        ${items.map((item, i) => this.renderItem(item, i < start || i >= end))}
        ${total > PAGE_SIZE ? this.renderPaging(sectionIndex, end, total) : nothing}
      </div>`;
  }

  renderSection(section, sectionIndex) {
    const { label, subLabel, tone, defaultOpen, items } = section;
    return html`
      <details class="pf-section" ?open=${defaultOpen}>
        <summary class="pf-section-header">
          <span class="pf-section-chip pf-tone-${tone}-bg">${this.renderToneIcon(tone)}</span>
          <div class="pf-section-labels">
            <span class="pf-section-label">${label}</span>
            <span class="pf-section-sublabel">${subLabel}</span>
          </div>
          <span class="pf-chevron"></span>
        </summary>
        ${items.length ? this.renderItems(items, sectionIndex) : nothing}
      </details>`;
  }

  render() {
    if (!this._providerCategories) return nothing;

    const categories = this._providerCategories.flatMap((category) => category ?? []);
    const { summary, sections } = buildRenderModel(categories);
    return html`
      <div class="preflight-inner">
        ${this.renderSummary(summary)}
        <div class="pf-sections">
          ${sections.map((section, i) => this.renderSection(section, i))}
        </div>
      </div>`;
  }
}

customElements.define('da-preflight', DaPreflight);

export default function render(details) {
  const cmp = document.createElement('da-preflight');
  cmp.details = details;
  return cmp;
}
