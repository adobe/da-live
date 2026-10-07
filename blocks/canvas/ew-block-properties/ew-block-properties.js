import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import getSheet from '../../shared/sheet.js';
import { canvasBus } from '../utils/canvas-bus.js';
import { getExtensionsBridge } from '../editor-utils/extensions-bridge.js';
import {
  getSelectedBlock, getTableBlockName, getTableBlockVariant,
  replaceBlockRange, setTableBlockVariant, appendBlockRow, deleteBlockRow, moveBlockRow,
} from '../editor-utils/blocks.js';
import { getBlockVariantOptions, normalizeBlockName } from '../editor-utils/block-variants.js';
import { loadBlockLibrary } from '../ew-panel-extensions/helpers.js';
import { isMultiBlock, getMultiBlockTemplateRow } from '../editor-utils/multi-block.js';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);
await import(`${getNx()}/blocks/shared/picker/picker.js`);
const [formStyle, buttonsStyle, pageStyle, style] = await Promise.all([
  getSheet(`${getNx2()}/styles/form.css`),
  getSheet(`${getNx2()}/styles/buttons.css`),
  loadStyle(new URL('../ew-page-metadata/ew-page-metadata.css', import.meta.url).href),
  loadStyle(import.meta.url),
]);

const ADD_ICON_SRC = '/img/icons/s2-icon-addcircle-20-n.svg';
const DELETE_ICON_SRC = '/img/icons/s2-icon-delete-20-n.svg';
const MAX_ITEM_TEXT_LENGTH = 30;

class EwBlockProperties extends LitElement {
  static properties = {
    _name: { state: true },
    _disabled: { state: true },
    _hasBlock: { state: true },
    _variant: { state: true },
    _variantOptions: { state: true },
    _isMulti: { state: true },
    _multiTemplateRow: { state: true },
    _itemCount: { state: true },
    _itemTable: { state: true },
    _dragIndex: { state: true },
    _dropIndex: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [formStyle, buttonsStyle, pageStyle, style];
    this._hashState = undefined;
    this._variantOptions = [];
    this._isMulti = false;
    this._multiTemplateRow = null;
    this._refresh();
    this._unsubscribeHash = hashChange.subscribe((state) => {
      const prev = this._hashState;
      this._hashState = state;
      if (state?.org !== prev?.org || state?.site !== prev?.site) {
        this._loadVariants();
        this._loadMultiBlock();
      }
    });
    this._unsubscribeSelection = canvasBus.toolbarSelectionState.subscribe(() => this._refresh());
    this._unsubscribeDoc = canvasBus.editorDocState.subscribe(() => this._refresh());
    this._unsubscribeHtml = canvasBus.editorHtmlState.subscribe((body) => {
      if (!body?.trim()) {
        this._name = '';
        this._disabled = true;
        this._hasBlock = false;
        this._variant = '';
        this._variantOptions = [];
        this._variantLoadId = (this._variantLoadId ?? 0) + 1;
        this._isMulti = false;
        this._multiTemplateRow = null;
        this._itemCount = 0;
        this._multiLoadId = (this._multiLoadId ?? 0) + 1;
        this._clearDragState();
      }
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribeSelection?.();
    this._unsubscribeDoc?.();
    this._unsubscribeHtml?.();
    this._unsubscribeHash?.();
    this._variantLoadId = (this._variantLoadId ?? 0) + 1;
    this._multiLoadId = (this._multiLoadId ?? 0) + 1;
    this._clearDragState();
  }

  _refresh() {
    const { view } = getExtensionsBridge();
    const block = getSelectedBlock(view?.state);
    const prevName = this._name;
    this._name = block ? getTableBlockName(block.node) : '';
    this._variant = block ? getTableBlockVariant(block.node) : '';
    this._hasBlock = !!block;
    this._disabled = !block || view.editable === false;
    const table = block?.node ?? null;
    const tablePos = block?.from ?? null;
    if (table !== this._itemTable || tablePos !== this._itemTablePos
      || view !== this._itemEditorView || this._disabled) this._clearDragState();
    this._itemTable = table;
    this._itemTablePos = tablePos;
    this._itemEditorView = view;
    this._itemCount = table ? table.childCount - 1 : 0;
    if (this._name !== prevName) {
      this._loadVariants();
      this._loadMultiBlock();
    }
  }

  async _loadMultiBlock() {
    const loadId = (this._multiLoadId ?? 0) + 1;
    this._multiLoadId = loadId;
    this._isMulti = false;
    this._multiTemplateRow = null;
    this._clearDragState();
    const { org, site } = this._hashState ?? {};
    const name = this._name;
    if (!org || !site || !name) return;
    const multi = await isMultiBlock(org, site, name);
    if (loadId !== this._multiLoadId || !this.isConnected) return;
    this._isMulti = multi;
    if (!multi) return;
    const row = await getMultiBlockTemplateRow(org, site, name);
    if (loadId !== this._multiLoadId || !this.isConnected) return;
    this._multiTemplateRow = row;
  }

  _getItemView({ editable = true } = {}) {
    const { view } = getExtensionsBridge();
    const block = getSelectedBlock(view?.state);
    if (!this._isMulti || !view || (editable && view.editable === false)
      || view !== this._itemEditorView || !block || block.node !== this._itemTable
      || block.from !== this._itemTablePos) return null;
    return view;
  }

  _scrollToItem(index) {
    if (this._dragSource || !this._getItemView({ editable: false })) return;
    let proseIndex = this._itemTablePos + 1;
    for (let row = 0; row <= index; row += 1) proseIndex += this._itemTable.child(row).nodeSize;
    // Row > cell > first content node: its content starts three tokens in.
    proseIndex += 3;
    const content = this._itemTable.child(index + 1).firstChild.firstChild;
    const kind = content.firstChild?.type.name === 'image' ? 'image' : content.type.name;
    canvasBus.editorProseSelectState.emit({ proseIndex, kind });
  }

  _onItemClick(e, index) {
    if (e.target.closest('button')) return;
    this._scrollToItem(index);
  }

  _onAddItem() {
    const view = this._getItemView();
    if (!view || !this._multiTemplateRow) return;
    appendBlockRow(view, this._itemTablePos, this._multiTemplateRow);
    this._refresh();
  }

  _onDeleteItem(index) {
    const view = this._getItemView();
    if (!view) return;
    deleteBlockRow(view, this._itemTablePos, index + 1);
    this._refresh();
  }

  _clearDragState() {
    this._dragSource = null;
    this._dragIndex = undefined;
    this._dropIndex = undefined;
  }

  _onItemDragStart(e, index) {
    const view = this._getItemView();
    if (!view) {
      e.preventDefault();
      return;
    }
    this._dragSource = { view, table: this._itemTable, tablePos: this._itemTablePos, index };
    this._dragIndex = index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-da-block-item', String(index));
  }

  _onItemDragOver(e, index) {
    if (!this._dragSource || !this._getItemView()) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    this._dropIndex = index;
  }

  _onItemDragLeave(index) {
    if (this._dropIndex === index) this._dropIndex = undefined;
  }

  _onItemDrop(e, index) {
    e.preventDefault();
    e.stopPropagation();
    const source = this._dragSource;
    const targetIndex = this._dropIndex;
    const view = this._getItemView();
    this._clearDragState();
    if (!view || !source || source.view !== view || source.table !== this._itemTable
      || source.tablePos !== this._itemTablePos || targetIndex !== index) return;
    const destination = index - (source.index < index ? 1 : 0);
    moveBlockRow(view, this._itemTablePos, source.index + 1, destination + 1);
    this._refresh();
  }

  _onItemKeydown(e, index) {
    if (e.target !== e.currentTarget) return;
    if (['Enter', ' '].includes(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      this._scrollToItem(index);
      return;
    }
    if (!e.altKey || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const view = this._getItemView();
    if (!view) return;
    e.preventDefault();
    e.stopPropagation();
    const destination = index + (e.key === 'ArrowUp' ? -1 : 1);
    if (destination < 0 || destination >= this._itemCount) return;
    moveBlockRow(view, this._itemTablePos, index + 1, destination + 1);
    this._refresh();
    this.updateComplete.then(() => {
      this.shadowRoot.querySelectorAll('.ew-block-item')[destination]?.focus();
    });
  }

  _renderItemPreview(index) {
    const content = [];
    const addText = (text) => {
      const value = text.replace(/\s+/g, ' ').trim();
      if (value) {
        content.push(html`<span class="ew-block-item-text">${Array.from(value).slice(0, MAX_ITEM_TEXT_LENGTH).join('')}</span>`);
      }
    };
    const addImage = (node) => {
      if (node.attrs.src) {
        content.push(html`<img class="ew-block-item-thumbnail" src=${node.attrs.src}
          alt=${node.attrs.alt || ''} loading="lazy" decoding="async" draggable="false">`);
      }
    };
    this._itemTable.child(index + 1).descendants((node) => {
      if (node.type.name === 'image') {
        addImage(node);
        return false;
      }
      if (node.isTextblock) {
        let text = '';
        node.descendants((child) => {
          if (child.type.name === 'image') {
            addText(text);
            text = '';
            addImage(child);
          } else if (child.isText) {
            text += child.text;
          } else if (child.type.name === 'hard_break') {
            text += ' ';
          }
        });
        addText(text);
        return false;
      }
      return true;
    });
    return content.length ? content.map((item, itemIndex) => html`
      ${itemIndex ? html`<span class="ew-block-item-separator" aria-hidden="true"></span>` : nothing}
      ${item}
    `) : html`<span class="ew-block-item-label">item ${index + 1}</span>`;
  }

  _renderItems() {
    if (!this._isMulti) return nothing;
    return html`
      <section class="ew-block-items" aria-labelledby="block-items-heading">
        <div class="ew-block-items-header">
          <h4 id="block-items-heading" class="nx-form-field">Items</h4>
          <button type="button" class="nx-action-btn-icon nx-btn-sm"
            aria-label="Add item" title="Add item"
            ?disabled=${this._disabled || !this._multiTemplateRow} @click=${this._onAddItem}>
            <svg aria-hidden="true" viewBox="0 0 20 20"><use href="${ADD_ICON_SRC}#icon"></use></svg>
          </button>
        </div>
        <ol class="ew-block-item-list">
          ${Array.from({ length: this._itemCount + 1 }, (_, index) => html`
            <li class="ew-block-drop-zone" role="presentation" aria-hidden="true"
              ?data-drop-active=${this._dropIndex === index}
              @dragover=${(e) => this._onItemDragOver(e, index)}
              @dragleave=${() => this._onItemDragLeave(index)}
              @drop=${(e) => this._onItemDrop(e, index)}></li>
            ${index < this._itemCount ? html`
            <li class="ew-block-item ${this._dragIndex === index ? 'is-dragging' : ''}"
              draggable=${!this._disabled} tabindex=${this._disabled ? -1 : 0}
              aria-label=${`Item ${index + 1}`} aria-keyshortcuts="Enter Space Alt+ArrowUp Alt+ArrowDown"
              title="Click to scroll to item. Drag to reorder, or press Alt+ArrowUp / Alt+ArrowDown"
              @click=${(e) => this._onItemClick(e, index)}
              @dragstart=${(e) => this._onItemDragStart(e, index)}
              @dragend=${this._clearDragState}
              @keydown=${(e) => this._onItemKeydown(e, index)}>
              <svg class="ew-block-item-grip" viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="5" cy="4" r="1"></circle><circle cx="11" cy="4" r="1"></circle>
                <circle cx="5" cy="8" r="1"></circle><circle cx="11" cy="8" r="1"></circle>
                <circle cx="5" cy="12" r="1"></circle><circle cx="11" cy="12" r="1"></circle>
              </svg>
              <div class="ew-block-item-preview">${this._renderItemPreview(index)}</div>
              <button type="button" class="nx-action-btn-icon nx-btn-sm"
                draggable="false" aria-label=${`Delete item ${index + 1}`}
                ?disabled=${this._disabled} @click=${() => this._onDeleteItem(index)}>
                <svg aria-hidden="true" viewBox="0 0 20 20"><use href="${DELETE_ICON_SRC}#icon"></use></svg>
              </button>
            </li>` : nothing}`)}
        </ol>
      </section>`;
  }

  async _loadVariants() {
    const loadId = (this._variantLoadId ?? 0) + 1;
    this._variantLoadId = loadId;
    this._variantOptions = [];
    const { org, site } = this._hashState ?? {};
    const name = this._name;
    if (!org || !site || !name) return;
    const { blocks } = await loadBlockLibrary(org, site);
    const options = await getBlockVariantOptions(blocks, name);
    if (loadId !== this._variantLoadId || !this.isConnected) return;
    this._variantOptions = options;
  }

  _onVariantChange(e) {
    const { view } = getExtensionsBridge();
    if (!view || view.editable === false || !getSelectedBlock(view.state)) return;
    setTableBlockVariant(view, e.detail.value);
    this._refresh();
    view.focus();
  }

  _renderVariantPicker() {
    if (!this._variantOptions?.length) return nothing;
    const value = this._variantOptions
      .find((v) => normalizeBlockName(v) === normalizeBlockName(this._variant)) ?? '';
    return html`
      <div class="nx-form-field ew-pm-control ew-block-variant"
        ?inert=${this._disabled} aria-disabled=${this._disabled}>
        <span>Variant</span>
        <nx-picker size="m" variant="field" placement="below-start"
          aria-label="Block variant"
          .items=${[
            { value: '', label: 'No variant' },
            ...this._variantOptions.map((v) => ({ value: v, label: v })),
          ]}
          .value=${value}
          .labelOverride=${this._variant && !value ? this._variant : ''}
          @change=${this._onVariantChange}></nx-picker>
      </div>`;
  }

  async _openLibrary() {
    const { view } = getExtensionsBridge();
    const block = getSelectedBlock(view?.state);
    if (!block || view.editable === false) return;
    const { from, to, node } = block;
    const { openBlockLibraryModal } = await import('../ew-block-library-modal/ew-block-library-modal.js');
    await openBlockLibraryModal({
      heading: 'Replace block',
      onInsert: (dom) => {
        if (getExtensionsBridge().view !== view || view.editable === false
          || view.state.doc.nodeAt(from) !== node) return;
        replaceBlockRange(view, from, to, dom);
        view.focus();
      },
    });
  }

  render() {
    const switchIcon = html`<svg aria-hidden="true" viewBox="0 0 20 20"><use href="/img/icons/s2-icon-switch-20-n.svg#icon"></use></svg>`;
    return html`
      <div class="ew-page-metadata">
        <div class="ew-pm-fields">
          ${this._hasBlock ? html`<div class="nx-form-field ew-pm-control">
            <span>Block</span>
            <button type="button" class="ew-block-name"
              aria-label=${`Open block library for ${this._name}`}
              aria-haspopup="dialog" ?disabled=${this._disabled}
              @click=${this._openLibrary}>${html`<span>${this._name}</span>`}${switchIcon}</button>
          </div>${this._renderVariantPicker()}${this._renderItems()}` : html`<p class="ew-block-empty">Select a block</p>`}
        </div>
      </div>`;
  }
}

customElements.define('ew-block-properties', EwBlockProperties);
