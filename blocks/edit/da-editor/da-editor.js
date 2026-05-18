import { DOMParser as proseDOMParser } from 'da-y-wrapper';
import { LitElement, html, nothing } from 'da-lit';
import getSheet from '../../shared/sheet.js';
import { initIms, daFetch } from '../../shared/utils.js';
import { setDaMetadata, htmlToProse } from '../utils/helpers.js';

const sheet = await getSheet('/blocks/edit/da-editor/da-editor.css');

function wrapTablesInWrappers(root) {
  root.querySelectorAll('table').forEach((table) => {
    if (table.parentElement?.classList.contains('tableWrapper')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'tableWrapper';
    table.replaceWith(wrapper);
    wrapper.appendChild(table);
  });
}

let daCompare;
async function loadDaCompare() {
  if (!daCompare) daCompare = await import('./da-compare.js');
  return daCompare;
}

export default class DaEditor extends LitElement {
  static properties = {
    path: { type: String },
    version: { type: String },
    versionLabel: { attribute: false },
    proseEl: { attribute: false },
    wsProvider: { attribute: false },
    permissions: { state: true },
    _imsLoaded: { state: false },
    _versionDom: { state: true },
    _daMetadata: { state: true },
    _compareDom: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.shadowRoot.createRange = () => document.createRange();
    initIms().then(() => { this._imsLoaded = true; });
  }

  async fetchVersion() {
    this._versionDom = null;
    const resp = await daFetch(this.version);
    if (!resp.ok) return;
    const text = await resp.text();

    const { dom, ydoc } = htmlToProse(text);

    const metadataMap = ydoc.getMap('daMetadata');
    this._daMetadata = Object.fromEntries(metadataMap.entries());
    wrapTablesInWrappers(dom);
    this._versionDom = dom;
  }

  handleCancel() {
    const opts = { bubbles: true, composed: true };
    const event = new CustomEvent('versionreset', opts);
    this.dispatchEvent(event);
    this._versionDom = null;
    this.handleCloseCompare();
  }

  async handleCompare() {
    const m = await loadDaCompare();
    m.compare({
      shadowRoot: this.shadowRoot,
      versionDom: this._versionDom,
      onClose: this.handleCloseCompare.bind(this),
      onResult: (dom, cleanup) => {
        this._compareDom = dom;
        this._compareCleanup = cleanup;
      },
    });
  }

  handleCloseCompare() {
    this._compareDom = null;
    this._compareCleanup?.();
  }

  handleRestore() {
    const { schema, doc } = window.view.state;
    const newDoc = proseDOMParser.fromSchema(schema).parse(this._versionDom);
    const tr = window.view.state.tr.replaceWith(0, doc.content.size, newDoc.content);

    const newState = window.view.state.apply(tr);
    window.view.updateState(newState);

    Object.entries(this._daMetadata).forEach(([key, value]) => {
      setDaMetadata(key, value);
    });

    this.handleCancel();
  }

  get _proseEl() {
    return this.shadowRoot.querySelector('.da-prose-mirror');
  }

  get _canWrite() {
    if (!this.permissions) return false;
    return this.permissions.some((permission) => permission === 'write');
  }

  renderVersion() {
    return html`
      <div class="da-prose-mirror da-version-preview">
        <div class="da-version-action-area">
          <h2 class="da-version-title">Version: ${this.versionLabel || ''}</h2>
          <div class="da-version-action-buttons">
            <button @click=${this.handleCancel}>Cancel</button>
            <button @click=${this.handleCompare}>Compare</button>
            <button class="accent" @click=${this.handleRestore} ?disabled=${!this._canWrite}>Restore</button>
          </div>
        </div>
        <div class="ProseMirror">${this._versionDom}</div>
        ${this._compareDom ? daCompare.renderModal(this.versionLabel, this._compareDom, this.handleCloseCompare.bind(this)) : nothing}
      </div>`;
  }

  render() {
    return html`
      ${this._versionDom ? this.renderVersion() : nothing}
    `;
  }

  async updated(props) {
    if (props.has('version') && this.version) {
      this.fetchVersion();
    }

    if (props.has('proseEl') && this.path && this.permissions) {
      if (this._proseEl) this._proseEl.remove();
      this.shadowRoot.append(this.proseEl);
      const pm = this.shadowRoot.querySelector('.ProseMirror');
      if (pm) pm.contentEditable = 'false';
    }
  }
}

customElements.define('da-editor', DaEditor);
