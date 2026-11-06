import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2, getNx2Api, getNxEWFlags } from '../../scripts/utils.js';
import { EMPTY_DOC } from '../shared/utils.js';
import getEditPath from '../shared/da-file-item/edit-path.js';
import { doesFileExist } from '../shared/da-file-item/item.js';
import { getTileTarget } from './utils.js';
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
  }

  async _onCreatePage() {
    if (!this._scope || this._createDialog) return;
    this._createDialog = { scope: this._scope };
    await import('../shared/da-name-dialog/da-name-dialog.js');
  }

  _onCloseCreatePage() {
    this._createDialog = undefined;
  }

  async _onCreatePageSubmit({ detail: { name } }) {
    const dialog = this._createDialog;
    if (!dialog || dialog.saving) return;
    this._createDialog = { ...dialog, saving: true, error: undefined };
    const [org, site] = dialog.scope.split('/');
    const path = `/${dialog.scope}/${name}.html`;
    const error = await (async () => {
      if (await doesFileExist(path)) return 'A page with this name already exists.';
      const { source } = await getNx2Api();
      const resp = await source.save(path, { body: EMPTY_DOC });
      return resp?.ok ? undefined : 'Could not create the page.';
    })().catch(() => 'Could not create the page.');
    if (this._createDialog?.scope !== dialog.scope) return;
    if (error) {
      this._createDialog = { ...dialog, saving: false, error };
      return;
    }
    const { isEWEnabled } = await getNxEWFlags();
    const editor = await isEWEnabled({ org, site }).catch(() => false) ? '/canvas#' : '/edit#';
    window.location.href = getEditPath({ path, ext: 'html', editor });
  }

  renderTile(entry) {
    const { href, action, disabled } = getTileTarget({ entry, scope: this._scope });
    return html`<li><da-landing-tile .heading=${entry.heading} .description=${entry.description}
      .iconHref=${entry.iconHref} .tone=${entry.tone} .size=${this.dataset.uiSize || 's'}
      .actionId=${entry.id} .href=${href} .action=${!href} .disabled=${disabled}
      @click=${action === 'create-page' && !disabled ? this._onCreatePage : nothing}></da-landing-tile></li>`;
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
