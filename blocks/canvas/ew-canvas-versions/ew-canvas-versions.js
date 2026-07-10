import { LitElement, html, nothing } from 'da-lit';
import { DOMParser as PMDOMParser } from 'da-y-wrapper';
import { getNx } from '../../../scripts/utils.js';
import {
  fetchVersions,
  newVersionEntry,
  createVersion,
  fetchVersionHtml,
} from '../../shared/version/version-actions.js';
import { docToHtml, buildCompareDom } from '../../shared/version/compare.js';
import { getExtensionsBridge } from '../editor-utils/extensions-bridge.js';
import getSheet from '../../shared/sheet.js';

const ICON_ADD = '/img/icons/s2-icon-addcircle-20-n.svg';
const ICON_MORE = '/img/icons/s2-icon-more-20-n.svg';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);
await import(`${getNx()}/blocks/shared/menu/menu.js`);
await import(`${getNx()}/blocks/shared/dialog/dialog.js`);
const style = await loadStyle(import.meta.url);
const baseStyle = await loadStyle(new URL('../../shared/styles/base.css', import.meta.url).href);

let compareSheetPromise;
function loadCompareSheet() {
  compareSheetPromise ??= getSheet('/blocks/shared/version/compare.css');
  return compareSheetPromise;
}

class EwCanvasVersions extends LitElement {
  static properties = {
    path: { type: String },
    _filter: { state: true },
    _versions: { state: true },
    _newVersion: { state: true },
    _restoreEntry: { state: true },
    _compareDom: { state: true },
    _compareLabel: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [baseStyle, style];
    this._filter = 'all';
    this._unsubHash = hashChange.subscribe((state) => {
      const { org, site, path } = state ?? {};
      const next = org && site && path ? `/${org}/${site}/${path}.html` : '';
      if (next !== this.path) {
        this.path = next;
        if (next) this._load();
      }
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubHash?.();
  }

  async _load() {
    this._versions = undefined;
    this._versions = await fetchVersions(this.path);
  }

  _setFilter(val) {
    this._filter = val;
  }

  handleNew(e) {
    e.target.disabled = true;
    this._newVersion = newVersionEntry();
  }

  async handleNewSubmit(e) {
    e.preventDefault();
    const label = e.target.elements.label?.value || '';
    const ok = await createVersion(this.path, label);
    if (!ok) return;
    this._newVersion = null;
    this._load();
  }

  handleCancel() {
    this._newVersion = null;
  }

  handleRestoreClick(entry) {
    this._restoreEntry = entry;
  }

  handleRestoreCancel() {
    this._restoreEntry = null;
  }

  async handleRestoreConfirm() {
    const entry = this._restoreEntry;
    this._restoreEntry = null;
    const { view } = getExtensionsBridge();
    if (!view) return;
    const versionBody = await fetchVersionHtml(this.path, entry);
    if (!versionBody) return;
    const newDoc = PMDOMParser.fromSchema(view.state.schema).parse(versionBody);
    const { doc } = view.state;
    view.dispatch(view.state.tr.replaceWith(0, doc.content.size, newDoc.content));
  }

  async handleCompare(e, entry) {
    e.stopPropagation();
    const { view } = getExtensionsBridge();
    if (!view) return;

    const [versionBody, compareSheet] = await Promise.all([
      fetchVersionHtml(this.path, entry),
      loadCompareSheet(),
    ]);
    if (!versionBody) return;

    if (!this.shadowRoot.adoptedStyleSheets.includes(compareSheet)) {
      this.shadowRoot.adoptedStyleSheets = [...this.shadowRoot.adoptedStyleSheets, compareSheet];
    }

    this.handleCloseCompare();
    const { dom, cleanup } = await buildCompareDom({
      htmlA: docToHtml(view),
      htmlB: versionBody.innerHTML,
      onClose: () => this.handleCloseCompare(),
    });
    this._compareDom = dom;
    this._compareCleanup = cleanup;
    this._compareLabel = entry.label || entry.date;
  }

  handleCloseCompare() {
    this._compareCleanup?.();
    this._compareCleanup = null;
    this._compareDom = null;
    this._compareLabel = null;
  }

  get _filteredVersions() {
    if (!this._versions) return [];
    if (this._filter === 'all') return this._versions;
    // TODO: filter by current IMS user email
    return this._versions;
  }

  // Merge consecutive audit groups (which helpers.js splits by date) into one
  // display group per contiguous run, so the UI shows one expand/collapse for all.
  _buildDisplayItems(versions) {
    const items = [];
    let auditGroup = null;
    for (const entry of versions) {
      if (entry.isVersion) {
        if (auditGroup) {
          items.push(auditGroup);
          auditGroup = null;
        }
        items.push(entry);
      } else {
        if (!auditGroup) auditGroup = { audits: [] };
        auditGroup.audits.push(...entry.audits);
      }
    }
    if (auditGroup) items.push(auditGroup);
    return items;
  }

  // --- render helpers ---

  renderNow() {
    return html`
      <li class="versionentry is-current">
        <span class="versionicon">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <use href="/img/icons/s2-icon-targetsmall-20-n.svg#icon"></use>
        </svg>
        </span>
        <span class="versionname">Current</span>
      </li>
    `;
  }

  renderVersion(entry) {
    const isPublished = !!entry.published;
    const users = entry.users?.map((u) => u.email).join(', ');
    const menuItems = [
      { section: 'Actions' },
      { id: 'restore', label: 'Restore', icon: 'revert' },
      { id: 'compare', label: 'Compare', icon: 'gridcompare' },
    ];
    return html`
      <li class="versionentry is-version${isPublished ? ' is-published' : ''}">
              <span class="versionicon">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <use href="/img/icons/s2-icon-targetsmall-20-n.svg#icon"></use>
        </svg>
        </span>
        <div class="version-row">
          <div class="ew-cv-body">
            <span class="versionname">${isPublished ? 'Published' : (entry.label || entry.date)}</span>
            <span class="meta">${entry.date}, ${entry.time}</span>
            ${users ? html`<span class="user">${users}</span>` : nothing}
          </div>
          <nx-menu .items=${menuItems}
            @select=${(e) => {
        if (e.detail.id === 'restore') this.handleRestoreClick(entry);
        else this.handleCompare(e, entry);
      }}>
            <button slot="trigger" type="button" class="version-more-btn" aria-label="More actions">
              <svg class="icon" viewBox="0 0 20 20" aria-hidden="true">
                <use href="${ICON_MORE}#icon"></use>
              </svg>
            </button>
          </nx-menu>
        </div>
      </li>
    `;
  }

  renderAudits(entry) {
    const auditLength = entry.audits.length;
    return html`
      <li class="versionentry">
        <details open>
          <summary>
            <span class="versionname">${auditLength} change${auditLength > 1 ? 's' : ''}</span>
          </summary>
          <ul class="auditlist">
            ${entry.audits.map((a) => html`
              <li class="audititem">
                <span class="meta">${a.date}, ${a.time}</span>
                ${a.users?.length ? html`<span class="user">${a.users[0].email}</span>` : nothing}
              </li>
            `)}
          </ul>
        </details>
      </li>
    `;
  }

  renderNewVersion() {
    const { date } = this._newVersion;
    return html`
      <li class="ew-cv-entry is-new">
        <div class="ew-cv-body">
          <form class="ew-cv-new-form" @submit=${this.handleNewSubmit}>
            <input type="text" name="label" placeholder="Version name"
              class="ew-cv-new-input" autofocus />
            <div class="ew-cv-new-actions">
              <button type="button" class="da-btn-secondary"
                @click=${this.handleCancel}>Cancel</button>
              <button type="submit" class="da-btn-primary">Save</button>
            </div>
          </form>
          <span class="ew-cv-meta">${date}</span>
        </div>
      </li>
    `;
  }

  renderRestoreDialog() {
    const label = this._restoreEntry?.label || this._restoreEntry?.date || 'this version';
    return html`
      <nx-dialog class="ew-cv-restore" title="Restore version"
        @close=${this.handleRestoreCancel}>
        <span>Replace the current document with the content from <strong>${label}</strong>?</span>
        <button slot="actions" class="da-btn-secondary"
          @click=${this.handleRestoreCancel}>Cancel</button>
        <button slot="actions" class="da-btn-primary"
          @click=${this.handleRestoreConfirm}>Restore</button>
      </nx-dialog>
    `;
  }

  render() {
    if (!this.path) {
      return html`
        <div class="ew-canvas-versions">
          <p class="placeholder">Select a page to see its version history.</p>
        </div>
      `;
    }

    return html`
      <div class="ew-canvas-versions">
        <div class="toolbar">
          <div class="segment" role="group" aria-label="Filter versions">
            <button type="button"
              class="seg-btn${this._filter === 'all' ? ' is-selected' : ''}"
              @click=${() => this._setFilter('all')}>All</button>
            <button type="button"
              class="seg-btn${this._filter === 'me' ? ' is-selected' : ''}"
              @click=${() => this._setFilter('me')}>Only me</button>
          </div>
          <button type="button" class="ew-cv-add-btn" aria-label="Create version"
            ?disabled=${!!this._newVersion} @click=${this.handleNew}>
            <svg class="icon" viewBox="0 0 20 20" aria-hidden="true">
              <use href="${ICON_ADD}#icon"></use>
            </svg>
          </button>
        </div>
        <p class="hint">Press ⌘ + ⌥ + S to add to version history while editing.</p>
        ${this._versions === undefined
        ? html`<p class="loading">Loading…</p>`
        : html`<ul class="versionlist">
              ${this._newVersion ? this.renderNewVersion() : this.renderNow()}
              ${this._buildDisplayItems(this._filteredVersions).map((entry) => (
          entry.isVersion ? this.renderVersion(entry) : this.renderAudits(entry)
        ))}
            </ul>`}
      </div>
      ${this._restoreEntry ? this.renderRestoreDialog() : nothing}
      ${this._compareDom ? html`
        <nx-dialog class="ew-cv-compare" @close=${this.handleCloseCompare}>
          <div class="ew-cv-compare-header">
          <h2>Compare with current document</h2>
              <button class="da-btn-secondary" aria-label="Close"
              @click=${() => this.shadowRoot.querySelector('nx-dialog.ew-cv-compare').close()}>Close</button>
          </div>
          <div class="da-compare-key">
            <del class="diffdel">Current</del>
            <ins class="diffins">${this._compareLabel}</ins>
          </div>
          <div class="da-compare-body ProseMirror">${this._compareDom}</div>
        </nx-dialog>
      ` : nothing}
    `;
  }
}

customElements.define('ew-canvas-versions', EwCanvasVersions);
