import { DOMParser as proseDOMParser, DOMSerializer } from 'da-y-wrapper';
import { LitElement, html, nothing } from 'da-lit';
import getSheet from '../../shared/sheet.js';
import { initIms, daFetch } from '../../shared/utils.js';
import { setDaMetadata } from '../utils/helpers.js';
import convertHtmlToProsemirror from '../../shared/convertHtml.js';

const sheet = await getSheet('/blocks/edit/da-editor/da-editor.css');

export default class DaEditor extends LitElement {
  static properties = {
    path: { type: String },
    version: { type: String },
    proseEl: { attribute: false },
    wsProvider: { attribute: false },
    permissions: { state: true },
    _imsLoaded: { state: false },
    _versionDom: { state: true },
    _daMetadata: { state: true },
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
    const htmlContent = await resp.text();

    try {
      // Use da-collab's convert API for consistent HTML-to-ProseMirror conversion
      const { prosemirror, daMetadata } = await convertHtmlToProsemirror(htmlContent);
      this._daMetadata = daMetadata;

      // Reconstruct DOM from ProseMirror JSON for preview
      const { schema } = window.view.state;
      const doc = schema.nodeFromJSON(prosemirror);
      const serializer = DOMSerializer.fromSchema(schema);
      const fragment = serializer.serializeFragment(doc.content);

      const flattedDom = document.createElement('div');
      flattedDom.append(fragment);
      flattedDom.querySelectorAll('table').forEach((table) => {
        const div = document.createElement('div');
        div.className = 'tableWrapper';
        table.insertAdjacentElement('afterend', div);
        div.append(table);
      });
      this._versionDom = flattedDom;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch version:', err);
    }
  }

  handleCancel() {
    const opts = { bubbles: true, composed: true };
    const event = new CustomEvent('versionreset', opts);
    this.dispatchEvent(event);
    this._versionDom = null;
  }

  handleRestore() {
    const { schema, doc } = window.view.state;
    const newDoc = proseDOMParser.fromSchema(schema).parse(this._versionDom);
    const tr = window.view.state.tr.replaceWith(0, doc.content.size, newDoc.content);

    const newState = window.view.state.apply(tr);
    window.view.updateState(newState);

    // Restore document metadata to yMap
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
          <button @click=${this.handleCancel}>Cancel</button>
          <button class="accent" @click=${this.handleRestore} ?disabled=${!this._canWrite}>Restore</button>
        </div>
        <div class="ProseMirror">${this._versionDom}</div>
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

    // Do not setup prosemirror until we know the permissions
    if (props.has('proseEl') && this.path && this.permissions) {
      if (this._proseEl) this._proseEl.remove();
      this.shadowRoot.append(this.proseEl);
      const pm = this.shadowRoot.querySelector('.ProseMirror');
      if (pm) pm.contentEditable = 'false';
    }
  }
}

customElements.define('da-editor', DaEditor);
