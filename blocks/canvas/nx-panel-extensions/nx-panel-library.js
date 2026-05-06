import { LitElement, html, nothing } from 'da-lit';
import { loadStyle, HashController } from '../../shared/nxutils.js';
import {
  fetchBlocks,
  fetchItems,
  insertBlock,
  insertText,
  insertTemplate,
  getPreviewStatus,
  getItemPreviewUrl,
} from './helpers.js';
import { getExtensionsBridge } from '../editor-utils/extensions-bridge.js';
const style = await loadStyle(import.meta.url);

const iconAdd = () => html`<img class="ext-icon" src="/blocks/edit/img/S2_Icon_ExperienceAdd_20_N.svg" aria-hidden="true">`;
const iconPreview = () => html`<img class="ext-icon" src="/blocks/edit/img/S2_Icon_ExperiencePreview_20_N.svg" aria-hidden="true">`;

/**
 * First-party library panel: blocks, templates, icons, placeholders (OOTB sheet-driven tools).
 */
class NxPanelLibrary extends LitElement {
  static properties = {
    extension: { attribute: false },
    _items: { state: true },
    _blockVariants: { state: true },
    _expandedBlock: { state: true },
    _preview: { state: true },
    _tooltipOpen: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._hash = new HashController(this);
  }

  willUpdate(changed) {
    if (changed.has('extension') && this.extension) {
      this._items = undefined;
      this._blockVariants = new Map();
      this._expandedBlock = null;
      this._preview = undefined;
      this._tooltipOpen = null;
      this._loadItems();
    }
  }

  updated() {
    const dialog = this.shadowRoot.querySelector('dialog');
    if (dialog && !dialog.open) dialog.showModal();
  }

  async _loadItems() {
    const ext = this.extension;
    if (!ext) return;

    if (!ext.ootb) return;

    if (ext.name === 'blocks') {
      this._items = await fetchBlocks(ext.sources);
      return;
    }

    let defaultFormat = '';
    if (ext.name === 'icons') defaultFormat = ':<content>:';
    else if (ext.name === 'placeholders') defaultFormat = '{{<content>}}';
    this._items = await fetchItems(ext.sources, ext.format || defaultFormat);
  }

  async _toggleBlock(block) {
    if (this._expandedBlock === block.path) {
      this._expandedBlock = null;
      return;
    }
    this._expandedBlock = block.path;
    if (!this._blockVariants.has(block.path)) {
      const variants = await block.loadVariants;
      const next = new Map(this._blockVariants);
      next.set(block.path, variants ?? []);
      this._blockVariants = next;
    }
  }

  _insertBlock(variant) {
    const { view } = getExtensionsBridge();
    if (!view) return;
    insertBlock(view, variant.dom);
  }

  _insertText(item) {
    const { view } = getExtensionsBridge();
    if (!view) return;
    insertText(view, item.text);
  }

  async _insertTemplate(item) {
    const { view } = getExtensionsBridge();
    if (!view) return;
    await insertTemplate(view, item.path);
  }

  async _openPreview(item) {
    const { org, site } = this._hash.value || {};
    if (!org || !site) return;
    const details = getItemPreviewUrl(item, { org, site });
    this._preview = {
      name: item.name || item.key || item.title,
      url: details.previewUrl,
    };
    this._preview.ok = await getPreviewStatus({
      org: details.org,
      site: details.site,
      pathname: details.pathname,
    });
    this.requestUpdate();
  }

  async _closePreview() {
    this._preview = undefined;
    await this.updateComplete;
    this.shadowRoot.querySelector('button')?.focus();
  }

  _toggleTooltip(key) {
    this._tooltipOpen = this._tooltipOpen === key ? null : key;
  }

  _renderVariants(block) {
    if (this._expandedBlock !== block.path) return nothing;
    const variants = this._blockVariants.get(block.path);
    if (variants === undefined) {
      return html`<div class="ext-variants-loading">Loading variants…</div>`;
    }
    if (!variants.length) {
      return html`<div class="ext-variants-loading">No variants found.</div>`;
    }
    return html`
      <ul class="ext-variant-list">
        ${variants.map((v) => html`
          <li class="ext-variant-item">
            <div class="ext-variant-header">
              <button class="ext-variant-title" @click=${() => this._insertBlock(v)}>
                <span class="ext-variant-name">${v.name}</span>
                ${v.variants ? html`<span class="ext-variant-subtitle">${v.variants}</span>` : nothing}
              </button>
              <div class="ext-variant-actions">
                ${v.description ? html`
                  <button class="ext-action-btn" aria-label="Info"
                    @click=${() => this._toggleTooltip(v.name)}>ℹ</button>` : nothing}
                <button class="ext-action-btn ext-add-btn" aria-label="Add"
                  @click=${() => this._insertBlock(v)}>${iconAdd()}</button>
              </div>
            </div>
            ${v.description && this._tooltipOpen === v.name
              ? html`<div class="ext-description">${v.description}</div>` : nothing}
          </li>
        `)}
      </ul>
    `;
  }

  _renderBlocks() {
    if (this._items === undefined) return html`<div class="ext-state">Loading…</div>`;
    if (!this._items.length) return html`<div class="ext-state">No blocks found.</div>`;
    return html`
      <ul class="ext-list">
        ${this._items.map((block) => html`
          <li class="ext-group">
            <div class="ext-group-header">
              <button class="ext-group-title" @click=${() => this._toggleBlock(block)}>
                <span class="ext-item-name">${block.name}</span>
                <span class="ext-expand-icon">${this._expandedBlock === block.path ? '▾' : '▸'}</span>
              </button>
              <button class="ext-action-btn ext-preview-btn" aria-label="Preview"
                @click=${() => this._openPreview(block)}>${iconPreview()}</button>
            </div>
            ${this._renderVariants(block)}
          </li>
        `)}
      </ul>
    `;
  }

  _renderTemplates() {
    if (this._items === undefined) return html`<div class="ext-state">Loading…</div>`;
    if (!this._items.length) return html`<div class="ext-state">No templates found.</div>`;
    return html`
      <ul class="ext-list">
        ${this._items.map((item) => html`
          <li class="ext-item">
            <button class="ext-item-title" @click=${() => this._insertTemplate(item)}>
              <span class="ext-item-name">${item.name ?? item.key ?? item.title ?? item.value}</span>
            </button>
            <div class="ext-item-actions">
              <button class="ext-action-btn ext-preview-btn" aria-label="Preview"
                @click=${() => this._openPreview(item)}>${iconPreview()}</button>
              <button class="ext-action-btn ext-add-btn" aria-label="Add"
                @click=${() => this._insertTemplate(item)}>${iconAdd()}</button>
            </div>
          </li>
        `)}
      </ul>
    `;
  }

  _renderKeyValueItems(label) {
    if (this._items === undefined) return html`<div class="ext-state">Loading…</div>`;
    if (!this._items.length) return html`<div class="ext-state">No ${label} found.</div>`;
    return html`
      <ul class="ext-list">
        ${this._items.map((item) => html`
          <li class="ext-item">
            <button class="ext-item-title" @click=${() => this._insertText(item)}>
              <span class="ext-item-name">${item.key || item.name || item.value}</span>
              ${item.value && item.value !== item.key
                ? html`<span class="ext-item-value">${item.value}</span>` : nothing}
            </button>
            <div class="ext-item-actions">
              <button class="ext-action-btn ext-add-btn" aria-label="Add"
                @click=${() => this._insertText(item)}>${iconAdd()}</button>
            </div>
          </li>
        `)}
      </ul>
    `;
  }

  _renderPreviewDialog() {
    if (!this._preview) return nothing;
    const { ok, name, url } = this._preview;
    const hideIframe = ok === undefined || ok === false ? 'hide-iframe' : '';
    const error = ok === false
      ? `It appears ${name} has not been previewed.`
      : undefined;

    return html`
      <dialog class="ext-preview-dialog" @close=${() => this._closePreview()}>
        <div class="ext-preview-header">
          <p class="ext-preview-title">${name} preview</p>
          <button class="ext-preview-close" @click=${() => this._closePreview()}>✕</button>
        </div>
        <div class="ext-preview-body">
          ${error ? html`<div class="ext-preview-error"><p>${error}</p></div>` : nothing}
          <iframe class="ext-preview-frame ${hideIframe}" src=${url}
            allow="clipboard-write *"></iframe>
        </div>
      </dialog>
    `;
  }

  render() {
    const ext = this.extension;
    if (!ext) {
      return html`<div class="ext-state">No extension.</div>`;
    }

    const body = (() => {
      if (ext.name === 'blocks') return this._renderBlocks();
      if (ext.name === 'templates') return this._renderTemplates();
      return this._renderKeyValueItems(ext.name);
    })();

    return html`${body}${this._renderPreviewDialog()}`;
  }
}

customElements.define('nx-panel-library', NxPanelLibrary);
