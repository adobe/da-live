import { LitElement, html, nothing } from 'da-lit';
import { DOMParser as proseDOMParser } from 'da-y-wrapper';
import { getNx, getNx2Api } from '../../../scripts/utils.js';
import { htmlToProse } from '../../edit/utils/helpers.js';
import {
  docToHtml, domToHtml, buildCompareDom, renderCompareModal, wrapTablesInWrappers,
} from '../../shared/version/compare.js';
import getSheet from '../../shared/sheet.js';
import { getExtensionsBridge } from '../editor-utils/extensions-bridge.js';
import { versionPreviewChange } from '../editor-utils/editor-utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);

let compareSheetPromise;
function loadCompareSheet() {
  compareSheetPromise ??= getSheet('/blocks/shared/version/compare.css');
  return compareSheetPromise;
}

export default class EwVersionPreview extends LitElement {
  static properties = {
    org: { type: String },
    site: { type: String },
    path: { type: String },
    versionId: { type: String },
    label: { type: String },
    _versionDom: { state: true },
    _daMetadata: { state: true },
    _compareDom: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  async updated(changedProps) {
    if (changedProps.has('versionId') && this.versionId) {
      this.fetchVersion();
    }
  }

  async fetchVersion() {
    const { versions } = await getNx2Api();
    // this.path comes from canvas's raw hashChange state (e.g. "mydoc"), with
    // no extension. DA's version APIs identify documents by their .html
    // source path — same as canvas's own buildSourceUrl() (ew-editor-doc/
    // utils/source.js) appends unconditionally for this same hash-derived path.
    const resp = await versions.get({
      org: this.org, site: this.site, path: `${this.path}.html`, versionId: this.versionId,
    });
    if (!resp.ok) {
      versionPreviewChange.emit(null);
      return;
    }
    const text = await resp.text();
    const { dom, ydoc } = htmlToProse(text);
    const metadataMap = ydoc.getMap('daMetadata');
    this._daMetadata = Object.fromEntries(metadataMap.entries());
    wrapTablesInWrappers(dom);
    this._versionDom = dom;
  }

  get _canWrite() {
    const { permissions } = getExtensionsBridge();
    return !!permissions?.some((permission) => permission === 'write');
  }

  handleCancel() {
    this.handleCloseCompare();
    versionPreviewChange.emit(null);
  }

  async handleCompare() {
    const { view } = getExtensionsBridge();
    if (!view) return;
    const [compareSheet, { dom, cleanup }] = await Promise.all([
      loadCompareSheet(),
      buildCompareDom({
        htmlA: docToHtml(view),
        htmlB: this._versionDom ? domToHtml(this._versionDom) : '',
        onClose: () => this.handleCloseCompare(),
      }),
    ]);
    if (!this.shadowRoot.adoptedStyleSheets.includes(compareSheet)) {
      this.shadowRoot.adoptedStyleSheets = [...this.shadowRoot.adoptedStyleSheets, compareSheet];
    }
    this._compareDom = dom;
    this._compareCleanup = cleanup;
  }

  handleCloseCompare() {
    this._compareDom = null;
    this._compareCleanup?.();
  }

  handleRestore() {
    const { view, ydoc } = getExtensionsBridge();
    if (!view) return;
    const { schema, doc } = view.state;
    const newDoc = proseDOMParser.fromSchema(schema).parse(this._versionDom);
    const tr = view.state.tr.replaceWith(0, doc.content.size, newDoc.content);
    view.updateState(view.state.apply(tr));

    if (ydoc) {
      const metadataMap = ydoc.getMap('daMetadata');
      Object.entries(this._daMetadata ?? {}).forEach(([key, value]) => {
        if (value === null || value === undefined) metadataMap.delete(key);
        else metadataMap.set(key, value);
      });
    }

    this.handleCancel();
  }

  render() {
    if (!this._versionDom) return nothing;
    return html`
      <div class="ew-version-preview">
        <div class="version-action-area">
          <h2 class="version-title">Version: ${this.label || ''}</h2>
          <div class="version-action-buttons">
            <button type="button" @click=${this.handleCancel}>Cancel</button>
            <button type="button" @click=${this.handleCompare}>Compare</button>
            <button type="button" class="accent" @click=${this.handleRestore} ?disabled=${!this._canWrite}>Restore</button>
          </div>
        </div>
        <div class="ProseMirror version-dom">${this._versionDom}</div>
        ${this._compareDom ? renderCompareModal({
    title: 'Compare with current document',
    labelA: 'Current Document',
    labelB: `Version: ${this.label || ''}`,
    compareDom: this._compareDom,
    onClose: () => this.handleCloseCompare(),
  }) : nothing}
      </div>
    `;
  }
}

customElements.define('ew-version-preview', EwVersionPreview);
