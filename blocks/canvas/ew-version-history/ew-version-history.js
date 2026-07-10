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
    this._onPreview = ({ detail }) => versionPreviewChange.emit(detail);
    this.addEventListener('preview', this._onPreview);
    this._unsubHash = hashChange.subscribe((state) => this._onHashChange(state));
    this._onKeydown = (e) => {
      if (e.key === 'Escape' && this._newVersion) this.handleCancel();
    };
    this.shadowRoot.addEventListener('keydown', this._onKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubHash?.();
    this.removeEventListener('preview', this._onPreview);
    this.shadowRoot.removeEventListener('keydown', this._onKeydown);
  }

  _onHashChange({ org, site, path } = {}) {
    const nextPath = org && site && path ? `/${org}/${site}/${path}.html` : '';
    if (nextPath === this.path) return;
    this.path = nextPath;
    if (!this.path) return;
    this.getVersions();
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
