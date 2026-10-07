import { LitElement, html, nothing } from 'da-lit';
import { NodeSelection } from 'da-y-wrapper';
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
import { getBlockFieldTemplate, buildBlockFieldDefinitions, resolveBlockFields } from '../editor-utils/block-fields.js';
import { getSourceUploadContext } from '../ew-editor-doc/prose-plugins/sourceUploadContext.js';
import { SUPPORTED_IMAGE_FILES, uploadImageFile } from '../ew-editor-doc/prose-plugins/imageDrop.js';
import { getRepositoryConfig, renderAssets } from '../ew-panel-extensions/aem-assets.js';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);
const { PANEL_EVENT } = await import(`${getNx()}/utils/panel.js`);
await import(`${getNx()}/blocks/shared/picker/picker.js`);
await import(`${getNx()}/blocks/shared/menu/menu.js`);
await import(`${getNx()}/blocks/shared/dialog/dialog.js`);
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
    _fieldDefinitions: { state: true },
    _fieldError: { state: true },
    _hasAemAssets: { state: true },
    _uploadingField: { state: true },
    _assetTarget: { state: true },
    _generateFieldsContext: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [formStyle, buttonsStyle, pageStyle, style];
    this._hashState = undefined;
    this._variantOptions = [];
    this._isMulti = false;
    this._multiTemplateRow = null;
    this._fieldDefinitions = [];
    this._generateFieldsContext = null;
    this._refresh();
    this._unsubscribeHash = hashChange.subscribe((state) => {
      const prev = this._hashState;
      this._hashState = state;
      if (state?.org !== prev?.org || state?.site !== prev?.site) {
        this._loadVariants();
        this._loadMultiBlock();
        this._loadFields();
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
        this._fieldLoadId = (this._fieldLoadId ?? 0) + 1;
        this._fieldDefinitions = [];
        this._fieldError = '';
        this._assetTarget = null;
        this._generateFieldsContext = null;
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
    this._fieldLoadId = (this._fieldLoadId ?? 0) + 1;
    this._assetTarget = null;
    this._clearDragState();
  }

  _refresh() {
    const { view } = getExtensionsBridge();
    const block = getSelectedBlock(view?.state);
    const prevName = this._name;
    const prevVariant = this._variant;
    const prevView = this._itemEditorView;
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
    if (this._name !== prevName || this._variant !== prevVariant || view !== prevView) {
      this._loadFields();
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

  async _loadFields() {
    const loadId = (this._fieldLoadId ?? 0) + 1;
    this._fieldLoadId = loadId;
    this._fieldDefinitions = [];
    this._generateFieldsContext = null;
    this._fieldError = '';
    this._hasAemAssets = false;
    const { org, site } = this._hashState ?? {};
    const name = this._name;
    const variant = this._variant;
    const { view } = getExtensionsBridge();
    if (!org || !site || !name || !view) return;
    try {
      const [multi, { ext, blocks }] = await Promise.all([
        isMultiBlock(org, site, name), loadBlockLibrary(org, site),
      ]);
      const match = await getBlockFieldTemplate(blocks, name, variant, view.state.schema);
      const definitions = multi ? [] : buildBlockFieldDefinitions(match);
      if (loadId !== this._fieldLoadId || !this.isConnected) return;
      this._fieldDefinitions = definitions;
      if (!match || !('fields' in match.item) || (!multi && !definitions.length)) {
        this._generateFieldsContext = {
          org, site, name, variant, librarySources: ext?.sources ?? [], blockPath: match?.path,
        };
      }
      const config = definitions.some((field) => field.type === 'image')
        ? await getRepositoryConfig(org, site) : null;
      if (loadId !== this._fieldLoadId || !this.isConnected) return;
      this._hasAemAssets = config !== null;
    } catch (error) {
      if (loadId !== this._fieldLoadId || !this.isConnected) return;
      this._fieldError = `Unable to load block fields: ${error.message}`;
    }
  }

  _onGenerateFields() {
    const context = this._generateFieldsContext;
    const block = getSelectedBlock(getExtensionsBridge().view?.state);
    if (!context || !block || getTableBlockName(block.node) !== context.name
      || getTableBlockVariant(block.node) !== context.variant) return;
    const library = context.librarySources.length
      ? context.librarySources.map((source) => `- ${source}`).join('\n')
      : 'No block library is configured. Resolve the blocks library for this organization/site first.';
    const text = `Generate sidebar field definitions for the currently selected block variant.

Selected block:
- Organization/site: ${context.org}/${context.site}
- Block name: ${context.name}
- Variant: ${context.variant || '(no variant)'}
- Exact block table header: ${block.node.firstChild.textContent}
- Matching block library document: ${context.blockPath || 'Locate it by following the library index entries below.'}

Configured block library index sources:
${library}

Inspect the block library before generating anything:
1. Open the configured library index source(s) and follow the block's document path. If a matching library document is listed above, inspect that document.
2. Find ONLY the "${context.name}" variant "${context.variant || '(no variant)'}". Match the actual block table header or block CSS classes, not just the display heading: a display label such as "Hero (Text Start)" can describe the actual "hero (left)" variant.
3. Read that variant's template rows, cells, text elements, and images. Generate fields from the LIBRARY TEMPLATE, not from extra content in the current page. If the exact variant cannot be found or the source cannot be read, explain what is missing rather than inventing a schema.

How sidebar fields work:
- Each library variant can have a "fields" entry in its associated "library-metadata". The entry's value is a nested table.
- The nested table starts with a single header cell containing "fields". This is a header, not an editable field.
- Subsequent rows mirror the template's content rows in the same order, with the same number and order of cells. Do not add the block name/variant header as a content row.
- Inside each metadata cell, put one plain paragraph per field label, in the same order as the corresponding text blocks or images in the template cell. A cell containing a heading followed by a paragraph needs two labels in that same cell, not two separate table rows.
- Labels should be meaningful author-facing names, such as Image, Title, or Subheading. Labels do NOT need to use the template's heading tags or copy its sample text.
- Do not write explicit type declarations: the sidebar infers "image" from the matching template image/picture and "text" from a text element. Headings and paragraphs are both text, regardless of heading level. Ignore empty spacer paragraphs around image-only content.
- Sidebar values come from the selected page block; edits update that block while preserving its existing heading/paragraph tags and attributes. Additional trailing page content not described by the fields remains untouched.

Illustrative HTML ONLY for a template with an image in its first single-cell row and a heading plus paragraph in its second single-cell row:
<div class="library-metadata">
  <div>
    <div><p>fields</p></div>
    <div>
      <table><tbody>
        <tr><td><p>fields</p></td></tr>
        <tr><td><p>Image</p></td></tr>
        <tr><td><p>Title</p><p>Subheading</p></td></tr>
      </tbody></table>
    </div>
  </div>
</div>

Adapt the rows, cells, and labels to the actual selected library variant; do not blindly copy this example. Add the generated fields table to that variant's existing library metadata, or create associated library metadata if absent. Fill an empty fields entry if one exists. Preserve description, search tags, other metadata, all template content, and all other variants. Do not replace the block or edit the current page to add this schema. If nonempty fields already exist in the source, report them rather than overwriting them. Show the generated table and identify the exact library document and variant to which it belongs.`;
    document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, { detail: { section: 'chat', options: { text, autoSend: false } } }));
  }

  get _fields() {
    const { view } = getExtensionsBridge();
    return this._isMulti ? []
      : resolveBlockFields(getSelectedBlock(view?.state), this._fieldDefinitions ?? []);
  }

  _captureField(field) {
    const { view, sourceUrl } = getExtensionsBridge();
    const block = getSelectedBlock(view?.state);
    if (!view || view.editable === false || !block || !field.node
      || !this._fields.some((current) => current.key === field.key && current.node === field.node
        && current.pos === field.pos)) return null;
    return {
      view, sourceUrl, block: block.node, from: block.from, node: field.node, pos: field.pos,
    };
  }

  _isFieldTargetCurrent(target) {
    const { view, sourceUrl } = getExtensionsBridge();
    const block = getSelectedBlock(view?.state);
    return this.isConnected && view === target.view && sourceUrl === target.sourceUrl
      && view.editable !== false && block?.from === target.from && block.node === target.block
      && view.state.doc.nodeAt(target.pos) === target.node;
  }

  _commitText(field, value) {
    const target = this._captureField(field);
    if (!target || value === field.value) return;
    const { view, pos, node } = target;
    const tr = view.state.tr.insertText(value, pos + 1, pos + 1 + node.content.size);
    tr.setSelection(view.state.selection.map(tr.doc, tr.mapping));
    view.dispatch(tr);
    this._refresh();
  }

  _triggerFieldUpload(field) {
    const target = this._captureField(field);
    if (!target) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = SUPPORTED_IMAGE_FILES.join(',');
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) this._uploadFieldImage(field, target, file);
    }, { once: true });
    input.click();
  }

  async _uploadFieldImage(field, target, file) {
    if (!this._isFieldTargetCurrent(target)) return;
    this._fieldError = '';
    const details = getSourceUploadContext(target.sourceUrl);
    if (!details) {
      this._fieldError = 'Unable to upload an image: the document source is unavailable.';
      return;
    }
    if (!SUPPORTED_IMAGE_FILES.includes(file.type)) {
      this._fieldError = 'Select an SVG, PNG, JPEG, or GIF image.';
      return;
    }
    this._uploadingField = field.key;
    try {
      await uploadImageFile(target.view, file, details, {
        imagePos: target.pos,
        canReplace: () => this._isFieldTargetCurrent(target),
      });
      this._refresh();
    } catch (error) {
      if (this._isFieldTargetCurrent(target)) {
        this._fieldError = `Unable to replace image: ${error.message}`;
      }
    } finally {
      if (this._uploadingField === field.key) this._uploadingField = null;
    }
  }

  async _openFieldAssets(field) {
    const target = this._captureField(field);
    if (!target) return;
    this._assetTarget = target;
    this._fieldError = '';
    await this.updateComplete;
    const container = this.shadowRoot.querySelector('.ew-block-assets');
    if (!container || this._assetTarget !== target) return;
    try {
      await renderAssets({
        container,
        org: this._hashState.org,
        site: this._hashState.site,
        onClose: () => { this._assetTarget = null; this._refresh(); },
        getView: () => {
          if (this._assetTarget !== target || !this._isFieldTargetCurrent(target)) return null;
          const { view } = target;
          const selection = NodeSelection.create(view.state.doc, target.pos);
          view.dispatch(view.state.tr.setSelection(selection));
          return view;
        },
      });
    } catch (error) {
      if (this._assetTarget !== target) return;
      this._assetTarget = null;
      this._fieldError = `Unable to open AEM Assets: ${error.message}`;
    }
  }

  _renderFields() {
    return html`
      ${this._generateFieldsContext ? html`
        <button type="button" class="nx-form-btn-secondary ew-block-generate-fields"
          @click=${this._onGenerateFields}>Generate fields</button>
      ` : nothing}
      ${this._fields.map((field) => {
        const id = `ew-block-field-${field.key}`;
        const disabled = this._disabled || !field.node || !!this._uploadingField;
        return html`
          <div class="nx-form-field ew-block-field" data-field=${field.label}>
            <label for=${field.type === 'text' ? id : nothing}>${field.label}</label>
            ${field.type === 'text' ? html`
              <input id=${id} class="nx-input" type="text" .value=${field.value}
                ?readonly=${disabled} @blur=${(e) => this._commitText(field, e.target.value)}>
            ` : html`
              ${field.value ? html`<img class="ew-block-field-image"
                src=${getExtensionsBridge().view?.nodeDOM?.(field.pos)?.src ?? field.value}
                alt=${field.node.attrs.alt ?? ''}>` : nothing}
              ${this._hasAemAssets ? html`
                <nx-menu placement="below-start"
                  .items=${[{ id: 'upload', label: 'Upload' }, { id: 'aem-assets', label: 'AEM Assets' }]}
                  ?inert=${disabled}
                  @select=${(e) => {
                    if (e.detail.id === 'upload') this._triggerFieldUpload(field);
                    else if (e.detail.id === 'aem-assets') this._openFieldAssets(field);
                  }}>
                  <button slot="trigger" type="button" class="nx-form-btn-secondary" ?disabled=${disabled}>
                    Replace image
                  </button>
                </nx-menu>
              ` : html`
                <button type="button" class="nx-form-btn-secondary" ?disabled=${disabled}
                  @click=${() => this._triggerFieldUpload(field)}>Replace image</button>
              `}
            `}
            ${field.error ? html`<span class="nx-input-error-msg" role="alert">${field.error}</span>` : nothing}
            ${this._uploadingField === field.key ? html`<span role="status">Uploading image...</span>` : nothing}
          </div>`;
      })}
      ${this._fieldError ? html`<p class="nx-input-error-msg" role="alert">${this._fieldError}</p>` : nothing}`;
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
          </div>${this._renderVariantPicker()}${this._renderFields()}${this._renderItems()}` : html`<p class="ew-block-empty">Select a block</p>`}
        </div>
      </div>
      ${this._assetTarget ? html`
        <nx-dialog title="Replace image" @close=${() => { this._assetTarget = null; }}>
          <div class="ew-block-assets"></div>
        </nx-dialog>
      ` : nothing}`;
  }
}

customElements.define('ew-block-properties', EwBlockProperties);
