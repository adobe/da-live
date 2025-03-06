import { DOMParser as proseDOMParser } from 'da-y-wrapper';
import { LitElement, html, nothing } from 'da-lit';
import getSheet from '../../shared/sheet.js';
import { initIms, daFetch } from '../../shared/utils.js';
import { parse, aem2prose } from '../utils/helpers.js';

const sheet = await getSheet('/blocks/edit/da-editor/da-editor.css');

async function loadServiceWorker() {
  if ('serviceWorker' in navigator) {
    // declaring scope manually
    try {
      const sw = await navigator.serviceWorker.register("/sw.js", { scope: "" });
      console.log('Service worker registered', sw);
      await sw.ready;
      console.log('Service worker ready');
      return sw;
    } catch (error) {
      console.error(`Service worker registration failed: ${error}`);
    }
  } else {
    console.error("Service workers are not supported.");
  }

  return null;
}

export default class DaEditor extends LitElement {
  static properties = {
    path: { type: String },
    version: { type: String },
    proseEl: { attribute: false },
    wsProvider: { attribute: false },
    permissions: { state: true },
    _imsLoaded: { state: false },
    _versionDom: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.shadowRoot.createRange = () => document.createRange();
    initIms().then(async ({ accessToken }) => { 
      this._imsLoaded = true;
      const sw = await loadServiceWorker();
      if (sw) {
        console.log('Sending access token to service worker');
        sw.active.postMessage.postMessage({
          type: 'SET_ACCESS_TOKEN',
          accessToken,
        });
      } else {
        console.log('No service worker controller found');
      }
    });
  }

  async fetchVersion() {
    this._versionDom = null;
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
    }
  }
}

customElements.define('da-editor', DaEditor);
