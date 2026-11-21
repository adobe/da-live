import { LitElement, html, nothing } from 'da-lit';
import { buildRevisionDiff } from './revision-diff.js';
import styles from './branch-diff-styles.js';

export class DaBranchDiff extends LitElement {
  static properties = {
    base: { attribute: false },
    defaultSide: { attribute: false },
    branch: { attribute: false },
    itemKind: { type: String },
    _against: { state: true },
    _showSource: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  get pair() {
    if (!this.defaultSide || !this.branch) return null;
    if (!this.base) return { before: this.defaultSide, after: this.branch, from: 'Default', to: 'Branch' };
    if (this._against === 'default') {
      return { before: this.base, after: this.defaultSide, from: 'Base', to: 'Default' };
    }
    return { before: this.base, after: this.branch, from: 'Base', to: 'Branch' };
  }

  willUpdate(changed) {
    if (!['base', 'defaultSide', 'branch', 'itemKind', '_against', '_showSource'].some((key) => changed.has(key))) return;
    const { pair } = this;
    this._visual = !this._showSource && pair
      ? buildRevisionDiff(pair.before, pair.after, this.itemKind) : undefined;
  }

  renderSource(label, value) {
    return html`<section class="source"><h4>${label}</h4>
      ${value.state === 'absent' ? html`<p>Absent</p>` : html`<pre>${value.text}</pre>`}
    </section>`;
  }

  render() {
    const { pair } = this;
    if (!pair) return nothing;
    const { before, after, from, to } = pair;
    const source = Boolean(this._showSource);
    return html`
      <div class="controls">
        ${this.base ? html`<div role="group" aria-label="Compare conflict revisions">
          <button type="button" aria-pressed=${this._against !== 'default'}
            @click=${() => { this._against = 'branch'; }}>Base → Branch</button>
          <button type="button" aria-pressed=${this._against === 'default'}
            @click=${() => { this._against = 'default'; }}>Base → Default</button>
        </div>` : nothing}
        <div role="group" aria-label="Comparison display">
          <button type="button" aria-pressed=${!source} @click=${() => { this._showSource = false; }}>Visual diff</button>
          <button type="button" aria-pressed=${source} @click=${() => { this._showSource = true; }}>Source</button>
        </div>
      </div>
      ${source ? html`<div class="sources">
        ${this.renderSource(from, before)}${this.renderSource(to, after)}
      </div>` : html`
        <div class="legend" aria-label="Diff legend">
          <del class="diffdel">Removed from ${from}</del>
          <ins class="diffins">Added in ${to}</ins>
          ${before.state === 'absent' ? html`<span>${from} is absent</span>` : nothing}
          ${after.state === 'absent' ? html`<span>${to} is absent</span>` : nothing}
        </div>
        ${this._visual?.message ? html`<p class="message">${this._visual.message}</p>` : nothing}
        ${this._visual?.dom || nothing}
      `}
    `;
  }
}

customElements.define('da-branch-diff', DaBranchDiff);
