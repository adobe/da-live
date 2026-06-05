import { LitElement, html } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { initIms } from '../../shared/utils.js';
import { getPreviewOrigin, fetchWysiwygCookie } from '../editor-utils/editor-utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const style = await loadStyle(import.meta.url);

const CHANNEL_NAME = 'da-drafts-preview';

class EwDraftPreview extends LitElement {
  static properties = {
    obsId: { attribute: false },
    onClose: { attribute: false },
    items: { attribute: false },
    org: { attribute: false },
    site: { attribute: false },
    _activeTab: { state: true },
    _cookieReady: { state: true },
  };

  constructor() {
    super();
    this.items = [];
    this._activeTab = 0;
    this._cookieReady = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._channel = new BroadcastChannel(CHANNEL_NAME);
    this._channel.onmessage = ({ data }) => {
      if (this.obsId && data.obsId !== this.obsId) return;
      this.items = data.items ?? [];
      this.org = data.org;
      this.site = data.site;
      this._activeTab = 0;
    };
    initIms().then(async (ims) => {
      const token = ims?.accessToken?.token;
      if (token) {
        await fetchWysiwygCookie({ org: this.org, repo: this.site, token }).catch(() => { });
      }
      this._cookieReady = true;
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._channel?.close();
  }

  _previewUrl(item) {
    if (!this.org || !this.site) return '';
    const prefix = `/${this.org}/${this.site}`;
    const rel = item.path.startsWith(prefix) ? item.path.slice(prefix.length) : item.path;
    const withoutExt = item.ext ? rel.slice(0, -(item.ext.length + 1)) : rel;
    return `${getPreviewOrigin(this.org, this.site)}${withoutExt}?quick-edit=on`;
  }

  _promotePost(item) {
    const prefix = `/${this.org}/${this.site}`;
    const rel = item.path.startsWith(prefix) ? item.path.slice(prefix.length) : item.path;
    const path = item.ext ? rel.slice(0, -(item.ext.length + 1)) : rel;
    window.postMessage({ type: 'nx-open-chat' }, '*');
    if (this.obsId) {
      try {
        const stored = JSON.parse(sessionStorage.getItem('nc-completed') ?? '[]');
        sessionStorage.setItem('nc-completed', JSON.stringify([...new Set([...stored, this.obsId])]));
      } catch { /* ignore */ }
    }
    document.dispatchEvent(new CustomEvent('nx-set-prompt', { detail: { text: `use promote-post skill with ${path} page`, autoSend: true } }));
    this.onClose?.();
  }

  _openInCanvas(item) {
    const hash = item.ext
      ? item.path.slice(1, -(item.ext.length + 1))
      : item.path.replace(/^\//, '');
    window.location.hash = `/${hash}`;
    document.querySelector('ew-canvas-header')?.dispatchEvent(
      new CustomEvent('nx-canvas-open-panel', { detail: { position: 'after', panelName: 'versions' } }),
    );
    this.onClose?.();
  }

  render() {
    if (!this.items.length) {
      return html`<p class="dp-empty">Select "Preview drafts" in Nerve Center to preview content here.</p>`;
    }
    return html`
      <div class="dp-tabs" role="tablist">
        ${this.items.map((item, i) => html`
          <button role="tab" class="dp-tab ${i === this._activeTab ? 'dp-tab--active' : ''}"
            @click=${() => { this._activeTab = i; }}>
            ${item.name}
          </button>
        `)}
      </div>
      <div class="dp-panels">
        ${this.items.map((item, i) => html`
          <div class="dp-panel ${i === this._activeTab ? 'dp-panel--active' : ''}">
            <div class="dp-panel-inner">
              <iframe class="dp-frame" src=${this._cookieReady ? this._previewUrl(item) : ''} title=${item.name}></iframe>
              <div class="dp-actions">
                <button class="dp-promote-btn" @click=${() => this._promotePost(item)}>
                  Promote post
                </button>
                <button class="dp-edit-btn" @click=${() => this._openInCanvas(item)}>
                  Edit in Canvas
                </button>
              </div>
            </div>
          </div>
        `)}
      </div>
    `;
  }
}

customElements.define('ew-draft-preview', EwDraftPreview);
