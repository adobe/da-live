import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import getSheet from '../../shared/sheet.js';
import { canvasBus } from '../utils/canvas-bus.js';
import { getExtensionsBridge } from '../editor-utils/extensions-bridge.js';
import {
  readMetadataRows, setMetadataValue, addMetadataRow, deleteMetadataRow,
  findMetadataImage, setMetadataImage, selectMetadataImageTarget,
} from '../editor-utils/metadata.js';
import { buildMetadataFields, resolveMetadataFields, formatJsonValue, compactJsonValue, isValidJson } from '../editor-utils/metadata-fields.js';
import { loadBlockOptions } from '../ew-panel-extensions/helpers.js';
import { SUPPORTED_IMAGE_FILES, uploadImageMedia } from '../ew-editor-doc/prose-plugins/imageDrop.js';
import { getSourceUploadContext } from '../ew-editor-doc/prose-plugins/sourceUploadContext.js';

const DELETE_ICON_SRC = '/img/icons/s2-icon-delete-20-n.svg';
const ADD_ICON_SRC = '/img/icons/s2-icon-addcircle-20-n.svg';
const EMPTY_OPTION = { value: '', label: 'None' };

const fieldId = (field) => `ew-pm-${field.key.trim().toLowerCase().replace(/\s+/g, '-')}`;
// Only native text controls can be targeted by <label for>.
const isTextField = (field) => field.type === 'json' || (field.type !== 'image' && !field.values?.length);

const IMAGE_MENU_ITEMS = [{ id: 'upload', label: 'Upload' }, { id: 'aem-assets', label: 'AEM Assets' }];
const IMAGE_TYPES_LABEL = 'SVG, PNG, JPEG, GIF, AVIF or WebP';

// Loaded on demand: the asset selector pulls in the AEM Assets integration.
const loadAemAssets = () => import('../ew-panel-extensions/aem-assets.js');

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);
await import(`${getNx()}/blocks/shared/dialog/dialog.js`);
await import(`${getNx()}/blocks/shared/picker/picker.js`);
await import(`${getNx()}/blocks/shared/menu/menu.js`);
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
    _hasAemAssets: { state: true },
    _uploadingKey: { state: true },
    _imageError: { state: true },
    _assetTarget: { state: true },
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
      if (state?.org !== prev?.org || state?.site !== prev?.site) {
        this._loadLibraryFields();
        this._loadAssetsConfig();
      }
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

  // Image fields offer AEM Assets only when the site has an assets repository configured.
  async _loadAssetsConfig() {
    const loadId = (this._assetsLoadId ?? 0) + 1;
    this._assetsLoadId = loadId;
    this._hasAemAssets = false;
    const { org, site } = this._hashState ?? {};
    if (!org || !site) return;
    try {
      const { getRepositoryConfig } = await loadAemAssets();
      const config = await getRepositoryConfig(org, site);
      if (loadId === this._assetsLoadId && this.isConnected) this._hasAemAssets = !!config;
    } catch {
      // Without a repository config, images can still be uploaded.
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
    if (!view || !this._canWrite || field.type === 'image' || value === field.value) return;
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

  // Pins an image change to the page and row it started on, and that row's current image.
  _captureImageTarget(field) {
    const { view, sourceUrl } = getExtensionsBridge();
    if (!view || !this._canWrite || field.type !== 'image') return null;
    const image = findMetadataImage(view, field.key)?.node ?? null;
    return { view, sourceUrl, key: field.key, image };
  }

  _isImageTargetCurrent(target) {
    const { view, sourceUrl } = getExtensionsBridge();
    return this.isConnected && !!target && view === target.view && sourceUrl === target.sourceUrl
      && view.editable !== false
      && (findMetadataImage(view, target.key)?.node ?? null) === target.image;
  }

  _triggerImageUpload(field) {
    const target = this._captureImageTarget(field);
    if (!target) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = SUPPORTED_IMAGE_FILES.join(',');
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) this._uploadImage(field, target, file);
    }, { once: true });
    input.click();
  }

  async _uploadImage(field, target, file) {
    if (!this._isImageTargetCurrent(target)) return;
    this._imageError = null;
    const details = getSourceUploadContext(target.sourceUrl);
    if (!details) {
      this._imageError = { key: field.key, message: 'Unable to upload an image: the document source is unavailable.' };
      return;
    }
    if (!SUPPORTED_IMAGE_FILES.includes(file.type)) {
      this._imageError = { key: field.key, message: `Select an ${IMAGE_TYPES_LABEL} image.` };
      return;
    }
    this._uploadingKey = field.key;
    try {
      const src = await uploadImageMedia(file, details);
      // The upload can outlast the page or the row: only write to the image it started from.
      if (!src || !this._isImageTargetCurrent(target)) return;
      setMetadataImage(target.view, field.key, { src });
      this._docRows = readMetadataRows(target.view);
    } catch (error) {
      if (this._isImageTargetCurrent(target)) {
        this._imageError = { key: field.key, message: `Unable to upload the image: ${error.message}` };
      }
    } finally {
      if (this._uploadingKey === field.key) this._uploadingKey = null;
    }
  }

  async _openImageAssets(field) {
    const target = this._captureImageTarget(field);
    if (!target) return;
    this._assetTarget = target;
    this._imageError = null;
    await this.updateComplete;
    const container = this.shadowRoot.querySelector('.ew-pm-assets');
    if (!container || this._assetTarget !== target) return;
    try {
      const { renderAssets } = await loadAemAssets();
      await renderAssets({
        container,
        org: this._hashState?.org,
        site: this._hashState?.site,
        onClose: () => { this._assetTarget = null; },
        // The selector inserts at the selection: point it at this row's image or value cell.
        getView: () => {
          if (this._assetTarget !== target || !this._isImageTargetCurrent(target)) return null;
          selectMetadataImageTarget(target.view, target.key);
          return target.view;
        },
      });
    } catch (error) {
      if (this._assetTarget !== target) return;
      this._assetTarget = null;
      this._imageError = { key: field.key, message: `Unable to open AEM Assets: ${error.message}` };
    }
  }

  _renderImageField(field) {
    const disabled = !this._canWrite || !!this._uploadingKey;
    const label = field.image ? 'Replace image' : 'Add image';
    // The editor's own image resolves media URLs that are relative to the published page.
    const src = field.image
      ? getExtensionsBridge().view?.nodeDOM?.(field.image.pos)?.src ?? field.image.src : '';
    return html`
      <div class="ew-pm-image">
        ${src
          ? html`<img class="ew-pm-image-preview" src=${src} alt=${field.image.alt}>`
          : html`<p class="ew-pm-image-empty">No image</p>`}
        ${this._hasAemAssets ? html`
          <nx-menu placement="below-start" .items=${IMAGE_MENU_ITEMS} ?inert=${disabled}
            @select=${(e) => {
              if (e.detail.id === 'upload') this._triggerImageUpload(field);
              else if (e.detail.id === 'aem-assets') this._openImageAssets(field);
            }}>
            <button slot="trigger" type="button" class="nx-form-btn-secondary" ?disabled=${disabled}>${label}</button>
          </nx-menu>` : html`
          <button type="button" class="nx-form-btn-secondary" ?disabled=${disabled}
            @click=${() => this._triggerImageUpload(field)}>${label}</button>`}
        ${this._uploadingKey === field.key ? html`<span role="status">Uploading image...</span>` : nothing}
        ${this._imageError?.key === field.key
          ? html`<span class="nx-input-error-msg" role="alert">${this._imageError.message}</span>` : nothing}
      </div>`;
  }

  _renderField(field) {
    if (field.type === 'image') return this._renderImageField(field);
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
        <form id="ew-pm-add-form" novalidate
              @submit=${(e) => { e.preventDefault(); this._confirmAdd(); }}>
          <label class="nx-form-field ${this._keyError ? 'nx-field-error' : ''}">
            <span>Field name <span class="ew-pm-required" aria-hidden="true">*</span></span>
            <input type="text" name="key" class="nx-input" required .value=${this._draftKey}
                   @input=${(e) => { this._draftKey = e.target.value; this._keyError = ''; }}>
            ${this._keyError ? html`<span class="nx-input-error-msg" role="alert">${this._keyError}</span>` : nothing}
          </label>
          <label class="nx-form-field">
            <span>Value</span>
            <input type="text" name="value" class="nx-input" .value=${this._draftValue}
                   @input=${(e) => { this._draftValue = e.target.value; }}>
          </label>
        </form>
        <button type="button" slot="actions" class="nx-form-btn-secondary"
                @click=${() => this._cancelAdd()}>Cancel</button>
        <button type="submit" form="ew-pm-add-form" slot="actions" class="nx-form-btn-primary">Add</button>
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
        ${this._assetTarget ? html`
          <nx-dialog title=${this._assetTarget.image ? 'Replace image' : 'Add image'}
            @close=${() => { this._assetTarget = null; }}>
            <div class="ew-pm-assets"></div>
          </nx-dialog>` : nothing}
      </div>`;
  }
}

customElements.define('ew-page-metadata', EwPageMetadata);
