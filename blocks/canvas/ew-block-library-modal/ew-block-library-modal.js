import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import getSheet from '../../shared/sheet.js';
import {
  loadBlockLibrary,
  getItemPreviewUrl,
  getPreviewStatus,
} from '../ew-panel-extensions/helpers.js';

const nx = getNx();
await import(`${nx}/blocks/shared/dialog/dialog.js`);
const { loadStyle, hashChange } = await import(`${nx}/utils/utils.js`);
const [buttonsStyle, formStyle, style] = await Promise.all([
  getSheet(`${getNx2()}/styles/buttons.css`),
  getSheet(`${getNx2()}/styles/form.css`),
  loadStyle(import.meta.url),
]);

const CHEVRON_ICON_SRC = '/img/icons/s2-icon-chevronright-20-n.svg';
const SEARCH_ICON_SRC = '/img/icons/s2-icon-search-20-n.svg';
const INFO_ICON_SRC = '/img/icons/s2-icon-infocircle-20-n.svg';
const ADD_ICON_SRC = '/img/icons/s2-icon-addcircle-20-n.svg';

const VIEWPORTS = [
  ['desktop', 'Desktop', '100%', '/img/icons/s2-icon-devicedesktop-20-n.svg'],
  ['tablet', 'Tablet', '768px', '/img/icons/s2-icon-devicetablet-20-n.svg'],
  ['mobile', 'Mobile', '390px', '/img/icons/s2-icon-devicephone-20-n.svg'],
];

function andMatch(query, target) {
  const terms = query.split(/\s+/).filter(Boolean);
  return terms.every((term) => target.includes(term));
}

function blockSearchText(block) {
  return (block?.name || '').toLowerCase();
}

function variantSearchText(block, variant) {
  return [
    block?.name,
    variant?.name,
    variant?.variants,
    variant?.tags,
    variant?.description,
  ].filter(Boolean).join(' ').toLowerCase();
}

class EwBlockLibraryModal extends LitElement {
  static properties = {
    blocks: { attribute: false },
    onInsert: { attribute: false },
    heading: { attribute: false },
    _blocks: { state: true },
    _variantsByPath: { state: true },
    _expandedPath: { state: true },
    _selectedPath: { state: true },
    _previewInfo: { state: true },
    _viewport: { state: true },
    _hashState: { state: true },
    _search: { state: true },
    _openDescriptions: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [buttonsStyle, formStyle, style];
    this._variantsByPath = new Map();
    this._openDescriptions = new Set();
    this._viewport = 'desktop';
    this._unsubHash = hashChange.subscribe((state) => { this._hashState = state; });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubHash?.();
  }

  willUpdate(changed) {
    if (changed.has('blocks')) {
      this._populateBlocks(this.blocks);
    }
  }

  _populateBlocks(blocks) {
    this._blocks = blocks || [];
    // Resolve every block's variants so search can match against them.
    (blocks || []).forEach(async (block) => {
      if (this._variantsByPath.has(block.path)) return;
      const variants = await block.loadVariants;
      const next = new Map(this._variantsByPath);
      next.set(block.path, variants ?? []);
      this._variantsByPath = next;
    });
  }

  _filteredBlocks() {
    const q = (this._search || '').trim().toLowerCase();
    if (!q || !this._blocks) return this._blocks || [];
    return this._blocks.filter((b) => {
      if (andMatch(q, blockSearchText(b))) return true;
      const variants = this._variantsByPath.get(b.path) || [];
      return variants.some((v) => andMatch(q, variantSearchText(b, v)));
    });
  }

  _filteredVariants(block) {
    const variants = this._variantsByPath.get(block.path) || [];
    const q = (this._search || '').trim().toLowerCase();
    if (!q) return variants;
    if (andMatch(q, blockSearchText(block))) return variants;
    return variants.filter((v) => andMatch(q, variantSearchText(block, v)));
  }

  _toggleDescription(variant) {
    const next = new Set(this._openDescriptions);
    if (next.has(variant)) next.delete(variant);
    else next.add(variant);
    this._openDescriptions = next;
  }

  _isExpanded(block) {
    if ((this._search || '').trim()) return true;
    return this._expandedPath === block.path;
  }

  _onSearchInput = (e) => {
    this._search = e.target.value;
  };

  _onDialogClose = () => {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  };

  _close() {
    const dialog = this.shadowRoot.querySelector('nx-dialog');
    if (dialog) dialog.close();
    else this._onDialogClose();
  }

  async _selectBlock(block) {
    const willExpand = this._expandedPath !== block.path;
    this._expandedPath = willExpand ? block.path : null;
    if (willExpand && !this._variantsByPath.has(block.path)) {
      const variants = await block.loadVariants;
      const next = new Map(this._variantsByPath);
      next.set(block.path, variants ?? []);
      this._variantsByPath = next;
    }
    this._selectedPath = block.path;
    this._loadPreview(block);
  }

  async _loadPreview(block) {
    const { org, site } = this._hashState || {};
    if (!org || !site) {
      this._previewInfo = null;
      return;
    }
    const details = getItemPreviewUrl(block, { org, site });
    const url = details.previewUrl;
    this._previewInfo = { path: block.path, name: block.name, url, ok: undefined };
    const ok = await getPreviewStatus({
      org: details.org,
      site: details.site,
      pathname: details.pathname,
    });
    if (this._previewInfo?.url === url) {
      this._previewInfo = { ...this._previewInfo, ok };
    }
  }

  _addVariant(variant) {
    if (!variant) return;
    this.onInsert?.(variant.dom);
    this._close();
  }

  _renderBlockNode(block) {
    const expanded = this._isExpanded(block);
    const selected = this._selectedPath === block.path;
    const variants = this._variantsByPath.has(block.path)
      ? this._filteredVariants(block)
      : undefined;
    return html`
      <li class="modal-tree-block" role="treeitem" aria-expanded=${expanded}>
        <button type="button"
                class="modal-tree-row ${selected ? 'is-selected' : ''}"
                @click=${() => this._selectBlock(block)}>
          <svg aria-hidden="true" class="modal-tree-caret ${expanded ? 'is-expanded' : ''}"
               viewBox="0 0 20 20">
            <use href="${CHEVRON_ICON_SRC}#icon"></use>
          </svg>
          <span class="modal-tree-label">${block.name}</span>
        </button>
        ${expanded ? this._renderVariantList(block, variants) : nothing}
      </li>`;
  }

  _renderVariantList(block, variants) {
    if (variants === undefined) {
      return html`<div class="modal-tree-loading">Loading variants…</div>`;
    }
    if (!variants.length) {
      return html`<div class="modal-tree-loading">No variants found.</div>`;
    }
    return html`
      <ul class="modal-tree-variants" role="group">
        ${variants.map((v) => this._renderVariantItem(block, v))}
      </ul>`;
  }

  _renderVariantItem(block, v) {
    const description = v.description?.trim();
    const isOpen = this._openDescriptions.has(v);
    return html`
      <li role="treeitem">
        <div class="modal-tree-variant-row">
          <span class="modal-tree-row modal-tree-row-variant">
            <span class="modal-tree-label">
              ${v.name}${v.variants
    ? html` <span class="modal-tree-subtitle">${v.variants}</span>`
    : nothing}
            </span>
          </span>
          ${description ? html`
            <button type="button"
                    class="nx-action-btn-icon nx-btn-sm modal-tree-info"
                    aria-label="Show description"
                    aria-expanded=${isOpen}
                    @click=${() => this._toggleDescription(v)}>
              <svg aria-hidden="true" viewBox="0 0 20 20">
                <use href="${INFO_ICON_SRC}#icon"></use>
              </svg>
            </button>` : nothing}
          <button type="button"
                  class="nx-action-btn-icon nx-btn-sm modal-tree-add"
                  aria-label="Add ${v.name} to page"
                  @click=${() => this._addVariant(v)}>
            <svg aria-hidden="true" viewBox="0 0 20 20">
              <use href="${ADD_ICON_SRC}#icon"></use>
            </svg>
          </button>
        </div>
        ${description && isOpen ? html`
          <div class="modal-tree-description">${description}</div>` : nothing}
      </li>`;
  }

  _renderTree() {
    if (this._blocks === undefined) {
      return html`<div class="modal-state">Loading blocks…</div>`;
    }
    if (!this._blocks.length) {
      return html`<div class="modal-state">No blocks found.</div>`;
    }
    const filtered = this._filteredBlocks();
    if (!filtered.length) {
      return html`<div class="modal-state">No matches.</div>`;
    }
    return html`
      <ul class="modal-tree" role="tree">
        ${filtered.map((block) => this._renderBlockNode(block))}
      </ul>`;
  }

  _renderSearch() {
    return html`
      <div class="modal-search">
        <svg aria-hidden="true" class="modal-search-icon" viewBox="0 0 20 20">
          <use href="${SEARCH_ICON_SRC}#icon"></use>
        </svg>
        <input type="search"
               class="nx-input modal-search-input"
               placeholder="Search blocks"
               aria-label="Search blocks"
               .value=${this._search || ''}
               @input=${this._onSearchInput}>
      </div>`;
  }

  _renderViewportBar() {
    return html`
      <div class="modal-preview-toolbar" role="group" aria-label="Preview width">
        ${VIEWPORTS.map(([id, label, , icon]) => html`
          <button type="button"
                  class="nx-action-btn-icon modal-viewport-btn ${this._viewport === id ? 'is-active' : ''}"
                  aria-label=${label}
                  title=${label}
                  aria-pressed=${this._viewport === id}
                  @click=${() => { this._viewport = id; }}>
            <svg aria-hidden="true" viewBox="0 0 20 20"><use href="${icon}#icon"></use></svg>
          </button>`)}
      </div>`;
  }

  _renderPreview() {
    if (!this._previewInfo) {
      return html`<div class="modal-preview-placeholder">
        Select a block to see a preview.
      </div>`;
    }
    const { name, url, ok } = this._previewInfo;
    const hideIframe = ok === false ? 'hide-iframe' : '';
    const error = ok === false ? `It appears ${name} has not been previewed.` : '';
    const width = VIEWPORTS.find(([id]) => id === this._viewport)?.[2] || '100%';
    return html`
      ${error ? html`<div class="modal-preview-error"><p>${error}</p></div>` : nothing}
      <div class="modal-preview-stage">
        <div class="modal-preview-viewport" style="width:${width}">
          <iframe class="modal-preview-frame ${hideIframe}" src=${url}
                  title="Preview of ${name}"
                  allow="clipboard-write *"></iframe>
        </div>
      </div>`;
  }

  render() {
    return html`
      <nx-dialog class="modal" @close=${this._onDialogClose}>
        <div class="modal-content">
          <header class="modal-header">
            <span class="modal-title">${this.heading ?? 'Insert block'}</span>
            <button type="button" class="nx-action-btn-icon nx-btn-sm"
                    aria-label="Close" @click=${() => this._close()}>✕</button>
          </header>
          <div class="modal-body">
            <aside class="modal-tree-wrap">
              ${this._renderSearch()}
              ${this._renderTree()}
            </aside>
            <section class="modal-preview-wrap">
              ${this._previewInfo ? this._renderViewportBar() : nothing}
              ${this._renderPreview()}
            </section>
          </div>
        </div>
      </nx-dialog>`;
  }
}

customElements.define('ew-block-library-modal', EwBlockLibraryModal);

export async function openBlockLibraryModal({ onInsert, heading } = {}) {
  if (document.body.querySelector('ew-block-library-modal')) return;

  let hashState;
  const unsub = hashChange.subscribe((s) => { hashState = s; });
  unsub();
  const { org, site } = hashState || {};

  // Reuses the slash-menu prefetch cache, so this is instant once warmed.
  const { ext, blocks } = await loadBlockLibrary(org, site);
  if (!ext) return;

  const modal = document.createElement('ew-block-library-modal');
  modal.blocks = blocks;
  modal.onInsert = onInsert;
  modal.heading = heading;
  modal.addEventListener('close', () => modal.remove(), { once: true });
  document.body.append(modal);
}
