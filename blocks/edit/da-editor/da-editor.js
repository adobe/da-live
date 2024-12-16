import { DOMParser as proseDOMParser } from 'da-y-wrapper';
import { LitElement, html, nothing } from 'da-lit';
import initProse from '../prose/index.js';
import getSheet from '../../shared/sheet.js';
import { initIms, daFetch } from '../../shared/utils.js';
import { parse, aem2prose } from '../utils/helpers.js';

const sheet = await getSheet('/blocks/edit/da-editor/da-editor.css');

export default class DaEditor extends LitElement {
  static properties = {
    path: { type: String },
    version: { type: String },
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
    this.handleCancel();
  }

  renderVersion() {
    return html`
      <div class="da-prose-mirror da-version-preview">
        <div class="da-version-action-area">
          <button @click=${this.handleCancel}>Cancel</button>
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

  async getPermissions() {
    const resp = await daFetch(this.path, { method: 'HEAD' });

    const pragma = resp.headers.get('Pragma');
    const idx = pragma.indexOf('X-da-actions ');
    if (idx === -1) return [];

    const idx2 = pragma.indexOf(';', idx);
    const daActions = pragma.substring(idx + 'X-da-actions '.length, idx2);

    // const daActions = resp.headers.get('X-da-actions');
    if (!daActions) return [];
    const actions = daActions.split('=');
    if (actions) {
      return actions[1].split(',');
    }
    return [];
  }

  async updated(props) {
    if (!this._imsLoaded) return;
    if (!(props.has('version') || props.has('_versionDom'))) {
      this.disconnectWebsocket();
      const prose = this.shadowRoot.querySelector('.da-prose-mirror');
      prose.innerHTML = '';

      const permissions = await this.getPermissions();
      this.wsProvider = initProse({ editor: prose, path: this.path, permissions });

      const titleEl = this.ownerDocument.querySelector('da-title')?.shadowRoot?.querySelector('.da-title-inner');
      const verBtn = this.parentElement.querySelector('button.show-versions');

      titleEl.classList.remove('da-title-readonly');
      prose.classList.remove('da-prose-mirror-readonly');
      prose.querySelector('.ProseMirror')?.setAttribute('contenteditable', permissions.includes('write'));
      verBtn.removeAttribute('disabled');
      if (!permissions.includes('write')) {
        titleEl.classList.add('da-title-readonly');
        prose.classList.add('da-prose-mirror-readonly');
        verBtn.setAttribute('disabled', '');
      }
    }
  }
}

customElements.define('da-editor', DaEditor);
