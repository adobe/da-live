import { html, nothing } from 'da-lit';
import getSheet from '../../shared/sheet.js';
import DaVersionsBase from '../../shared/version/da-versions-base.js';

const sheet = await getSheet('/blocks/edit/da-versions/da-versions.css');

export default class DaVersions extends DaVersionsBase {
  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  render() {
    return html`
      <div class="da-versions-panel">
        <p class="da-versions-title">
          <button class="da-versions-close-btn" @click=${this.handleClose} aria-label="Close history pane">History</button>
        </p>
        <ul class="da-version-list">
          ${this._newVersion ? this.renderNewVersion() : this.renderNow()}
          ${this._loading ? this.renderLoading() : nothing}
          ${this._versions?.length > 0 ? this.renderVersionList() : nothing}
        </ul>
      </div>
    `;
  }
}

customElements.define('da-versions', DaVersions);
