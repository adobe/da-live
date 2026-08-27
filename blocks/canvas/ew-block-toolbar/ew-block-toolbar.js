import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { getBlocksExtension, loadBlockLibrary } from '../ew-panel-extensions/helpers.js';
import { replaceBlockRange, setTableBlockVariant, appendBlockRow } from '../editor-utils/blocks.js';
import { isMultiBlock, getMultiBlockTemplateRow } from '../editor-utils/multi-block.js';
import { isQuickBlock } from '../editor-utils/quick-block.js';
import { getQuickBlockViewMode, setQuickBlockViewMode } from '../ew-editor-doc/prose-plugins/quickBlockViewState.js';
import { canvasBus } from '../utils/canvas-bus.js';

const nx = getNx();
const { loadStyle } = await import(`${nx}/utils/utils.js`);
await import(`${nx}/blocks/shared/picker/picker.js`);

const styles = await loadStyle(import.meta.url);

/** Normalize block names so `card-list`, `Card List` and `card_list` all compare equal. */
function normalizeBlockName(name) {
  return (name || '').toLowerCase().replace(/[\s_-]+/g, ' ').trim();
}

/** Split a library variant entry into its base block name and variant descriptor. */
function splitLibraryVariant(variant) {
  if (variant?.variants) return { base: variant.name || '', variant: variant.variants };
  const match = (variant?.name || '').match(/^(.*\S)\s*\(([^)]+)\)\s*$/);
  if (match) return { base: match[1].trim(), variant: match[2].trim() };
  return { base: variant?.name || '', variant: '' };
}

class EwBlockToolbar extends LitElement {
  static properties = {
    view: { attribute: false },
    org: { type: String },
    site: { type: String },
    _blockName: { state: true },
    _currentVariant: { state: true },
    _variantOptions: { state: true },
    _hasBlockLibrary: { state: true },
    _multiTemplateRow: { state: true },
    _isQuickBlock: { state: true },
    _quickBlockPos: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this._onOutsidePointerDown = (e) => {
      if (!this.open) return;
      const path = e.composedPath();
      if (path.includes(this)) return;
      const editorDom = this.view?.dom;
      if (editorDom && path.includes(editorDom)) return;
      this.hide();
    };
    document.addEventListener('pointerdown', this._onOutsidePointerDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('pointerdown', this._onOutsidePointerDown);
  }

  updated(changed) {
    if (changed.has('org') || changed.has('site')) {
      this._checkBlockLibrary();
    }
    this._syncVariantPicker();
  }

  async _checkBlockLibrary() {
    const { org, site } = this;
    if (!org || !site) {
      this._hasBlockLibrary = false;
      return;
    }
    const ext = await getBlocksExtension(org, site);
    if (this.org !== org || this.site !== site) return;
    this._hasBlockLibrary = ext !== null;
  }

  async _loadVariants(blockName) {
    this._variantOptions = [];
    if (!this.org || !this.site || !blockName) return;
    const { blocks } = await loadBlockLibrary(this.org, this.site);
    const target = normalizeBlockName(blockName);
    const found = new Set();
    await Promise.all((blocks || []).map(async (block) => {
      const variants = (await block.loadVariants) || [];
      variants.forEach((v) => {
        const { base, variant } = splitLibraryVariant(v);
        if (variant && normalizeBlockName(base) === target) found.add(variant);
      });
    }));
    if (this._blockName !== blockName) return;
    this._variantOptions = [...found];
  }

  async _loadMultiBlock(blockName) {
    this._multiTemplateRow = null;
    if (!this.org || !this.site || !blockName) return;
    const [multi, row] = await Promise.all([
      isMultiBlock(this.org, this.site, blockName),
      getMultiBlockTemplateRow(this.org, this.site, blockName),
    ]);
    if (this._blockName !== blockName) return;
    this._multiTemplateRow = (multi && row) ? row : null;
  }

  async _loadQuickBlock(blockName) {
    this._isQuickBlock = false;
    if (!this.org || !this.site || !blockName) return;
    const quick = await isQuickBlock(this.org, this.site, blockName);
    if (this._blockName !== blockName) return;
    this._isQuickBlock = quick;
  }

  _onAddItem() {
    if (!this.view || !this._multiTemplateRow) return;
    const { from } = this.view.state.selection;
    appendBlockRow(this.view, from, this._multiTemplateRow);
    this.view.focus();
  }

  get _picker() { return this.shadowRoot?.querySelector('nx-picker'); }

  _variantPickerItems() {
    return [
      { section: 'Variant' },
      { value: '', label: 'No variant' },
      ...(this._variantOptions || []).map((v) => ({ value: v, label: v })),
    ];
  }

  _syncVariantPicker() {
    const picker = this._picker;
    if (!picker) return;
    const current = this._currentVariant ?? '';
    if (current === '' || (this._variantOptions || []).includes(current)) {
      picker.value = current;
      picker.labelOverride = '';
    } else {
      picker.value = '';
      picker.labelOverride = current;
    }
  }

  _onVariantChange(e) {
    if (!this.view) return;
    setTableBlockVariant(this.view, e.detail.value);
    this.view.focus();
  }

  _onToggleQuickView() {
    if (!this.view || this._quickBlockPos == null) return;
    const mode = getQuickBlockViewMode(this.view.state, this._quickBlockPos);
    setQuickBlockViewMode(this.view, this._quickBlockPos, mode === 'table' ? 'quick' : 'table');
    this.view.focus();
  }

  show(blockName, variant = '') {
    const main = document.querySelector('main');
    if (main) {
      const { left, width } = main.getBoundingClientRect();
      this.style.setProperty('--toolbar-anchor-x', `${left + width / 2}px`);
    }
    this._blockName = blockName;
    this._currentVariant = variant;
    this._quickBlockPos = this.view?.state.selection.from;
    this._loadVariants(blockName);
    this._loadMultiBlock(blockName);
    this._loadQuickBlock(blockName);
    this.classList.add('open');
    this.requestUpdate();
  }

  hide() {
    this.classList.remove('open');
  }

  get open() {
    return this.classList.contains('open');
  }

  _icon(name) {
    return html`<svg aria-hidden="true" class="icon" viewBox="0 0 20 20"><use href="/img/icons/s2-icon-${name}-20-n.svg#icon"></use></svg>`;
  }

  _onEditBlock() {
    const pos = this.view?.state.selection.from;
    if (pos == null) return;
    // Ask the doc editor to open the single-block editor modal (see ew-editor-doc.enterBlockEdit).
    canvasBus.blockEditRequest.emit({ pos });
  }

  _onDeleteBlock() {
    const { view } = this;
    if (!view) return;
    const { from } = view.state.selection;
    const node = view.state.doc.nodeAt(from);
    if (!node) return;
    view.dispatch(view.state.tr.delete(from, from + node.nodeSize));
    this.hide();
    view.focus();
  }

  async _onReplaceBlock() {
    if (!this.view || !this._hasBlockLibrary) return;
    const { from, to } = this.view.state.selection;
    const { view } = this;
    const { openBlockLibraryModal } = await import('../ew-block-library-modal/ew-block-library-modal.js');
    openBlockLibraryModal({
      heading: 'Replace block',
      onInsert: (dom) => {
        replaceBlockRange(view, from, to, dom);
        view.focus();
      },
    });
  }

  render() {
    const name = this._blockName || 'Block';
    const hasVariants = (this._variantOptions?.length ?? 0) > 0;
    const quickModeOff = this._isQuickBlock && this._quickBlockPos != null && this.view
      && getQuickBlockViewMode(this.view.state, this._quickBlockPos) === 'table';
    return html`
      <div class="toolbar-wrap" @mousedown=${(e) => e.preventDefault()}>
        <button
          type="button"
          class="toolbar-btn block-replace"
          aria-label="Replace block"
          title="Replace block"
          ?disabled=${!this._hasBlockLibrary}
          @click=${() => this._onReplaceBlock()}
        >
          ${this._icon('tableadd')}
          <span class="block-name">${name}</span>
        </button>
        ${hasVariants ? html`
          <span class="toolbar-sep" aria-hidden="true"></span>
          <span class="toolbar-variant-wrap">
            <nx-picker
              class="toolbar-variant"
              placement="above"
              ignoreFocus
              .items=${this._variantPickerItems()}
              value=""
              @change=${(e) => this._onVariantChange(e)}
            ></nx-picker>
          </span>` : nothing}
        ${this._multiTemplateRow ? html`
          <span class="toolbar-sep" aria-hidden="true"></span>
          <button
            type="button"
            class="toolbar-btn block-add-item"
            aria-label="Add item"
            title="Add item"
            @click=${() => this._onAddItem()}
          >${this._icon('addcircle')}<span>Add item</span></button>` : nothing}
        ${quickModeOff ? html`
          <span class="toolbar-sep" aria-hidden="true"></span>
          <button
            type="button"
            class="toolbar-btn block-quick-view icon-only"
            aria-label="Show quick view"
            title="Show quick view"
            @click=${() => this._onToggleQuickView()}
          >${this._icon('table')}</button>` : nothing}
        <span class="toolbar-sep" aria-hidden="true"></span>
        <button
          type="button"
          class="toolbar-btn block-edit icon-only"
          aria-label="Edit block"
          title="Edit block"
          @click=${() => this._onEditBlock()}
        >${this._icon('edit')}</button>
        <span class="toolbar-sep" aria-hidden="true"></span>
        <button
          type="button"
          class="toolbar-btn block-delete icon-only"
          aria-label="Delete block"
          title="Delete block"
          @click=${() => this._onDeleteBlock()}
        >${this._icon('delete')}</button>
      </div>
    `;
  }
}

customElements.define('ew-block-toolbar', EwBlockToolbar);

export default EwBlockToolbar;
