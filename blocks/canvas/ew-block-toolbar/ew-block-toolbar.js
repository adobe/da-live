import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { getBlocksExtension, loadBlockLibrary } from '../ew-panel-extensions/helpers.js';
import { replaceBlockRange, setTableBlockVariant, appendBlockRow } from '../editor-utils/blocks.js';
import { isMultiBlock, getMultiBlockTemplateRow } from '../editor-utils/multi-block.js';
import { requestComment } from '../editor-utils/command-helpers.js';
import { canvasBus } from '../utils/canvas-bus.js';
import { toolbarController } from '../editor-utils/toolbar-controller.js';

const nx = getNx();
const { loadStyle } = await import(`${nx}/utils/utils.js`);
await import(`${nx}/blocks/shared/picker/picker.js`);

const styles = await loadStyle(import.meta.url);

/** Normalize block names so `card-list`, `Card List` and `card_list` all compare equal. */
function normalizeBlockName(name) {
  return (name || '').toLowerCase().replace(/[\s_-]+/g, ' ').trim();
}

function parseVariants(variant) {
  return (variant || '').split(',').map((v) => v.trim()).filter(Boolean);
}

/** Variants the library offers for `blockName`, deduped loosely (first spelling wins). */
export function collectLibraryVariants(items, blockName) {
  const target = normalizeBlockName(blockName);
  const found = new Map();
  (items || []).forEach((item) => {
    (item?.identities || []).forEach(({ name, variants }) => {
      if (normalizeBlockName(name) !== target) return;
      variants.forEach((v) => {
        const key = normalizeBlockName(v);
        if (!found.has(key)) found.set(key, v);
      });
    });
  });
  return [...found.values()];
}

/** The header variant string after a picker `change` (no `values` = Clear all). */
export function nextVariants(current, { value, values, selected }) {
  if (!values) return '';
  const list = parseVariants(current);
  const next = selected
    ? [...list, value]
    : list.filter((v) => normalizeBlockName(v) !== normalizeBlockName(value));
  return next.join(', ');
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
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  updated(changed) {
    if (changed.has('org') || changed.has('site')) {
      this._checkBlockLibrary();
    }
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
    const items = (await Promise.all((blocks || []).map((block) => block.loadVariants)))
      .flatMap((variants) => variants || []);
    if (this._blockName !== blockName) return;
    this._variantOptions = collectLibraryVariants(items, blockName);
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

  /** Library options plus any current variant the library doesn't list; `values` uses
   * the option spelling so the picker's exact-match checkmarks line up. */
  _variantState() {
    const options = [...(this._variantOptions || [])];
    const values = parseVariants(this._currentVariant).map((v) => {
      const match = options.find((o) => normalizeBlockName(o) === normalizeBlockName(v));
      if (match) return match;
      options.push(v);
      return v;
    });
    return { options, values };
  }

  _variantPickerItems(options, values) {
    return [
      { section: 'Variants' },
      ...options.map((v) => ({ value: v, label: v })),
      ...(values.length ? [{ divider: true }, { value: '', label: 'Clear all', action: true }] : []),
    ];
  }

  _onVariantChange(e) {
    if (!this.view) return;
    const next = nextVariants(this._currentVariant, e.detail);
    this._currentVariant = next;
    setTableBlockVariant(this.view, next);
    if (toolbarController.activeSurface === 'wysiwyg') {
      const block = { name: this._blockName, variant: next };
      canvasBus.toolbarSelectionState.emit({ surface: 'wysiwyg', showable: false, block });
    }
    if (!e.detail.values) this.view.focus();
  }

  show(blockName, variant = '') {
    const main = document.querySelector('main');
    if (main) {
      const { left, width } = main.getBoundingClientRect();
      this.style.setProperty('--toolbar-anchor-x', `${left + width / 2}px`);
    }
    const sameBlock = this.open && this._blockName === blockName;
    this._blockName = blockName;
    this._currentVariant = variant;
    if (!sameBlock) {
      this._loadVariants(blockName);
      this._loadMultiBlock(blockName);
    }
    this.classList.add('open');
    this.requestUpdate();
  }

  hide() {
    this.classList.remove('open');
  }

  get open() {
    return this.classList.contains('open');
  }

  /** Read by toolbarController to tell an unchanged re-render from a new block. */
  get blockName() { return this._blockName ?? ''; }

  get blockVariant() { return this._currentVariant ?? ''; }

  /** A picker left open is the single source of truth for "is interacting", so a
   * re-render can't close it underneath the user. */
  get isInteracting() {
    return this.shadowRoot?.querySelector('nx-picker')?.open ?? false;
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

  _onComment() {
    if (!this.view) return;
    requestComment(this.view);
    this.hide();
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
    const { options, values } = this._variantState();
    const hasVariants = options.length > 0;
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
              .multiple=${true}
              placeholder="No variant"
              .items=${this._variantPickerItems(options, values)}
              .values=${values}
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
        <span class="toolbar-sep" aria-hidden="true"></span>
        <button
          type="button"
          class="toolbar-btn block-comment icon-only"
          aria-label="Comment"
          title="Comment"
          @click=${() => this._onComment()}
        >${this._icon('comment')}</button>
      </div>
    `;
  }
}

customElements.define('ew-block-toolbar', EwBlockToolbar);

export default EwBlockToolbar;
