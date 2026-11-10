import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../scripts/utils.js';
import { createPage, doesFileExist } from '../shared/da-file-item/item.js';
import { getTileTarget } from './utils.js';
import { loadTileEntries, readTileEntries } from './tile-content.js';
import './tile.js';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);
const nx = await import(`${getNx2()}/scripts/nx.js`);
const sizing = nx.getUISize ? await import(`${getNx2()}/utils/ui-size.js`) : undefined;
const styles = await loadStyle(import.meta.url);

export class DaLandingTiles extends LitElement {
  static properties = {
    entries: { attribute: false },
    contentBlock: { attribute: false },
    _contentError: { state: true },
    _scope: { state: true },
    _createDialog: { state: true },
  };

  _sizing = sizing && new sizing.UISizeController(this);

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this._unsubscribe = hashChange.subscribe((state) => this.setScope(state));
  }

  disconnectedCallback() {
    this._unsubscribe?.();
    this._createDialog = undefined;
    super.disconnectedCallback();
  }

  async _loadContent() {
    const result = this.contentBlock
      ? readTileEntries({ block: this.contentBlock })
      : await loadTileEntries();
    if (!this.isConnected || this.entries !== undefined) return;
    this._contentError = result.error;
    this.entries = result.entries;
  }

  setScope(state) {
    const scope = state?.org && state?.site ? `${state.org}/${state.site}` : undefined;
    if (scope !== this._scope) this._createDialog = undefined;
    this._scope = scope;
    if (scope && this.entries === undefined) this._loadContent();
  }

  async _onCreatePage() {
    if (this._createDialog) return;
    this._createDialog = { scope: this._scope };
    await import('../shared/da-name-dialog/da-name-dialog.js');
  }

  _onCloseCreatePage() {
    this._createDialog = undefined;
  }

  async _onCreatePageSubmit({ detail: { name } }) {
    if (!this._createDialog || this._createDialog.saving) return;
    const dialog = { ...this._createDialog, saving: true, error: undefined };
    this._createDialog = dialog;
    const isCurrent = () => this.isConnected && this._createDialog === dialog;
    const path = `/${dialog.scope}/${name}.html`;
    let error;
    try {
      if (await doesFileExist(path)) error = 'A page with this name already exists.';
      else if (isCurrent()) {
        const href = await createPage({ path, isCurrent });
        if (href && isCurrent()) this.navigate(href);
      }
    } catch {
      error = 'Could not create the page.';
    }
    if (error && isCurrent()) {
      this._createDialog = { ...dialog, saving: false, error };
    }
  }

  navigate(href) {
    window.location.href = href;
  }

  _onTileClick({ id, href, action }) {
    window.hlx?.rum?.sampleRUM?.('click', { source: `landing-action-${id}`, target: href || action });
    if (action === 'create-page') this._onCreatePage();
  }

  renderTile(entry) {
    const { href, action, disabled } = getTileTarget({ entry, scope: this._scope });
    return html`<li><da-landing-tile .heading=${entry.heading} .description=${entry.description}
      .iconHref=${entry.iconHref} .tone=${entry.tone} .size=${this.dataset.uiSize || 's'}
      .href=${href} .action=${!href} .disabled=${disabled}
      @click=${disabled ? nothing : () => this._onTileClick({ id: entry.id, href, action })}></da-landing-tile></li>`;
  }

  renderCreateDialog() {
    const { scope, saving, error } = this._createDialog;
    return html`<da-name-dialog open dialog-title="New page in ${scope.split('/')[1]}"
      name-placeholder="page name" ?saving=${saving} .error=${error || ''}
      @da-name-submit=${this._onCreatePageSubmit}
      @close=${this._onCloseCreatePage}></da-name-dialog>`;
  }

  renderQuickLinks() {
    return html`<ul class="quick-links landing-tiles" aria-label="Quick links">
      ${this.entries.map((entry) => this.renderTile(entry))}
    </ul>`;
  }

  render() {
    if (!this._scope) return nothing;
    return html`<div class="tile-group">
      ${this.entries ? this.renderQuickLinks() : nothing}
      ${this.entries === undefined && !this._contentError ? html`
        <p role="status">Loading quick links...</p>` : nothing}
      ${this._contentError ? html`<p role="alert">${this._contentError}</p>` : nothing}
      ${this._createDialog ? this.renderCreateDialog() : nothing}
    </div>`;
  }
}

customElements.define('da-landing-tiles', DaLandingTiles);

export default function init(el, { contentBlock } = {}) {
  const tiles = document.createElement('da-landing-tiles');
  tiles.contentBlock = contentBlock;
  el.append(tiles);
  return tiles;
}
