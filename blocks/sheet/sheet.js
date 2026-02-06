import { LitElement, html, nothing } from 'da-lit';
import getPathDetails from '../shared/pathDetails.js';
import { getNx } from '../../scripts/utils.js';
import '../edit/da-title/da-title.js';
import { getData } from './utils/index.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);

const style = await getStyle('/blocks/sheet/da-sheet-panes.css');

class DaSheetPanes extends LitElement {
  static properties = {
    data: { type: Object },
    ydoc: { type: Object },
    _showVersions: { state: true },
    _showPreview: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  update(props) {
    if (props.has('data')) {
      if (this.data) {
        if (this.daPreview) {
          this.daPreview.data = this.data;
        }
      }
    }
    super.update(props);
  }

  updated(props) {
    super.updated(props);
    if (props.has('_showPreview') && this._showPreview) {
      this.daPreview.data = this.data;
    }
  }

  async handlePreviewVersion(e) {
    if (!this._verReviewCmpLoaded) {
      await import('./da-version-review.js');
      this._verReviewCmpLoaded = true;
    }
    const verReview = document.createElement('da-version-review');
    verReview.data = await getData(e.detail.url);
    verReview.addEventListener('close', () => { verReview.remove(); });
    verReview.addEventListener('restore', async () => {
      const { jSheetToY } = await import('../../deps/da-parser/dist/index.js');
      jSheetToY(verReview.data, this.ydoc, true);
      verReview.remove();
    });

    const sheetWrapper = document.querySelector('.da-sheet-wrapper');
    sheetWrapper.append(verReview);
  }

  async handlePreviewToggle() {
    if (!this._verCmpLoaded) {
      await import('./da-sheet-preview.js');
      this._previewCmpLoaded = true;
    }

    this.daTabs.classList.toggle('is-visible');
    this._showPreview = !this._showPreview;
  }

  async handleHistoryToggle() {
    if (!this._verCmpLoaded) {
      await import('../edit/da-versions/da-versions.js');
      this._verCmpLoaded = true;
    }

    this.daTabs.classList.toggle('is-visible');
    this._showVersions = !this._showVersions;
  }

  get daPreview() {
    return this.shadowRoot.querySelector('da-sheet-preview');
  }

  get daTabs() {
    return this.shadowRoot.querySelector('.da-sheet-pane-tabs');
  }

  render() {
    return html`
      <div class="da-sheet-pane-tabs is-visible">
        <div class="da-editor-tabs-full">
          <button class="da-editor-tab show-preview" @click=${this.handlePreviewToggle}>Preview</button>
        </div>
        <div class="da-editor-tabs-quiet">
          <button class="da-editor-tab quiet show-versions" @click=${this.handleHistoryToggle}>View history</button>
        </div>
      </div>
      <div class="da-sheet-panes">
        ${this._showPreview ? html`<da-sheet-preview @close=${this.handlePreviewToggle}></da-sheet-preview>` : nothing}
        ${this._showVersions ? html`<da-versions path="${this.path}" @preview=${this.handlePreviewVersion} @close=${this.handleHistoryToggle}></da-versions>` : nothing}
      </div>
    `;
  }
}

customElements.define('da-sheet-panes', DaSheetPanes);

let initSheet;

async function setSheet(details, daTitle, daSheet, daSheetPanes, wrapper) {
  daTitle.details = details;
  daSheet.details = details;

  if (!initSheet) initSheet = (await import('./utils/index.js')).default;
  const { ydoc } = await initSheet(daSheet);
  daSheetPanes.ydoc = ydoc;
  wrapper.ydoc = ydoc;
}

export default async function init(el) {
  let details = getPathDetails();
  if (!details) {
    el.innerHTML = '<h1>Please edit a sheet.</h1>';
    return;
  }

  document.title = `Edit sheet ${details.name} - DA`;

  // Base Elements
  const daTitle = document.createElement('da-title');
  const daSheetPanes = document.createElement('da-sheet-panes');

  // Details & styles
  daSheetPanes.path = details.fullpath;

  // Sheet & Tab Wrapper
  const wrapper = document.createElement('div');
  wrapper.classList.add('da-sheet-wrapper');
  const daSheet = document.createElement('div');
  daSheet.className = 'da-sheet';
  wrapper.append(daSheet);

  // Sheet & Version Wrapper
  const versionWrapper = document.createElement('div');
  versionWrapper.classList.add('da-version-wrapper');
  versionWrapper.append(wrapper, daSheetPanes);

  // Set data against the title & sheet
  setSheet(details, daTitle, daSheet, daSheetPanes, wrapper);

  el.append(daTitle, versionWrapper);

  window.addEventListener('hashchange', async () => {
    details = getPathDetails();
    setSheet(details, daTitle, daSheet, daSheetPanes, wrapper);
  });
}
