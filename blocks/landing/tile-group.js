import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2, getNx2Api, getNxEWFlags } from '../../scripts/utils.js';
import { getTileTarget, getFileHref } from './utils.js';
import { EMPTY_DOC } from '../shared/utils.js';
import { loadTileEntries, readTileEntries } from './tile-content.js';
import './tile.js';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);
const nx = await import(`${getNx2()}/scripts/nx.js`);
const sizing = nx.getUISize ? await import(`${getNx2()}/utils/ui-size.js`) : undefined;
const styles = await Promise.all([
  loadStyle(import.meta.url),
  loadStyle(new URL('./tile-layout.css', import.meta.url).href),
]);

export class DaLandingTiles extends LitElement {
  static properties = {
    entries: { attribute: false },
    contentBlock: { attribute: false },
    _contentError: { state: true },
    _scope: { state: true },
    _error: { state: true },
    _actionError: { state: true },
    _editor: { state: true },
    _permissions: { state: true },
    _openingPage: { state: true },
    _createDialog: { state: true },
  };

  _sizing = sizing && new sizing.UISizeController(this);

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = styles;
    this._unsubscribe = hashChange.subscribe((state) => this.setScope(state));
    if (this.entries === undefined) this._loadContent();
  }

  disconnectedCallback() {
    this._unsubscribe?.();
    this._request?.abort();
    this._openingPage = undefined;
    this._createDialog = undefined;
    super.disconnectedCallback();
  }

  get path() {
    return this._scope ? `/${this._scope}` : '';
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
    if (this._scope === scope && this._request && !this._request.signal.aborted) return;
    this._scope = scope;
    this._permissions = undefined;
    this._openingPage = undefined;
    this._createDialog = undefined;
    this._actionError = undefined;
    this.loadSite();
  }

  async loadSite() {
    this._request?.abort();
    const request = new AbortController();
    this._request = request;
    this._error = undefined;
    this._editor = undefined;
    this._permissions = undefined;
    if (!this._scope) return;
    const [org, site] = this._scope.split('/');
    const editor = getNxEWFlags()
      .then(({ isEWEnabled }) => isEWEnabled({ org, site }))
      .then((enabled) => (enabled ? '/canvas#' : '/edit#'))
      .catch(() => '/edit#');
    try {
      const { source } = await getNx2Api();
      const result = await source.list(this.path, { opts: { signal: request.signal } });
      if (!result.ok) throw new Error('Could not check site permissions. Check your sign-in.');
      const destination = await editor;
      if (!this.isConnected || request.signal.aborted) return;
      this._editor = destination;
      this._permissions = result.permissions;
    } catch (error) {
      if (!request.signal.aborted && this.isConnected) this._error = error.message;
    }
  }

  async _onCreatePage() {
    if (!this._scope || !this._permissions?.includes('write') || !this._editor || this._openingPage) return;
    const opening = {};
    this._openingPage = opening;
    try {
      await import('../shared/da-name-dialog/da-name-dialog.js');
      if (this.isConnected && this._openingPage === opening) {
        this._createDialog = { folder: this.path, editor: this._editor };
      }
    } catch (error) {
      if (this.isConnected && this._openingPage === opening) {
        this._actionError = `Could not open New page: ${error.message}`;
      }
    } finally {
      if (this._openingPage === opening) this._openingPage = undefined;
    }
  }

  _onCloseCreatePage() {
    this._createDialog = undefined;
  }

  async _onCreatePageSubmit({ detail: { name, openAfter } }) {
    if (!this._createDialog || this._createDialog.saving) return;
    const dialog = { ...this._createDialog, saving: true, error: undefined };
    this._createDialog = dialog;
    const path = `${dialog.folder}/${name}.html`;
    try {
      const { source } = await getNx2Api();
      const existing = await source.getMetadata(path);
      if (!this.isConnected || this._createDialog !== dialog) return;
      if (existing.ok) throw new Error('A page with this name already exists. Choose another name.');
      if (existing.status !== 404) throw new Error('Could not check the page name. Please try again.');
      const response = await source.save(path, { body: EMPTY_DOC });
      if (!this.isConnected || this._createDialog !== dialog) return;
      if (!response?.ok) throw new Error('Could not create the page. Check your permissions and try again.');
      this._onCloseCreatePage();
      if (openAfter) {
        window.location.href = getFileHref({ item: { path, ext: 'html' }, editor: dialog.editor });
      } else {
        await this.loadSite();
      }
    } catch (error) {
      if (this.isConnected && this._createDialog === dialog) {
        this._createDialog = { ...dialog, saving: false, error: error.message };
      }
    }
  }

  renderTile(entry) {
    const { href, action, disabled } = getTileTarget({ entry, scope: this._scope });
    return html`<li><da-landing-tile .heading=${entry.heading} .description=${entry.description}
      .iconHref=${entry.iconHref} .tone=${entry.tone} .size=${this.dataset.uiSize || 's'}
      .actionId=${entry.id} .href=${href} .action=${!href}
      .disabled=${disabled || (action === 'create-page'
        && (!this._permissions?.includes('write') || !this._editor || !!this._openingPage))}
      @click=${action === 'create-page' ? this._onCreatePage : nothing}></da-landing-tile></li>`;
  }

  renderQuickLinks() {
    return html`<ul class="quick-links landing-tiles" aria-label="Quick links">
      ${this.entries.map((entry) => this.renderTile(entry))}
    </ul>`;
  }

  render() {
    return html`<div class="tile-group">
      ${this.entries ? this.renderQuickLinks() : nothing}
      ${this.entries === undefined && !this._contentError ? html`
        <p role="status">Loading quick links...</p>` : nothing}
      ${this._contentError ? html`<p role="alert">${this._contentError}</p>` : nothing}
      ${this._error || this._actionError ? html`
        <p role="alert">${this._error || this._actionError}</p>` : nothing}
      ${this._createDialog ? html`<da-name-dialog open
        dialog-title="New page in ${this._scope?.split('/')[1]}"
        name-placeholder="page name" show-create-and-open
        ?saving=${this._createDialog.saving} .error=${this._createDialog.error || ''}
        @da-name-submit=${this._onCreatePageSubmit}
        @close=${this._onCloseCreatePage}></da-name-dialog>` : nothing}
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
