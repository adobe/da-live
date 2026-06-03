import { html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { DA_ORIGIN } from '../../shared/constants.js';
import getSheet from '../../shared/sheet.js';
import DaVersionsBase from '../../shared/version/da-versions-base.js';
import { docToHtml, fetchVersionDom, buildCompareDom, renderCompareModal } from '../../shared/version/compare.js';
import { versionPreviewChange } from '../editor-utils/editor-utils.js';
import { getExtensionsBridge } from '../editor-utils/extensions-bridge.js';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);
const style = await loadStyle(import.meta.url);

let compareSheetPromise;
function loadCompareSheet() {
  compareSheetPromise ??= getSheet('/blocks/shared/version/compare.css');
  return compareSheetPromise;
}

class EwVersionHistory extends DaVersionsBase {
  static properties = {
    _compareDom: { state: true },
    _compareLabel: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._unsubHash = hashChange.subscribe((state) => {
      const { org, site, path } = state ?? {};
      this.path = org && site && path ? `/${org}/${site}/${path}.html` : null;
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubHash?.();
  }

  // Trigger fetch when path changes (panel never uses the open prop)
  update(changedProps) {
    if (changedProps.has('path') && this.path) this.getVersions();
    super.update();
  }

  // Override: emit to signal instead of bubbling a DOM event
  handlePreview(e, entry) {
    e.stopPropagation();
    versionPreviewChange.emit({ url: `${DA_ORIGIN}${entry.url}`, label: entry.label, date: entry.date });
  }

  async handleCompare(e, entry) {
    e.stopPropagation();
    const { view } = getExtensionsBridge();
    if (!view) return;

    const [versionEl, compareSheet] = await Promise.all([
      fetchVersionDom(`${DA_ORIGIN}${entry.url}`),
      loadCompareSheet(),
    ]);
    if (!versionEl) return;

    if (!this.shadowRoot.adoptedStyleSheets.includes(compareSheet)) {
      this.shadowRoot.adoptedStyleSheets = [...this.shadowRoot.adoptedStyleSheets, compareSheet];
    }

    this.handleCloseCompare();
    const { dom, cleanup } = await buildCompareDom({
      htmlA: docToHtml(view),
      htmlB: versionEl.innerHTML,
      onClose: () => this.handleCloseCompare(),
    });
    this._compareDom = dom;
    this._compareCleanup = cleanup;
    this._compareLabel = entry.label || entry.date || 'Version';
  }

  handleCloseCompare() {
    this._compareCleanup?.();
    this._compareCleanup = null;
    this._compareDom = null;
    this._compareLabel = null;
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
        <div class="version-actions">
          <button class="compare-btn" @click=${(e) => this.handleCompare(e, entry)}>Compare</button>
          <button class="restore-btn" @click=${(e) => this.handlePreview(e, entry)}>Restore</button>
        </div>
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
    if (!this.path) {
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
        ${this._compareDom ? renderCompareModal({
        labelA: 'Current document',
        labelB: this._compareLabel,
        compareDom: this._compareDom,
        onClose: () => this.handleCloseCompare(),
      }) : nothing}
      </div>
    `;
  }
}

customElements.define('ew-version-history', EwVersionHistory);
