import { html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import DaVersionsBase from '../../shared/version/da-versions-base.js';
import { versionPreviewChange } from '../editor-utils/editor-utils.js';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);

export default class EwVersionHistory extends DaVersionsBase {
  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    // DaVersionsBase.handlePreview() already dispatches this on itself; forward
    // it onto the cross-subtree bus so canvas.js can mount the preview overlay.
    this.addEventListener('preview', ({ detail }) => versionPreviewChange.emit(detail));
    this._unsubHash = hashChange.subscribe((state) => this._onHashChange(state));
    // DaVersionsBase has no keyboard escape hatch for the "create a new
    // version" label form; add one without touching the shared base class.
    this._onKeydown = (e) => {
      if (e.key === 'Escape' && this._newVersion) this.handleCancel();
    };
    this.shadowRoot.addEventListener('keydown', this._onKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubHash?.();
    this.shadowRoot.removeEventListener('keydown', this._onKeydown);
  }

  _onHashChange({ org, site, path } = {}) {
    // hashChange's path has no extension (e.g. "mydoc"), but DA's version APIs
    // identify documents by their .html source path, same as canvas's own
    // buildSourceUrl() (ew-editor-doc/utils/source.js) appends unconditionally
    // for the exact same hash-derived path when loading the live document.
    const nextPath = org && site && path ? `/${org}/${site}/${path}.html` : '';
    if (nextPath === this.path) return;
    this.path = nextPath;
    if (this.path) this.getVersions();
  }

  render() {
    if (!this.path) {
      return html`
        <div class="ew-version-history">
          <p class="placeholder">Select a page to see its version history.</p>
        </div>
      `;
    }

    return html`
      <div class="ew-version-history">
        <ul class="da-version-list">
          ${this._newVersion ? this.renderNewVersion() : this.renderNow()}
          ${this._loading ? this.renderLoading() : nothing}
          ${this._versions?.length > 0 ? this.renderVersionList() : nothing}
        </ul>
      </div>
    `;
  }
}

customElements.define('ew-version-history', EwVersionHistory);
