import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import {
  fetchBlocks,
  fetchExtensions,
  getItemPreviewUrl,
  getPreviewStatus,
} from '../ew-panel-extensions/helpers.js';

const nx = getNx();
await import(`${nx}/public/sl/components.js`);

const { loadStyle, hashChange } = await import(`${nx}/utils/utils.js`);
const style = await loadStyle(import.meta.url);

const CHEVRON_ICON_SRC = '/img/icons/s2-icon-chevronright-20-n.svg';
const SEARCH_ICON_SRC = '/img/icons/s2-icon-search-20-n.svg';

function matchesQuery(text, query) {
  return (text || '').toLowerCase().includes(query);
}

function variantMatches(variant, query) {
  return matchesQuery(variant?.name, query) || matchesQuery(variant?.variants, query);
}

class EwBlockLibraryModal extends LitElement {
  static properties = {
    extension: { attribute: false },
    onInsert: { attribute: false },
    _blocks: { state: true },
    _variantsByPath: { state: true },
    _expandedPath: { state: true },
    _selectedPath: { state: true },
    _selectedVariant: { state: true },
    _previewInfo: { state: true },
    _hashState: { state: true },
    _search: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._variantsByPath = new Map();
    this._unsubHash = hashChange.subscribe((state) => { this._hashState = state; });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubHash?.();
  }

  willUpdate(changed) {
    if (changed.has('extension') && this.extension) {
      this._loadBlocks();
    }
  }

  firstUpdated() {
    const dialog = this.shadowRoot.querySelector('dialog');
    dialog?.showModal();
  }

  async _loadBlocks() {
    this._blocks = undefined;
    if (!this.extension) return;
    const blocks = await fetchBlocks(this.extension.sources);
    this._blocks = blocks;
    // Prefetch variants for every block so search can match against them.
    blocks.forEach(async (block) => {
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
      if (matchesQuery(b.name, q)) return true;
      const variants = this._variantsByPath.get(b.path) || [];
      return variants.some((v) => variantMatches(v, q));
    });
  }

  _filteredVariants(block) {
    const variants = this._variantsByPath.get(block.path) || [];
    const q = (this._search || '').trim().toLowerCase();
    if (!q) return variants;
    if (matchesQuery(block.name, q)) return variants;
    return variants.filter((v) => variantMatches(v, q));
  }

  _isExpanded(block) {
    if ((this._search || '').trim()) return true;
    return this._expandedPath === block.path;
  }

  _onSearchInput = (e) => {
    this._search = e.target.value;
  };

  _clearSearch = () => {
    this._search = '';
    this.shadowRoot.querySelector('.modal-search-input')?.focus();
  };

  _onDialogClose = () => {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  };

  _close() {
    const dialog = this.shadowRoot.querySelector('dialog');
    if (dialog?.open) dialog.close();
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
    this._selectedVariant = null;
    this._loadPreview(block);
  }

  _selectVariant(block, variant) {
    this._selectedPath = block.path;
    this._selectedVariant = { path: block.path, variant };
    if (this._previewInfo?.path !== block.path) {
      this._loadPreview(block);
    }
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

  _addSelected() {
    if (!this._selectedPath) return;
    const variants = this._variantsByPath.get(this._selectedPath) ?? [];
    const pick = this._selectedVariant?.variant ?? variants[0];
    if (!pick) return;
    this.onInsert?.(pick.dom);
    this._close();
  }

  _renderBlockNode(block) {
    const expanded = this._isExpanded(block);
    const selected = this._selectedPath === block.path && !this._selectedVariant;
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
        ${variants.map((v) => {
    const isSel = this._selectedVariant?.path === block.path
            && this._selectedVariant.variant === v;
    return html`
            <li role="treeitem" aria-selected=${isSel}>
              <button type="button"
                      class="modal-tree-row modal-tree-row-variant ${isSel ? 'is-selected' : ''}"
                      @click=${() => this._selectVariant(block, v)}>
                <span class="modal-tree-label">
                  ${v.name}${v.variants
    ? html` <span class="modal-tree-subtitle">${v.variants}</span>`
    : nothing}
                </span>
              </button>
            </li>`;
  })}
      </ul>`;
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
    const hasValue = !!(this._search || '').length;
    return html`
      <div class="modal-search">
        <div class="modal-search-field">
          <svg aria-hidden="true" class="modal-search-icon" viewBox="0 0 20 20">
            <use href="${SEARCH_ICON_SRC}#icon"></use>
          </svg>
          <input type="search"
                 class="modal-search-input"
                 placeholder="Search blocks"
                 aria-label="Search blocks"
                 .value=${this._search || ''}
                 @input=${this._onSearchInput}>
          ${hasValue ? html`
            <button type="button"
                    class="modal-search-clear"
                    aria-label="Clear search"
                    @click=${this._clearSearch}>✕</button>` : nothing}
        </div>
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
    return html`
      ${error ? html`<div class="modal-preview-error"><p>${error}</p></div>` : nothing}
      <iframe class="modal-preview-frame ${hideIframe}" src=${url}
              title="Preview of ${name}"
              allow="clipboard-write *"></iframe>`;
  }

  render() {
    const canAdd = !!this._selectedPath
      && (this._variantsByPath.get(this._selectedPath)?.length || 0) > 0;
    return html`
      <dialog class="modal" @close=${this._onDialogClose}>
        <header class="modal-header">
          <span class="modal-title">Insert block</span>
          <button type="button" class="modal-close"
                  aria-label="Close" @click=${() => this._close()}>✕</button>
        </header>
        <div class="modal-body">
          <aside class="modal-tree-wrap">
            ${this._renderSearch()}
            ${this._renderTree()}
          </aside>
          <section class="modal-preview-wrap">${this._renderPreview()}</section>
        </div>
        <footer class="modal-footer">
          <sl-button class="primary outline" @click=${() => this._close()}>
            Cancel
          </sl-button>
          <sl-button ?disabled=${!canAdd} @click=${() => this._addSelected()}>
            Add to page
          </sl-button>
        </footer>
      </dialog>`;
  }
}

customElements.define('ew-block-library-modal', EwBlockLibraryModal);

export async function openBlockLibraryModal({ onInsert } = {}) {
  if (document.body.querySelector('ew-block-library-modal')) return;

  let hashState;
  const unsub = hashChange.subscribe((s) => { hashState = s; });
  unsub();
  const { org, site } = hashState || {};
  if (!org || !site) return;

  const extensions = await fetchExtensions(org, site);
  const ext = extensions?.find((e) => e.name === 'blocks');
  if (!ext) return;

  const modal = document.createElement('ew-block-library-modal');
  modal.extension = ext;
  modal.onInsert = onInsert;
  modal.addEventListener('close', () => modal.remove(), { once: true });
  document.body.append(modal);
}
