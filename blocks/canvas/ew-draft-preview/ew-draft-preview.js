import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { getLivePreviewUrl } from '../../shared/constants.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const style = await loadStyle(import.meta.url);

const STORAGE_KEY = 'da-drafts-preview';
const CHANNEL_NAME = 'da-drafts-preview';

class EwDraftPreview extends LitElement {
  static properties = {
    onClose: { attribute: false },
    _items: { state: true },
    _activeTab: { state: true },
    _org: { state: true },
    _site: { state: true },
  };

  constructor() {
    super();
    this._items = [];
    this._activeTab = 0;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];

    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (stored?.items?.length) {
        this._items = stored.items;
        this._org = stored.org;
        this._site = stored.site;
      }
    } catch { /* ignore */ }

    this._channel = new BroadcastChannel(CHANNEL_NAME);
    this._channel.onmessage = ({ data }) => {
      this._items = data.items ?? [];
      this._org = data.org;
      this._site = data.site;
      this._activeTab = 0;
    };
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._channel?.close();
  }

  _previewUrl(item) {
    if (!this._org || !this._site) return '';
    const prefix = `/${this._org}/${this._site}`;
    const rel = item.path.startsWith(prefix) ? item.path.slice(prefix.length) : item.path;
    const withoutExt = item.ext ? rel.slice(0, -(item.ext.length + 1)) : rel;
    return `${getLivePreviewUrl(this._org, this._site)}${withoutExt}`;
  }

  _openInCanvas(item) {
    const hash = item.ext
      ? item.path.slice(1, -(item.ext.length + 1))
      : item.path.replace(/^\//, '');
    window.location.hash = `/${hash}`;
    this.onClose?.();
  }

  render() {
    if (!this._items.length) {
      return html`<p class="dp-empty">Select "Preview drafts" in Nerve Center to preview content here.</p>`;
    }
    return html`
      <div class="dp-tabs" role="tablist">
        ${this._items.map((item, i) => html`
          <button role="tab" class="dp-tab ${i === this._activeTab ? 'dp-tab--active' : ''}"
            @click=${() => { this._activeTab = i; }}>
            ${item.name}
          </button>
        `)}
      </div>
      <div class="dp-panels">
        ${this._items.map((item, i) => html`
          <div class="dp-panel ${i === this._activeTab ? 'dp-panel--active' : ''}">
            <div class="dp-panel-inner">
              <iframe class="dp-frame" src=${this._previewUrl(item)} title=${item.name}></iframe>
              <div class="dp-actions">
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
