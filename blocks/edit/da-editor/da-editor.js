import { DOMParser as proseDOMParser } from 'da-y-wrapper';
import { LitElement, html, nothing } from 'da-lit';
import initProse from '../prose/index.js';
import getSheet from '../../shared/sheet.js';
import { initIms, daFetch, saveToDa } from '../../shared/utils.js';
import { parse, aem2prose } from '../utils/helpers.js';

const sheet = await getSheet('/blocks/edit/da-editor/da-editor.css');

const getDateStr = (timestamp) => {
  const date = new Date(timestamp);
  return `${date.toLocaleDateString()}-${date.toLocaleTimeString()}`;
};

const getVersionCopyName = async (_path) => {
  let path = _path;
  let isAvailableFilename = false;
  let i = 1;

  while (!isAvailableFilename) {
    const resp = await daFetch(path, { method: 'HEAD' });
    if (resp.ok) {
      const match = path.match(/-(\d+)\.html$/);
      if (match) {
        i = parseInt(match[1], 10) + 1;
      }
      path = match
        ? path.replace(/-(\d+)?\.html$/, `-${i}.html`)
        : path.replace(/\.html$/, `-${i}.html`);
      i += 1;
    } else {
      isAvailableFilename = true;
    }
  }
  return path;
};

export default class DaEditor extends LitElement {
  static properties = {
    path: { type: String },
    version: { type: String },
    versionLabel: { type: String },
    versionDate: { type: String },
    _imsLoaded: { state: false },
    _versionDom: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.shadowRoot.createRange = () => document.createRange();
    initIms().then(() => { this._imsLoaded = true; });
  }

  disconnectWebsocket() {
    if (this.wsProvider) {
      this.wsProvider.disconnect({ data: 'Client navigation' });
      this.wsProvider = undefined;
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.disconnectWebsocket();
  }

  async fetchVersion() {
    const resp = await daFetch(this.version);
    if (!resp.ok) return;
    const text = await resp.text();
    const doc = parse(text);
    const proseDom = aem2prose(doc);
    const flattedDom = document.createElement('div');
    flattedDom.append(...proseDom);
    flattedDom.querySelectorAll('table').forEach((table) => {
      const div = document.createElement('div');
      div.className = 'tableWrapper';
      table.insertAdjacentElement('afterend', div);
      div.append(table);
    });
    this._versionDom = flattedDom;
    // Save raw html for saving as copy
    this._versionHtml = text;
  }

  handleCancel() {
    const opts = { bubbles: true, composed: true };
    const event = new CustomEvent('versionreset', opts);
    this.dispatchEvent(event);
    this._versionDom = null;
  }

  async handleSaveCopy() {
    const versionName = (this.versionLabel || getDateStr(this.versionDate)).replaceAll(' ', '-');
    let newPath = this.path
      .replace('.html', `-${versionName}.html`)
      .toLowerCase();

    newPath = await getVersionCopyName(newPath);
    newPath = newPath.replace('https://admin.da.live/source', '');

    saveToDa({
      path: newPath,
      blob: new Blob([this._versionHtml], { type: 'text/html' }),
    });
    // eslint-disable-next-line no-alert
    alert(`Version saved as copy:\n${newPath.replace('https://admin.da.live/source', '')}`);
    this.handleCancel();
  }

  handleRestore() {
    const { schema, doc } = window.view.state;
    const newDoc = proseDOMParser.fromSchema(schema).parse(this._versionDom);
    const tr = window.view.state.tr.replaceWith(0, doc.content.size, newDoc.content);

    const newState = window.view.state.apply(tr);
    window.view.updateState(newState);
    this.handleCancel();
  }

  renderVersion() {
    return html`
      <div class="da-prose-mirror da-version-preview">
        <div class="da-version-action-area">
          <button @click=${this.handleCancel}>Cancel</button>
          <button @click=${this.handleSaveCopy}>Save as Copy</button>
          <button class="accent" @click=${this.handleRestore}>Restore</button>
        </div>
        <div class="ProseMirror">${this._versionDom}</div>
      </div>`;
  }

  render() {
    if (this.version && !this._versionDom) this.fetchVersion();
    if (!this._imsLoaded) return null;
    return html`
      <div class="da-prose-mirror"></div>
      ${this._versionDom ? this.renderVersion() : nothing}
    `;
  }

  updated(props) {
    if (!this._imsLoaded) return;
    if (!(props.has('version') || props.has('_versionDom'))) {
      this.disconnectWebsocket();
      const prose = this.shadowRoot.querySelector('.da-prose-mirror');
      prose.innerHTML = '';
      this.wsProvider = initProse({ editor: prose, path: this.path });
    }
  }
}

customElements.define('da-editor', DaEditor);
