import { LitElement, html, nothing } from 'da-lit';
import getPathDetails from '../shared/pathDetails.js';
import { getNx } from '../../scripts/utils.js';
import '../edit/da-title/da-title.js';
import { getData } from './utils/index.js';
import { createConfigStaleMonitor, fetchConfigState } from './utils/config-stale.js';
import { SHEET_DIRTY_EVENT } from './utils/utils.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);

const style = await getStyle('/blocks/sheet/da-sheet-panes.css');
const DISABLE_MESSAGE = 'Saving is disabled until the config has been refreshed. If you have unsaved changes that you want to preserve, you can copy them and merge them after refreshing the config.';
const STALE_DIALOG_MESSAGE = 'The config has been updated. Please refresh to get the latest changes, or ignore to keep your existing edits.';
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
let configStaleMonitor;
let staleDialog;
let staleAbortController;

function removeConfigStaleDialog() {
  staleDialog?.remove();
  staleDialog = undefined;
}

function clearConfigStaleState(daTitle) {
  daTitle.disableMessage = undefined;
  removeConfigStaleDialog();
  staleAbortController?.abort();
  staleAbortController = undefined;
}

function stopConfigStaleMonitor() {
  configStaleMonitor?.stop();
  configStaleMonitor = undefined;
}

async function refreshConfigSheet(details, daTitle, daSheet) {
  const freshData = await getData(details.sourceUrl);
  daTitle.sheet = await initSheet(daSheet, freshData);
}

async function showConfigStaleDialog(daTitle, details, daSheet) {
  removeConfigStaleDialog();
  await import('../shared/da-dialog/da-dialog.js');

  const dialog = document.createElement('da-dialog');
  dialog.title = 'Config Updated';

  const content = document.createElement('p');
  content.textContent = STALE_DIALOG_MESSAGE;
  dialog.appendChild(content);

  let refreshed = false;

  // treat x, close, escape as ignore
  dialog.addEventListener('close', () => {
    if (!refreshed) {
      daTitle.disableMessage = DISABLE_MESSAGE;
      configStaleMonitor?.ignore();
    }
    removeConfigStaleDialog();
  });

  const ignoreBtn = document.createElement('sl-button');
  ignoreBtn.className = 'primary outline';
  ignoreBtn.textContent = 'Ignore';
  ignoreBtn.slot = 'footer-right';
  ignoreBtn.addEventListener('click', () => { dialog.close(); });

  const refreshBtn = document.createElement('sl-button');
  refreshBtn.className = 'accent';
  refreshBtn.textContent = 'Refresh';
  refreshBtn.slot = 'footer-right';
  refreshBtn.addEventListener('click', async () => {
    refreshed = true;
    daTitle.disableMessage = undefined;
    daTitle.hasChanges = false;
    await refreshConfigSheet(details, daTitle, daSheet);
    await configStaleMonitor?.refresh();
    dialog.close();
  });

  dialog.appendChild(ignoreBtn);
  dialog.appendChild(refreshBtn);

  document.body.appendChild(dialog);
  staleDialog = dialog;
}

async function configureConfigStaleMonitor(details, daTitle, daSheet) {
  stopConfigStaleMonitor();
  clearConfigStaleState(daTitle);

  if (details.view !== 'config') return;

  staleAbortController = new AbortController();
  const { signal } = staleAbortController;

  const getConfigState = () => fetchConfigState(details.sourceUrl);
  configStaleMonitor = createConfigStaleMonitor({
    getConfigState,
    onStale: () => {
      showConfigStaleDialog(daTitle, details, daSheet);
    },
  });

  daTitle.addEventListener('config-saved', async () => {
    await configStaleMonitor?.syncBaseline();
  }, { signal });

  await configStaleMonitor.start();
}

async function setSheet(details, daTitle, daSheet) {
  daTitle.details = details;
  daSheet.details = details;

  if (!initSheet) initSheet = (await import('./utils/index.js')).default;
  daTitle.sheet = await initSheet(daSheet);
  await configureConfigStaleMonitor(details, daTitle, daSheet);
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
  document.addEventListener(SHEET_DIRTY_EVENT, () => { daTitle.hasChanges = true; });
  daTitle.addEventListener('config-saved', () => { daTitle.hasChanges = false; });

  el.append(daTitle, versionWrapper);

  // Set data against the title & sheet
  setSheet(details, daTitle, daSheet);

  window.addEventListener('hashchange', async () => {
    stopConfigStaleMonitor();
    details = getPathDetails();
    if (!details) return;
    setSheet(details, daTitle, daSheet);
    daSheetPanes.pathDetails = details;
  });
}
