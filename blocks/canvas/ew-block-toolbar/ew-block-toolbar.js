import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { getBlocksExtension, loadBlockLibrary } from '../ew-panel-extensions/helpers.js';
import { replaceBlockRange, setTableBlockVariant, appendBlockRow } from '../editor-utils/blocks.js';
import { setBlockFocus } from '../ew-editor-doc/prose-plugins/blockFocus.js';
import { isMultiBlock, getMultiBlockTemplateRow } from '../editor-utils/multi-block.js';

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
    _editorView: { state: true },
    _multiTemplateRow: { state: true },
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
    this._onEditorViewChange = (e) => { this._editorView = e.detail?.view; };
    document.addEventListener('nx-canvas-editor-view', this._onEditorViewChange);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('pointerdown', this._onOutsidePointerDown);
    document.removeEventListener('nx-canvas-editor-view', this._onEditorViewChange);
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

  show(blockName, variant = '') {
    const main = document.querySelector('main');
    if (main) {
      const { left, width } = main.getBoundingClientRect();
      this.style.setProperty('--toolbar-anchor-x', `${left + width / 2}px`);
    }
    this._blockName = blockName;
    this._currentVariant = variant;
    this._editorView = document.querySelector('ew-canvas-header')?.editorView;
    this._loadVariants(blockName);
    this._loadMultiBlock(blockName);
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
    const { view } = this;
    const pos = view?.state.selection.from;
    // Focus the selected block in the doc editor, then open the (hidden) block
    // view — which shows only this block in the doc while keeping the preview.
    if (view && pos != null) setBlockFocus(view, pos);
    document.querySelector('ew-canvas-header')?.setEditorView('block');
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
    const canEdit = this._editorView === 'layout';
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
        ${canEdit ? html`
          <span class="toolbar-sep" aria-hidden="true"></span>
          <button
            type="button"
            class="toolbar-btn block-edit icon-only"
            aria-label="Edit block"
            title="Edit block"
            @click=${() => this._onEditBlock()}
          >${this._icon('edit')}</button>` : nothing}
      </div>
    `;
  }
}

customElements.define('ew-block-toolbar', EwBlockToolbar);

export default EwBlockToolbar;
