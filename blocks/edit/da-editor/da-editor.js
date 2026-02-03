import { DOMParser as proseDOMParser } from 'da-y-wrapper';
import { LitElement, html, nothing } from 'da-lit';
import getSheet from '../../shared/sheet.js';
import { initIms, daFetch, initLocalDevImageLoader } from '../../shared/utils.js';
import { getMetadata, parse, aem2prose, setDaMetadata } from '../utils/helpers.js';

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
    const text = await resp.text();
    const doc = parse(text);
    this._daMetadata = getMetadata(doc.querySelector('body > .da-metadata'));
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

      // LOCAL DEV ONLY: Initialize authenticated image loading
      // This is a no-op in production (content.da.live serves images publicly)
      // In local dev, images need auth to load from R2 via da-admin
      // Use requestAnimationFrame to ensure ProseMirror is fully rendered
      requestAnimationFrame(() => {
        const pmElement = this.shadowRoot.querySelector('.ProseMirror');
        if (this.path && pmElement) {
          // Extract org/repo from path URL
          // path is like "http://localhost:8787/source/org/repo/page.html"
          // or "https://admin.da.live/source/org/repo/page.html"
          try {
            const url = new URL(this.path);
            // pathname is like "/source/org/repo/page.html"
            const pathParts = url.pathname.split('/').filter(Boolean);
            // Skip "source" to get [org, repo, page]
            const sourceIdx = pathParts.indexOf('source');
            if (sourceIdx !== -1 && pathParts.length > sourceIdx + 2) {
              const org = pathParts[sourceIdx + 1];
              const repo = pathParts[sourceIdx + 2];
              const orgRepo = `${org}/${repo}`;
              console.log('[DA-Editor] Initializing image loader for:', orgRepo);
              // Clean up previous loader if exists
              if (this._imageLoaderCleanup) {
                this._imageLoaderCleanup();
              }
              this._imageLoaderCleanup = initLocalDevImageLoader(pmElement, orgRepo);
            }
          } catch (e) {
            console.warn('[DA-Editor] Could not parse path for image loader:', this.path, e);
          }
        }
      });
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Clean up image loader on disconnect
    if (this._imageLoaderCleanup) {
      this._imageLoaderCleanup();
    }
  }
}

customElements.define('da-editor', DaEditor);
