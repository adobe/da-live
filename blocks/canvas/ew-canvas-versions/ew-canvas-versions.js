import { LitElement, html, nothing } from 'da-lit';
import { DOMParser as PMDOMParser } from 'da-y-wrapper';
import { getNx } from '../../../scripts/utils.js';
import { initIms } from '../../shared/utils.js';
import {
  fetchVersions,
  newVersionEntry,
  createVersion,
  fetchVersionHtml,
  getVersionId,
} from '../../shared/version/version-actions.js';
import { buildDisplayItems } from '../../shared/version/helpers.js';
import { docToHtml, domToHtml, buildCompareDom } from '../../shared/version/compare.js';
import { getExtensionsBridge } from '../editor-utils/extensions-bridge.js';
import { trackingPluginKey } from '../editor-utils/prose-diff.js';
import './ew-canvas-compare.js';

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iP(hone|[oa]d)/.test(navigator.platform);
const SHORTCUT_HINT = IS_MAC ? '⌘ + ⌥ + S' : 'Ctrl + Alt + S';

const ICON_ADD = '/img/icons/s2-icon-addcircle-20-n.svg';
const ICON_MORE = '/img/icons/s2-icon-more-20-n.svg';
const ICON_CHEVRON = '/img/icons/s2-icon-chevrondown-20-n.svg';
const ICON_CLOSE = '/img/icons/s2-icon-close-20-n.svg';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);
await import(`${getNx()}/blocks/shared/menu/menu.js`);
await import(`${getNx()}/blocks/shared/dialog/dialog.js`);
const style = await loadStyle(import.meta.url);
const baseStyle = await loadStyle(new URL('../../shared/styles/base.css', import.meta.url).href);

export function buildDocPath(state) {
  const { org, site, path } = state ?? {};
  return org && site && path ? `/${org}/${site}/${path}.html` : '';
}

let toastPromise;
function loadToast() {
  toastPromise ??= import(`${getNx()}/blocks/shared/toast/toast.js`);
  return toastPromise;
}

async function showError(text) {
  const { showToast } = await loadToast();
  showToast({ text, variant: 'error' });
}

class EwCanvasVersions extends LitElement {
  static properties = {
    path: { type: String },
    _filter: { state: true },
    _imsEmail: { state: true },
    _versions: { state: true },
    _newVersion: { state: true },
    _savingVersion: { state: true },
    _restoreEntry: { state: true },
    _compareCtx: { state: true },
    _compareSplit: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [baseStyle, style];
    this._filter = 'all';
    initIms().then((ims) => { this._imsEmail = ims?.email ?? null; });
    this._unsubHash = hashChange?.subscribe((state) => {
      const next = buildDocPath(state);
      if (next !== this.path) {
        this.path = next;
        this.handleCloseCompare();
        this.handleRestoreCancel();
        this.handleCancel();
        if (next) this._load();
      }
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubHash?.();
  }

  updated(changed) {
    if (changed.has('_newVersion') && this._newVersion) {
      const input = this.shadowRoot.querySelector('.da-input');
      input?.focus();
      input?.select();
    }
  }

  async _load({ showLoading = true } = {}) {
    if (showLoading) this._versions = undefined;
    const versions = await fetchVersions(this.path);
    if (versions === null) {
      showError('Could not load version history. Please try again.');
      this._versions = [];
      return;
    }
    this._versions = versions;
  }

  _setFilter(val) {
    this._filter = val;
  }

  handleNew() {
    this._newVersion = newVersionEntry();
  }

  async handleNewSubmit(e) {
    e.preventDefault();
    if (this._savingVersion) return;
    const label = e.target.elements.label?.value || '';
    this._savingVersion = true;
    const ok = await createVersion(this.path, label);
    this._savingVersion = false;
    if (!ok) {
      showError('Could not save version. Please try again.');
      return;
    }
    this._newVersion = null;
    this._load({ showLoading: false });
  }

  handleCancel() {
    this._newVersion = null;
  }

  handleNewKeydown(e) {
    if (e.key === 'Escape') this.handleCancel();
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
    if (!versionBody) {
      showError('Could not load the selected version.');
      return;
    }
    const newDoc = PMDOMParser.fromSchema(view.state.schema).parse(versionBody);
    const { doc } = view.state;
    const tr = view.state.tr
      .replaceWith(0, doc.content.size, newDoc.content)
      .setMeta(trackingPluginKey, true);
    view.dispatch(tr);
    this.handleCloseCompare();
  }

  get _focusTrigger() {
    const active = this.shadowRoot.activeElement;
    return active?.closest('[tabindex], button, a[href]') ?? active;
  }

  async _openCompare(entry, { forceSplit = false } = {}) {
    const trigger = this._focusTrigger;
    const versionBody = await fetchVersionHtml(this.path, entry);
    if (!versionBody) {
      showError('Could not load the selected version.');
      return;
    }

    const wantsSplit = forceSplit || this._compareSplit;
    let diffDom = null;
    let cleanup = () => { };
    if (wantsSplit) {
      const diff = await this._buildDiff(versionBody);
      if (!diff) return;
      ({ dom: diffDom, cleanup } = diff);
    }

    this.handleCloseCompare();
    this._compareTrigger = trigger;
    if (forceSplit) this._compareSplit = true;
    const label = entry.label || entry.date;
    this._compareCtx = { previewDom: versionBody, diffDom, cleanup, label, entry };
  }

  async handleCompare(e, entry) {
    e.stopPropagation();
    await this._openCompare(entry, { forceSplit: true });
  }

  async handlePreview(e, entry) {
    await this._openCompare(entry);
  }

  handleRestoreFromCompare() {
    const { entry } = this._compareCtx ?? {};
    this.handleRestoreClick(entry);
  }

  handleCloseCompare() {
    this._compareCtx?.cleanup?.();
    this._compareCtx = null;
    this._compareTrigger?.focus?.();
    this._compareTrigger = null;
  }

  handleCurrentClick(e) {
    this._compareTrigger = null;
    this.handleCloseCompare();
    e.currentTarget.focus();
  }

  async _buildDiff(versionBody) {
    const { view } = getExtensionsBridge();
    if (!view) {
      showError('Could not build the comparison. Please try again.');
      return null;
    }
    return buildCompareDom({
      htmlA: docToHtml(view),
      htmlB: domToHtml(versionBody),
      closeOnOutsideClick: false,
    });
  }

  async handleToggleCompareSplit() {
    if (!this._compareCtx) return;
    if (!this._compareCtx.diffDom) {
      const { dom: diffDom, cleanup } = await this._buildDiff(this._compareCtx.previewDom) ?? {};
      if (!diffDom) return;
      this._compareCtx = { ...this._compareCtx, diffDom, cleanup };
    }
    this._compareSplit = !this._compareSplit;
  }

  get _canWrite() {
    return getExtensionsBridge().view?.editable ?? false;
  }

  get _comparingId() {
    return this._compareCtx ? getVersionId(this.path, this._compareCtx.entry) : null;
  }

  get _filteredVersions() {
    if (!this._versions) return [];
    if (this._filter === 'all' || !this._imsEmail) return this._versions;
    return this._versions.filter((entry) => {
      if (entry.isVersion) return entry.users?.some((u) => u.email === this._imsEmail);
      return entry.audits?.some((a) => a.users?.some((u) => u.email === this._imsEmail));
    });
  }

  renderNewRow() {
    return html`
      <li class="versionentry is-new">
        <span class="versionicon"></span>
        <form class="ew-cv-new-row" @submit=${this.handleNewSubmit} @keydown=${this.handleNewKeydown}>
          <input type="text" name="label" placeholder="Version name"
            class="da-input" .value=${`Version ${this._newVersion.date}`}
            ?readonly=${this._savingVersion} />
          <div class="ew-cv-new-actions">
            <button type="submit" class="ew-cv-save-btn da-btn-secondary"
              ?disabled=${this._savingVersion}
              aria-label=${this._savingVersion ? 'Saving' : nothing}>
              ${this._savingVersion ? html`<span class="da-loading-spinner" aria-hidden="true"></span>` : 'Save'}
            </button>
            <button type="button" class="da-icon-btn" aria-label="Cancel"
              ?disabled=${this._savingVersion}
              @click=${this.handleCancel}>
              <svg class="icon" viewBox="0 0 20 20" aria-hidden="true">
                <use href="${ICON_CLOSE}#icon"></use>
              </svg>
            </button>
          </div>
        </form>
      </li>
    `;
  }

  renderCurrentRow() {
    return html`
      <li class="versionentry is-current" tabindex="0" role="button"
        @click=${(e) => this.handleCurrentClick(e)}
        @keydown=${(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        this.handleCurrentClick(e);
      }}>
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
    const users = entry.users?.map((u) => u.email).join(', ');
    const menuItems = [
      { section: 'Actions' },
      ...(this._canWrite ? [{ id: 'restore', label: 'Restore' }] : []),
      { id: 'compare', label: 'Compare' },
    ];
    const isComparing = !!this._comparingId && getVersionId(this.path, entry) === this._comparingId;
    return html`
      <li class="versionentry is-version${isComparing ? ' is-comparing' : ''}">
        <span class="versionicon">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <use href="/img/icons/s2-icon-targetsmall-20-n.svg#icon"></use>
          </svg>
        </span>
        <div class="version-row" tabindex="0" role="button"
          @click=${(e) => this.handlePreview(e, entry)}
          @keydown=${(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        this.handlePreview(e, entry);
      }}>
          <div class="version-info">
            <span class="versionname">${entry.label || entry.date}</span>
            <span class="meta">${entry.date}, ${entry.time}</span>
            ${users ? html`<span class="user">${users}</span>` : nothing}
          </div>
          <nx-menu .items=${menuItems} placement="auto"
            @click=${(e) => e.stopPropagation()}
            @keydown=${(e) => e.stopPropagation()}
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
      <li class="versionentry is-audit">
        <details>
          <summary>
            <span class="versionicon">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <use href="${ICON_CHEVRON}#icon"></use>
              </svg>
            </span>
            <span class="versionname">${auditLength} change${auditLength > 1 ? 's' : ''}</span>
          </summary>
          <ul class="auditlist">
            ${entry.audits.map((a) => html`
              <li class="audititem">
                <span class="meta">${a.date}, ${a.time}</span>
                ${a.users?.length ? html`<span class="user">${a.users.map((u) => u.email).join(', ')}</span>` : nothing}
              </li>
            `)}
          </ul>
        </details>
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
              aria-pressed=${this._filter === 'all'}
              @click=${() => this._setFilter('all')}>All</button>
            <button type="button"
              class="seg-btn${this._filter === 'me' ? ' is-selected' : ''}"
              aria-pressed=${this._filter === 'me'}
              @click=${() => this._setFilter('me')}>Only me</button>
          </div>
          <button type="button" class="da-icon-btn" aria-label="Create version"
            ?disabled=${!!this._newVersion} @click=${this.handleNew}>
            <svg class="icon" viewBox="0 0 20 20" aria-hidden="true">
              <use href="${ICON_ADD}#icon"></use>
            </svg>
          </button>
        </div>
        <p class="hint">Press ${SHORTCUT_HINT} to add to version history while editing.</p>
        ${this._versions === undefined
        ? html`<p class="loading">Loading…</p>`
        : html`<ul class="versionlist">
              ${this._newVersion ? this.renderNewRow() : nothing}
              ${this.renderCurrentRow()}
              ${buildDisplayItems(this._filteredVersions).map((entry) => (
          entry.isVersion ? this.renderVersion(entry) : this.renderAudits(entry)
        ))}
            </ul>`}
      </div>
      ${this._restoreEntry ? this.renderRestoreDialog() : nothing}
      ${this._compareCtx ? html`
        <ew-canvas-compare
          .dom=${this._compareCtx.previewDom}
          .diffDom=${this._compareCtx.diffDom}
          label=${this._compareCtx.label}
          ?canWrite=${this._canWrite}
          ?split=${this._compareSplit}
          @close=${this.handleCloseCompare}
          @restore=${this.handleRestoreFromCompare}
          @toggle-split=${this.handleToggleCompareSplit}>
        </ew-canvas-compare>
      ` : nothing}
    `;
  }
}

customElements.define('ew-canvas-versions', EwCanvasVersions);
