import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2, getNx2Api, getNxEWFlags } from '../../scripts/utils.js';
import { getBrowseHref, getFileHref } from './utils.js';
import { EMPTY_DOC } from '../shared/utils.js';
import { DOC_TILES } from './constants.js';
import './tile.js';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);
const nx = await import(`${getNx2()}/scripts/nx.js`);
const sizing = nx.getUISize ? await import(`${getNx2()}/utils/ui-size.js`) : undefined;
const styles = await loadStyle(import.meta.url);

export class DaLanding extends LitElement {
  static properties = {
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
    this.shadowRoot.adoptedStyleSheets = [styles];
    this._unsubscribe = hashChange.subscribe((state) => this.setScope(state));
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

  renderQuickLinks() {
    return html`<ul class="quick-links" aria-label="Quick links">
      <li><da-landing-tile heading="Browse Content"
        description="View your recent, favorite, or other content by their organization"
        iconHref="/img/icons/s2-icon-folderopen-20-n.svg" .size=${this.dataset.uiSize || 's'}
        actionId="browse"
        .href=${this._scope ? getBrowseHref({ path: this.path }) : undefined}></da-landing-tile></li>
      <li><da-landing-tile heading="Create a page" description="Create a new page in the selected site"
        iconHref="/img/icons/s2-icon-edit-20-n.svg" tone="green" .size=${this.dataset.uiSize || 's'}
        action actionId="create-page" .disabled=${!this._permissions?.includes('write') || !this._editor || !!this._openingPage}
        @click=${this._onCreatePage}></da-landing-tile></li>
      ${DOC_TILES.map((tile) => html`
        <li><da-landing-tile .heading=${tile.title} .description=${tile.description}
          .iconHref=${tile.iconHref} .tone=${tile.tone} .size=${this.dataset.uiSize || 's'}
          .actionId=${tile.id} .href=${tile.href}></da-landing-tile></li>`)}
    </ul>`;
  }

  render() {
    return html`<div class="landing">
      ${this.renderQuickLinks()}
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

customElements.define('da-landing', DaLanding);

export default function init(el) {
  const landing = document.createElement('da-landing');
  el.append(landing);
  return landing;
}
