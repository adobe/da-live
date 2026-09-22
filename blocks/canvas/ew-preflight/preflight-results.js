import { LitElement, html, nothing } from 'da-lit';
import getSheet from '../../shared/sheet.js';
import '../../edit/da-prepare/actions/preflight/views/label.js';

const sheet = await getSheet(import.meta.url.replace('js', 'css'));

const CHEVRON_ICON = '/blocks/edit/img/S2_Icon_ChevronRight_20_N.svg#S2_Icon_ChevronRight';

class PreflightResults extends LitElement {
  static properties = {
    data: { attribute: false },
    // Identifies a run (e.g. ew-preflight.js's _runId). adaptPreflightResults() builds a new
    // `data` object on every progressive update within the same run, so object identity can't
    // tell "new run" apart from "same run settling further" - runId can.
    runId: { attribute: false },
    _open: { state: true },
  };

  constructor() {
    super();
    this._open = new Set();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  // Re-derive the default-open set only when a new run starts, leaving the user's own
  // expand/collapse choices alone across progressive updates within the same run.
  willUpdate(changed) {
    if (changed.has('runId') && this.data) {
      this._open = new Set(
        this.data.sections.filter((section) => section.defaultOpen).map((section) => section.label),
      );
    }
  }

  toggleSection(label) {
    const open = new Set(this._open);
    if (open.has(label)) open.delete(label);
    else open.add(label);
    this._open = open;
  }

  renderTile(tile) {
    return html`
      <div class="pfr-tile">
        <span class="pfr-tile-label">${tile.label}</span>
        <span class="pfr-tile-value pfr-severity-${tile.severity}">${tile.value}</span>
      </div>`;
  }

  renderEntry(entry) {
    return html`
      <li class="pfr-entry">
        <div class="pfr-entry-header">
          <span class="pfr-entry-title">${entry.title}</span>
          ${entry.category ? html`<span class="pfr-entry-category">${entry.category}</span>` : nothing}
        </div>
        <div class="pfr-entry-body">${entry.item}</div>
      </li>`;
  }

  renderSection(section) {
    const open = this._open.has(section.label);
    return html`
      <li class="pfr-section ${open ? 'is-open' : ''}">
        <button type="button" class="pfr-section-header" @click=${() => this.toggleSection(section.label)}>
          <pf-label class="pfr-section-badge" .badge=${section.severity}></pf-label>
          <span class="pfr-section-labels">
            <span class="pfr-section-label">${section.label}</span>
            <span class="pfr-section-sublabel">${section.subLabel}</span>
          </span>
          <svg class="pfr-chevron" aria-hidden="true" viewBox="0 0 20 20"><use href="${CHEVRON_ICON}"></use></svg>
        </button>
        ${open && section.entries.length ? html`
          <ul class="pfr-entries">
            ${section.entries.map((entry) => this.renderEntry(entry))}
          </ul>
        ` : nothing}
      </li>`;
  }

  render() {
    if (!this.data) return nothing;
    const { summary, sections } = this.data;

    return html`
      <div class="pfr">
        <div class="pfr-summary">${summary.map((tile) => this.renderTile(tile))}</div>
        <ul class="pfr-sections">${sections.map((section) => this.renderSection(section))}</ul>
      </div>`;
  }
}

customElements.define('preflight-results', PreflightResults);
