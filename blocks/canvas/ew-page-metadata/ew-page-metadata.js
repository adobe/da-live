import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import getSheet from '../../shared/sheet.js';
import { canvasBus } from '../utils/canvas-bus.js';
import { getExtensionsBridge } from '../editor-utils/extensions-bridge.js';
import { readMetadataRows, setMetadataValue, addMetadataRow, deleteMetadataRow } from '../editor-utils/metadata.js';
import { buildMetadataFields, resolveMetadataFields, formatJsonValue, compactJsonValue, isValidJson } from '../editor-utils/metadata-fields.js';
import { loadBlockOptions } from '../ew-panel-extensions/helpers.js';

const DELETE_ICON_SRC = '/img/icons/s2-icon-delete-20-n.svg';
const ADD_ICON_SRC = '/img/icons/s2-icon-addcircle-20-n.svg';
const EMPTY_OPTION = { value: '', label: 'None' };

const fieldId = (field) => `ew-pm-${field.key.trim().toLowerCase().replace(/\s+/g, '-')}`;
// Only native text controls can be targeted by <label for>.
const isTextField = (field) => field.type === 'json' || !field.values?.length;

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);
await import(`${getNx()}/blocks/shared/dialog/dialog.js`);
await import(`${getNx()}/blocks/shared/picker/picker.js`);
await import('./ew-metadata-multiselect.js');

const [formStyle, buttonsStyle, style] = await Promise.all([
  getSheet(`${getNx2()}/styles/form.css`),
  getSheet(`${getNx2()}/styles/buttons.css`),
  loadStyle(import.meta.url),
]);

class EwPageMetadata extends LitElement {
  static properties = {
    _docRows: { state: true },
    _libraryFields: { state: true },
    _hashState: { state: true },
    _showAddDialog: { state: true },
    _draftKey: { state: true },
    _draftValue: { state: true },
    _keyError: { state: true },
    _pendingDeleteKey: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [formStyle, buttonsStyle, style];
    // editorDocState only fires on changes, so read the current rows on connect.
    const { view: currentView } = getExtensionsBridge();
    this._docRows = currentView ? readMetadataRows(currentView) : [];
    this._libraryFields = [];
    this._unsubHash = hashChange.subscribe((state) => {
      const prev = this._hashState;
      this._hashState = state;
      if (state?.org !== prev?.org || state?.site !== prev?.site) this._loadLibraryFields();
    });
    // Rows refresh on editorDocState; an empty editorHtmlState means the doc was unloaded.
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
    return resolveMetadataFields(this._docRows ?? [], this._libraryFields ?? []);
  }

  // Same source as the versions panel: the editor view is only editable with write access.
  get _canWrite() {
    return getExtensionsBridge().view?.editable ?? false;
  }

  // Empty values remove the row; unchanged values are not written.
  _commit(field, value) {
    const { view } = getExtensionsBridge();
    if (!view || !this._canWrite || value === field.value) return;
    if (value.trim()) setMetadataValue(view, field.key, value);
    else deleteMetadataRow(view, field.key);
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
    this._draftValue = '';
    this._keyError = '';
  }

  _cancelAdd() {
    this._showAddDialog = false;
  }

  _confirmAdd() {
    const key = this._draftKey?.trim();
    if (!key) {
      this._keyError = 'Field name is required';
      return;
    }
    if (this._fields.some((field) => field.key.toLowerCase() === key.toLowerCase())) {
      this._keyError = 'Field already exists';
      return;
    }
    const { view } = getExtensionsBridge();
    if (view) {
      addMetadataRow(view, key, this._draftValue?.trim() ?? '');
      this._docRows = readMetadataRows(view);
    }
    this._showAddDialog = false;
  }

  _renderField(field) {
    const readOnly = !this._canWrite;
    const id = fieldId(field);
    if (field.type === 'json') {
      return html`
        <textarea id=${id} class="nx-input ew-pm-json" .value=${formatJsonValue(field.value)} ?readonly=${readOnly}
                  @blur=${(e) => this._commit(field, compactJsonValue(e.target.value))}></textarea>`;
    }
    if (!field.values?.length) {
      return html`
        <input type="text" id=${id} class="nx-input" .value=${field.value} ?readonly=${readOnly}
               @blur=${(e) => this._commit(field, e.target.value)}>`;
    }
    if (field.type === 'multi') {
      return html`
        <ew-metadata-multiselect .items=${field.values} .value=${field.value} .label=${field.label} ?disabled=${readOnly}
          @change=${(e) => this._commit(field, e.detail.value)}></ew-metadata-multiselect>`;
    }
    // nx-picker has no disabled state; inert blocks interaction.
    return html`
      <nx-picker size="m" variant="field" placeholder="Please Select" ?inert=${readOnly} .items=${[
        EMPTY_OPTION,
        ...field.values.map((v) => ({
          value: v.value,
          label: v.title,
          ...(v.colorValue ? { swatch: v.colorValue } : {}),
        })),
      ]}
        .value=${field.value}
        @change=${(e) => this._commit(field, e.detail.value)}></nx-picker>`;
  }

  _renderRow(field) {
    const invalidJson = field.type === 'json' && !isValidJson(field.value);
    return html`
      <div class="ew-pm-row nx-form-field ${invalidJson ? 'nx-field-error' : ''}" data-key=${field.key}>
        <label class="ew-pm-label" for=${isTextField(field) ? fieldId(field) : nothing}>${field.label}</label>
        <div class="ew-pm-control-row">
          <div class="ew-pm-control">${this._renderField(field)}</div>
          ${field.removable && this._canWrite ? html`
            <button type="button" class="nx-action-btn-icon nx-btn-sm delete-btn" aria-label="Delete ${field.label}"
                    @click=${() => this._onDeleteClick(field.key)}>
              <svg aria-hidden="true" viewBox="0 0 20 20">
                <use href="${DELETE_ICON_SRC}#icon"></use>
              </svg>
            </button>` : nothing}
        </div>
        ${invalidJson ? html`<span class="nx-input-error-msg" role="alert">Invalid JSON</span>` : nothing}
      </div>`;
  }

  _renderAddDialog() {
    return html`
      <nx-dialog class="ew-pm-add" title="Add page metadata field" @close=${() => this._cancelAdd()}>
        <label class="nx-form-field ${this._keyError ? 'nx-field-error' : ''}">
          <span>Field name <span class="ew-pm-required" aria-hidden="true">*</span></span>
          <input type="text" name="key" class="nx-input" aria-required="true" .value=${this._draftKey}
                 @input=${(e) => { this._draftKey = e.target.value; this._keyError = ''; }}>
          ${this._keyError ? html`<span class="nx-input-error-msg" role="alert">${this._keyError}</span>` : nothing}
        </label>
        <label class="nx-form-field">
          <span>Value</span>
          <input type="text" name="value" class="nx-input" .value=${this._draftValue}
                 @input=${(e) => { this._draftValue = e.target.value; }}>
        </label>
        <button slot="actions" class="nx-form-btn-secondary"
                @click=${() => this._cancelAdd()}>Cancel</button>
        <button slot="actions" class="nx-form-btn-primary"
                @click=${() => this._confirmAdd()}>Add</button>
      </nx-dialog>`;
  }

  _renderDeleteDialog() {
    return html`
      <nx-dialog class="ew-pm-delete" title="Delete field" @close=${() => this._cancelDelete()}>
        <span>Are you sure you want to remove
          <strong>${this._pendingDeleteKey}</strong> metadata from the page?</span>
        <button slot="actions" class="nx-form-btn-secondary"
                @click=${() => this._cancelDelete()}>Cancel</button>
        <button slot="actions" class="nx-form-btn-primary"
                @click=${() => this._confirmDelete()}>Delete</button>
      </nx-dialog>`;
  }

  render() {
    return html`
      <div class="ew-page-metadata">
        <div class="ew-pm-header">
          <h3>Page Metadata</h3>
          ${this._canWrite ? html`
            <button type="button" class="nx-action-btn-icon nx-btn-sm add-btn" aria-label="Add page metadata field"
                    @click=${() => this._onAddClick()}>
              <svg aria-hidden="true" viewBox="0 0 20 20">
                <use href="${ADD_ICON_SRC}#icon"></use>
              </svg>
            </button>` : nothing}
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
