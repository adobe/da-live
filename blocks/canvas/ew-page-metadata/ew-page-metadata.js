import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import getSheet from '../../shared/sheet.js';
import { canvasBus } from '../utils/canvas-bus.js';
import { getExtensionsBridge } from '../editor-utils/extensions-bridge.js';
import { readMetadataRows, setMetadataValue, addMetadataRow, deleteMetadataRow } from '../editor-utils/metadata.js';
import { buildMetadataFields, mergeMetadataFields } from '../editor-utils/metadata-fields.js';
import { loadBlockOptions } from '../ew-panel-extensions/helpers.js';

const DELETE_ICON_SRC = '/img/icons/s2-icon-delete-20-n.svg';
const ADD_ICON_SRC = '/img/icons/s2-icon-addcircle-20-n.svg';
const EMPTY_OPTION = { value: '', label: 'Please Select' };

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);
await import(`${getNx()}/blocks/shared/dialog/dialog.js`);
await import(`${getNx()}/blocks/shared/picker/picker.js`);
await import('./ew-metadata-multiselect.js');

const [formStyle, style, baseStyle] = await Promise.all([
  getSheet(`${getNx2()}/styles/form.css`),
  loadStyle(import.meta.url),
  loadStyle(new URL('../../shared/styles/base.css', import.meta.url).href),
]);

function hasColorValues(field) {
  return !!field.values?.some((v) => v.colorValue);
}

class EwPageMetadata extends LitElement {
  static properties = {
    _docRows: { state: true },
    _libraryFields: { state: true },
    _hashState: { state: true },
    _showAddDialog: { state: true },
    _draftKey: { state: true },
    _pendingDeleteKey: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [baseStyle, formStyle, style];
    this._docRows = [];
    this._libraryFields = [];
    this._unsubHash = hashChange.subscribe((state) => {
      const prev = this._hashState;
      this._hashState = state;
      if (state?.org !== prev?.org || state?.site !== prev?.site) this._loadLibraryFields();
    });
    // editorHtmlState only signals "doc cleared" here (e.g. navigating away) — the actual
    // refresh trigger is editorDocState, which fires on every doc-changing transaction
    // (including plain in-place typing, not just the ones that trigger a full re-render),
    // and reads straight from the live doc rather than re-parsing rendered aemHtml.
    this._unsubscribeHtml = canvasBus.editorHtmlState.subscribe((aemHtml) => {
      if (!aemHtml?.trim()) this._docRows = [];
    });
    this._unsubscribeDocState = canvasBus.editorDocState.subscribe(() => {
      const { view } = getExtensionsBridge();
      if (view) this._docRows = readMetadataRows(view);
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubHash?.();
    this._unsubscribeHtml?.();
    this._unsubscribeDocState?.();
  }

  async _loadLibraryFields() {
    const { org, site } = this._hashState ?? {};
    if (!org || !site) {
      this._libraryFields = [];
      return;
    }
    try {
      const data = await loadBlockOptions(org, site);
      this._libraryFields = buildMetadataFields(data);
    } catch {
      this._libraryFields = [];
    }
  }

  get _fields() {
    return mergeMetadataFields(this._docRows ?? [], this._libraryFields ?? []);
  }

  _commit(field, value) {
    const { view } = getExtensionsBridge();
    if (!view) return;
    setMetadataValue(view, field.key, value);
    this._docRows = readMetadataRows(view);
  }

  _onDeleteClick(key) {
    this._pendingDeleteKey = key;
  }

  _cancelDelete() {
    this._pendingDeleteKey = null;
  }

  _confirmDelete() {
    const { view } = getExtensionsBridge();
    if (view) {
      deleteMetadataRow(view, this._pendingDeleteKey);
      this._docRows = readMetadataRows(view);
    }
    this._pendingDeleteKey = null;
  }

  _onAddClick() {
    this._showAddDialog = true;
    this._draftKey = '';
  }

  _cancelAdd() {
    this._showAddDialog = false;
  }

  _confirmAdd() {
    const key = this._draftKey?.trim();
    if (!key) return;
    const { view } = getExtensionsBridge();
    if (view) {
      addMetadataRow(view, key, '');
      this._docRows = readMetadataRows(view);
    }
    this._showAddDialog = false;
  }

  _renderSwatchRadio(field) {
    return html`
      <div class="ew-pm-swatch-radio" role="radiogroup">
        <label>
          <input type="radio" name="field-${field.key}" value=""
                 .checked=${!field.value}
                 @change=${() => this._commit(field, '')}>
          <span class="label">${EMPTY_OPTION.label}</span>
        </label>
        ${field.values.map((v) => html`
          <label>
            <input type="radio" name="field-${field.key}" value=${v.value}
                   .checked=${field.value === v.value}
                   @change=${() => this._commit(field, v.value)}>
            ${v.colorValue ? html`<span class="swatch" style="background-color:${v.colorValue}"></span>` : ''}
            <span class="label">${v.title}</span>
          </label>
        `)}
      </div>`;
  }

  _renderField(field) {
    if (!field.values?.length) {
      return html`
        <input type="text" .value=${field.value}
               @blur=${(e) => this._commit(field, e.target.value)}>`;
    }
    if (field.type === 'multi') {
      return html`
        <ew-metadata-multiselect .items=${field.values} .value=${field.value}
          @change=${(e) => this._commit(field, e.detail.value)}></ew-metadata-multiselect>`;
    }
    if (hasColorValues(field)) return this._renderSwatchRadio(field);
    return html`
      <nx-picker .items=${[EMPTY_OPTION, ...field.values.map((v) => ({ value: v.value, label: v.title }))]}
        .value=${field.value}
        @change=${(e) => this._commit(field, e.detail.value)}></nx-picker>`;
  }

  _renderRow(field) {
    return html`
      <div class="ew-pm-row" data-key=${field.key}>
        <div class="ew-pm-row-header">
          <label class="ew-pm-label">${field.label}</label>
          ${field.removable === false ? nothing : html`
            <button type="button" class="delete-btn" aria-label="Delete ${field.label}"
                    @click=${() => this._onDeleteClick(field.key)}>
              <svg aria-hidden="true" class="icon" viewBox="0 0 20 20">
                <use href="${DELETE_ICON_SRC}#icon"></use>
              </svg>
            </button>`}
        </div>
        <div class="ew-pm-control">${this._renderField(field)}</div>
      </div>`;
  }

  _renderAddDialog() {
    return html`
      <nx-dialog class="ew-pm-add" title="Add field" @close=${() => this._cancelAdd()}>
        <label>Key
          <input type="text" name="key" .value=${this._draftKey}
                 @input=${(e) => { this._draftKey = e.target.value; }}>
        </label>
        <button slot="actions" class="da-btn-secondary"
                @click=${() => this._cancelAdd()}>Cancel</button>
        <button slot="actions" class="da-btn-primary"
                @click=${() => this._confirmAdd()}>Add</button>
      </nx-dialog>`;
  }

  _renderDeleteDialog() {
    return html`
      <nx-dialog class="ew-pm-delete" title="Delete field" @close=${() => this._cancelDelete()}>
        <span>Are you sure you want to delete
          <strong>${this._pendingDeleteKey}</strong>?</span>
        <button slot="actions" class="da-btn-secondary"
                @click=${() => this._cancelDelete()}>Cancel</button>
        <button slot="actions" class="da-btn-primary"
                @click=${() => this._confirmDelete()}>Delete</button>
      </nx-dialog>`;
  }

  render() {
    return html`
      <div class="ew-page-metadata">
        <div class="ew-pm-header">
          <h3>Page Metadata</h3>
          <button type="button" class="add-btn" aria-label="Add field"
                  @click=${() => this._onAddClick()}>
            <svg aria-hidden="true" class="icon" viewBox="0 0 20 20">
              <use href="${ADD_ICON_SRC}#icon"></use>
            </svg>
          </button>
        </div>
        <div class="ew-pm-fields">
          ${this._fields.map((field) => this._renderRow(field))}
        </div>
        ${this._showAddDialog ? this._renderAddDialog() : nothing}
        ${this._pendingDeleteKey != null ? this._renderDeleteDialog() : nothing}
      </div>`;
  }
}

customElements.define('ew-page-metadata', EwPageMetadata);
