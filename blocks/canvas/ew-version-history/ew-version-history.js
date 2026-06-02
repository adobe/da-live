import { html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { DA_ORIGIN } from '../../shared/constants.js';
import DaVersionsBase from '../../shared/version/da-versions-base.js';
import { versionPreviewChange } from '../editor-utils/editor-utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const style = await loadStyle(import.meta.url);

class EwVersionHistory extends DaVersionsBase {
  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  // Override: emit directly to signal instead of bubbling a DOM event
  handlePreview(e, entry) {
    e.stopPropagation();
    versionPreviewChange.emit({ url: `${DA_ORIGIN}${entry.url}`, label: entry.label, date: entry.date });
  }

  renderVersionItem(entry) {
    const users = entry.users?.map((u) => u.email).join(', ');
    return html`
      <li class="version-item">
        <div class="version-meta">
          <span class="version-date">${entry.date}</span>
          ${entry.label ? html`<span class="version-label">${entry.label}</span>` : nothing}
          <span class="version-secondary">${entry.time}${users ? html` · ${users}` : nothing}</span>
        </div>
        <button class="restore-btn" @click=${(e) => this.handlePreview(e, entry)}>Restore</button>
      </li>
    `;
  }

  renderAuditGroup(entry) {
    return html`
      <li class="audit-group">
        <span class="audit-date">${entry.date}</span>
        <ul class="audit-list">
          ${entry.audits.map((a) => html`
            <li class="audit-entry">
              <span class="audit-time">${a.time}</span>
              <span class="audit-users">${a.users.map((u) => u.email).join(', ')}</span>
            </li>
          `)}
        </ul>
      </li>
    `;
  }

  renderCreateRow() {
    if (this._newVersion) {
      return html`
        <li class="version-new">
          <form @submit=${this.handleNewSubmit}>
            <input type="text" name="label" placeholder="Label (optional)" class="label-input" />
            <div class="form-actions">
              <button type="submit" class="btn-save">Save</button>
              <button type="button" class="btn-cancel" @click=${this.handleCancel}>Cancel</button>
            </div>
          </form>
        </li>
      `;
    }
    return html`
      <li class="version-create">
        <button @click=${this.handleNew}>+ Create version</button>
      </li>
    `;
  }

  render() {
    if (!this._effectivePath) {
      return html`<div class="ew-version-history">
        <p class="placeholder">Select a page to see its history.</p>
      </div>`;
    }
    return html`
      <div class="ew-version-history">
        <div class="list-wrap">
          <ul class="version-list">
            ${this.renderCreateRow()}
            ${this._loading ? html`<li class="status-msg">Loading…</li>` : nothing}
            ${this._versions?.map((entry) => (entry.isVersion
              ? this.renderVersionItem(entry)
              : this.renderAuditGroup(entry)))}
          </ul>
        </div>
      </div>
    `;
  }
}

customElements.define('ew-version-history', EwVersionHistory);
