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
    this._blocks = await fetchBlocks(this.extension.sources);
  }

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
  }

  async _loadPreview(block) {
    const { org, site } = this._hashState || {};
    if (!org || !site) {
      this._previewInfo = null;
      return;
    }
    const details = getItemPreviewUrl(block, { org, site });
    const url = details.previewUrl;
    this._previewInfo = { name: block.name, url, ok: undefined };
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
    const expanded = this._expandedPath === block.path;
    const selected = this._selectedPath === block.path && !this._selectedVariant;
    const variants = this._variantsByPath.get(block.path);
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
    return html`
      <ul class="modal-tree" role="tree">
        ${this._blocks.map((block) => this._renderBlockNode(block))}
      </ul>`;
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
          <aside class="modal-tree-wrap">${this._renderTree()}</aside>
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
