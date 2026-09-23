import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import '../ew-canvas-versions/ew-canvas-compare.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const style = await loadStyle(import.meta.url);
const base = await loadStyle(new URL('../../shared/styles/base.css', import.meta.url).href);

class EwComparison extends LitElement {
  static properties = {
    candidate: { type: String },
    path: { type: String },
    diffDom: { attribute: false },
    loading: { state: true },
    error: { state: true },
    stale: { state: true },
    identical: { state: true },
    missingLive: { state: true },
    loadedAt: { state: true },
    split: { state: true },
  };

  constructor() {
    super();
    this.loading = true;
    this.split = true;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [base, style];
  }

  focusHeading() {
    this.shadowRoot.querySelector('h2')?.focus();
  }

  render() {
    return html`
      <section class="comparison" aria-label="Page comparison" @keydown=${(e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.onClose();
    }
  }}>
        <header>
          <div><h2 tabindex="-1">Review changes</h2><p class="path">${this.path}</p></div>
          <button class="da-btn-secondary" ?disabled=${this.loading} @click=${() => this.onRefresh()}>Refresh comparison</button>
          ${!this.diffDom ? html`<button class="da-btn-secondary" @click=${() => this.onClose()}>Close</button>` : nothing}
        </header>
        <div class="status" role="status" aria-live="polite">
          ${this.loading ? 'Loading comparison…' : nothing}
          ${this.error ? html`<p class="error">${this.error}</p>` : nothing}
          ${this.stale ? html`<p class="stale">The document changed. Refresh to review the latest edits.</p>` : nothing}
          ${this.missingLive ? html`<p>This page is not published yet. All content is new.</p>` : nothing}
          ${this.identical ? html`<p>No content differences.</p>` : nothing}
          ${this.loadedAt ? html`<p>Compared at ${this.loadedAt}.</p>` : nothing}
        </div>
        ${this.diffDom ? html`
          <ew-canvas-compare .embedded=${true} .split=${this.split}
            .currentLabel=${'Live'} .label=${this.candidate === 'document' ? 'Current document' : 'Preview'}
            .diffDom=${this.diffDom} .canWrite=${false}
            @close=${() => this.onClose()}
            @toggle-split=${() => { this.split = !this.split; }}></ew-canvas-compare>
        ` : nothing}
      </section>`;
  }
}

customElements.define('ew-comparison', EwComparison);
