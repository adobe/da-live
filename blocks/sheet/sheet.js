import { LitElement, html, nothing } from 'da-lit';
import getPathDetails from '../shared/pathDetails.js';
import { getNx } from '../../scripts/utils.js';
import '../edit/da-title/da-title.js';
import { getData } from './utils/index.js';
import { staleCheck, showDaDialog } from './utils/utils.js';
import { convertSheets } from '../edit/utils/helpers.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);

const style = await getStyle('/blocks/sheet/da-sheet-panes.css');

class DaSheetPanes extends LitElement {
  static properties = {
    data: { type: Object },
    pathDetails: { type: Object },
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
      const daTitle = document.querySelector('da-title');
      const daSheet = document.querySelector('.da-sheet');

      const initSheet = (await import('./utils/index.js')).default;
      daTitle.sheet = await initSheet(daSheet, verReview.data);
      staleCheck.markSynced(verReview.data);
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
    const showHistory = this.pathDetails?.view !== 'config'; // API doesn't support history for config
    return html`
      <div class="da-sheet-pane-tabs is-visible">
        <div class="da-editor-tabs-full">
          <button class="da-editor-tab show-preview" @click=${this.handlePreviewToggle}>Preview</button>
        </div>
        ${showHistory ? html`
        <div class="da-editor-tabs-quiet">
          <button class="da-editor-tab quiet show-versions" @click=${this.handleHistoryToggle}>View history</button>
        </div>
        ` : nothing}
      </div>
      <div class="da-sheet-panes">
        ${this._showPreview ? html`<da-sheet-preview @close=${this.handlePreviewToggle}></da-sheet-preview>` : nothing}
        ${this._showVersions ? html`<da-versions .open=${this._showVersions} path="${this.pathDetails?.fullpath ?? ''}" @preview=${this.handlePreviewVersion} @close=${this.handleHistoryToggle}></da-versions>` : nothing}
      </div>
    `;
  }
}

customElements.define('da-sheet-panes', DaSheetPanes);

let initSheet;

async function reloadSheet(daTitle, daSheet) {
  if (!initSheet) initSheet = (await import('./utils/index.js')).default;
  daTitle.sheet = await initSheet(daSheet);
  daTitle.disabledText = undefined;
}

async function setSheet(details, daTitle, daSheet) {
  // Drop any open stale-content dialog so its Cancel can't act on the new path's staleCheck.
  document.body.querySelectorAll(':scope > da-dialog').forEach((d) => d.remove());
  // Full reset before the load — getData calls markSynced which sets _lastJsonString.
  // start() below only wires up the interval without resetting state.
  staleCheck.stop();

  daTitle.details = details;
  daSheet.details = details;

  await reloadSheet(daTitle, daSheet);

  const onStale = async ({ dirty }) => {
    if (!dirty) {
      await reloadSheet(daTitle, daSheet);
      return;
    }
    // Block saves immediately so edits made while the dialog is open don't
    // re-trigger drift detection. Reload (via markSynced) clears the block.
    staleCheck.blockSaves();
    daTitle.disabledText = 'Stale content';
    const result = await showDaDialog({
      title: 'Content changed',
      body: 'The content has changed since you opened it. Refresh to get latest or close this dialog to keep your edits without saving.',
      confirmLabel: 'Refresh',
    });
    if (result === 'confirm') {
      await reloadSheet(daTitle, daSheet);
    }
  };

  staleCheck.start({ url: details.sourceUrl, onStale });
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
  daSheetPanes.pathDetails = details;

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
  setSheet(details, daTitle, daSheet);

  el.append(daTitle, versionWrapper);

  daTitle.addEventListener('success', (e) => {
    if (e.detail.action !== 'save') return;
    staleCheck.markSynced(convertSheets(daSheet.jexcel));
  });

  window.addEventListener('hashchange', async () => {
    details = getPathDetails();
    setSheet(details, daTitle, daSheet);
    daSheetPanes.pathDetails = details;
  });
}
