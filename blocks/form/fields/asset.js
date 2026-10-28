import { LitElement, html, nothing } from 'da-lit';
import { getNx2 } from '../../../scripts/utils.js';
import { icon } from '../icons.js';
import { ASSET_TYPES, CANCELLED } from '../utils/assets.js';
import { ASSET_KINDS, describeAsset, extensionOf, isAssetHref, splitHrefForDisplay } from '../utils/media.js';
import defaults from './defaults.js';

const nx2 = getNx2();
const [{ loadStyle }] = await Promise.all([
  import(`${nx2}/utils/utils.js`),
  import(`${nx2}/blocks/shared/dialog/dialog.js`),
  import(`${nx2}/blocks/shared/menu/menu.js`),
]);

const [style, formStyle] = await Promise.all([
  loadStyle(import.meta.url),
  loadStyle(`${nx2}/styles/form.css`),
]);

const LABELS = {
  select: 'Select',
  replace: 'Replace',
  remove: 'Remove',
  cancel: 'Cancel',
  copy: 'Copy URL',
  copied: 'URL copied',
  adding: 'Adding asset',
  empty: 'No asset selected',
  removeTitle: 'Remove asset?',
  removeBody: 'The asset will be removed from this field.',
  altText: 'Alt text',
  editAltText: 'Edit alt text',
  altTextPlaceholder: 'Describe the image',
  save: 'Save',
};

const MESSAGES = {
  failed: 'The file could not be added.',
  noSource: 'No source is available for this field.',
  noFileSource: 'Files can only be selected from AEM Assets, which is not set up for this site.',
  unusableResult: 'The selected file did not return a usable URL.',
  altTextRequired: 'Alt text is required.',
};

const MENU_PLACEMENT = 'below-end';
const SELECTORS = {
  fileInput: '.file-input',
  removeButton: '.asset-remove',
  altTextButton: '.asset-alt-edit',
  sourceTrigger: '.asset-source-trigger',
};

class FormAsset extends LitElement {
  static properties = {
    value: { type: String },
    altText: { type: String },
    assetType: { type: String },
    showsPreview: { type: Boolean },
    acceptsAltText: { type: Boolean },
    altRequired: { type: Boolean },
    altError: { type: String },
    label: { type: String },
    description: { type: String },
    error: { type: String },
    required: { type: Boolean },
    disabled: { type: Boolean, reflect: true },

    sources: { attribute: false },
    previewOrigin: { type: String },

    _pending: { state: true },
    _selectionError: { state: true },
    _loadedPreviewSrc: { state: true },
    _failedPreviewSrc: { state: true },
    _confirmingRemove: { state: true },
    _editingAltText: { state: true },
    _copied: { state: true },
  };

  // Results of an older request are ignored once a newer one starts or the value changes.
  _activeRequestId = 0;

  _selection;

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [defaults, formStyle, style];
  }

  disconnectedCallback() {
    this._forgetSelection();
    this._confirmingRemove = false;
    super.disconnectedCallback();
  }

  willUpdate(changed) {
    if (changed.has('value')) this._resetCopied();
    if (changed.has('value') && this.value !== this._selection?.href) this._forgetSelection();
    this._asset = describeAsset({
      href: this.value,
      name: this._selection?.name,
      previewOrigin: this.previewOrigin,
    });
  }

  // A source limited to some asset types is hidden on fields of other types.
  get _availableSources() {
    return (this.sources ?? []).filter(({ assetTypes }) => !assetTypes
      || !this.assetType || assetTypes.includes(this.assetType));
  }

  get _previewFailed() {
    const { previewHref } = this._asset;
    return !!previewHref && previewHref === this._failedPreviewSrc;
  }

  get _previewSrc() {
    return this._previewFailed ? undefined : this._asset.previewHref;
  }

  // Only images expand to the preview panel, and only in fields that show previews.
  // Everything else stays a single row.
  get _hasPreviewPanel() {
    if (!this.showsPreview || !this.value) return false;
    return this._asset.kind === ASSET_KINDS.image && !this._previewFailed;
  }

  get _canChange() {
    return !this.disabled && !this._pending;
  }

  get _canRemove() {
    return this._canChange && !!this.value;
  }

  _forgetSelection() {
    this._activeRequestId += 1;
    this._selection = undefined;
    this._selectionError = undefined;
    this._pending = false;
  }

  // Native `change` events are not composed, so the host emits its own.
  _emitChange() {
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  async _focus(selector) {
    await this.updateComplete;
    if (this.isConnected) this.shadowRoot.querySelector(selector)?.focus();
  }

  _pickFile(types) {
    const input = this.shadowRoot.querySelector(SELECTORS.fileInput);
    input.accept = types.join(',');
    input.value = '';
    return new Promise((resolve) => {
      const listening = new AbortController();
      const finish = () => {
        listening.abort();
        resolve(input.files?.[0]);
      };
      input.addEventListener('change', finish, { signal: listening.signal });
      input.addEventListener('cancel', finish, { signal: listening.signal });
      input.click();
    });
  }

  async _runSource(source) {
    const request = { assetType: this.assetType };
    try {
      if (!source.fileTypes) {
        return await source.select(request);
      }

      const file = await this._pickFile(source.fileTypes);
      if (!file) {
        return CANCELLED;
      }

      return await source.select({ ...request, file });
    } catch (error) {
      return { error: error?.message || MESSAGES.failed };
    }
  }

  _applyResult(result) {
    if (result.cancelled) return;
    if (result.error || !isAssetHref(result.href)) {
      this._selectionError = result.error || MESSAGES.unusableResult;
      return;
    }
    this._selection = { href: result.href, name: result.name };
    this.value = result.href;
    // A new asset needs its own description, so the alt text comes from the source or starts empty.
    this.altText = this.acceptsAltText ? result.alt : undefined;
    this._emitChange();
  }

  async _selectFrom(source) {
    if (!this._canChange || !source) {
      return;
    }

    this._activeRequestId += 1;
    const requestId = this._activeRequestId;
    this._pending = true;
    this._selectionError = undefined;

    const result = await this._runSource(source);

    // A newer selection or a cleared field superseded this request.
    if (requestId !== this._activeRequestId) {
      return;
    }

    this._pending = false;
    this._applyResult(result);
    this._focus(SELECTORS.sourceTrigger);
  }

  _onMenuSelect({ detail }) {
    this._selectFrom(this._availableSources.find(({ id }) => id === detail.id));
  }

  _openRemoveDialog() {
    if (this._canRemove) this._confirmingRemove = true;
  }

  _closeRemoveDialog() {
    this.shadowRoot.querySelector('.asset-remove-dialog')?.close();
  }

  _onRemoveDialogClose() {
    this._confirmingRemove = false;
    this._focus(this.value ? SELECTORS.removeButton : SELECTORS.sourceTrigger);
  }

  // Clearing the field never deletes the file at its source.
  _confirmRemove() {
    if (this._canRemove) {
      this._forgetSelection();
      this.value = undefined;
      this.altText = undefined;
      this._emitChange();
    }
    this._closeRemoveDialog();
  }

  _openAltTextDialog() {
    if (this._canChange) {
      this._editingAltText = true;
    }
  }

  _closeAltTextDialog() {
    this.shadowRoot.querySelector('.asset-alt-dialog')?.close();
  }

  _onAltTextDialogClose() {
    this._editingAltText = false;
    this._focus(SELECTORS.altTextButton);
  }

  _saveAltText(event) {
    event.preventDefault();
    this.altText = event.target.elements.altText.value.trim() || undefined;
    this._emitChange();
    this._closeAltTextDialog();
  }

  // Long URLs show cut in the row, so authors copy the full stored value from here.
  async _copyValue() {
    try {
      await navigator.clipboard.writeText(this.value);
    } catch {
      return;
    }
    this._copied = true;
  }

  // The confirmation stays until the pointer or focus leaves the button.
  _resetCopied() {
    this._copied = false;
  }

  _onPreviewLoad(event) {
    this._loadedPreviewSrc = event.currentTarget.getAttribute('src');
  }

  _onPreviewError(event) {
    this._failedPreviewSrc = event.currentTarget.getAttribute('src');
  }

  // The spinner is only visual. The status outside the buttons announces progress.
  _renderTriggerContent(content) {
    if (!this._pending) return content;
    return html`<span class="asset-trigger-content">${content}</span>
      <span class="nx-loading-spinner" aria-hidden="true"></span>`;
  }

  // Several sources open a menu, a single source starts right away.
  _renderSourceTrigger({ className, content, label }) {
    const sources = this._availableSources;
    const classes = this._pending ? `${className} is-pending` : className;
    const body = this._renderTriggerContent(content);
    if (sources.length > 1) {
      const items = sources.map(({ id, label: sourceLabel }) => ({ id, label: sourceLabel }));
      return html`
        <nx-menu placement=${MENU_PLACEMENT} .items=${items} @select=${this._onMenuSelect}>
          <button slot="trigger" type="button" class=${classes} title=${label ?? nothing}
            aria-label=${label ?? nothing} ?disabled=${!this._canChange}>${body}</button>
        </nx-menu>
      `;
    }
    const [source] = sources;
    return html`<button type="button" class=${classes} title=${label ?? nothing}
      aria-label=${label ?? nothing} ?disabled=${!this._canChange || !source}
      @click=${() => this._selectFrom(source)}>${body}</button>`;
  }

  _renderSelectButton() {
    const chevron = this._availableSources.length > 1 ? icon('chevronDown', 'asset-menu-chevron') : nothing;
    return this._renderSourceTrigger({
      className: 'asset-source-trigger asset-select',
      content: html`${LABELS.select}${chevron}`,
    });
  }

  _renderChangeButtons() {
    return html`
      ${this._renderSourceTrigger({
        className: 'asset-source-trigger asset-icon-button',
        content: icon('replace'),
        label: LABELS.replace,
      })}
      <button type="button" class="asset-remove asset-icon-button" title=${LABELS.remove}
        aria-label=${LABELS.remove} ?disabled=${!this._canRemove}
        @click=${this._openRemoveDialog}>${icon('remove')}</button>
    `;
  }

  // Copying only reads the value, so it stays available in read-only fields.
  _renderCopyButton() {
    const label = this._copied ? LABELS.copied : LABELS.copy;
    return html`
      <button type="button" class="asset-copy asset-icon-button" title=${label} aria-label=${label}
        @click=${this._copyValue} @pointerleave=${this._resetCopied} @blur=${this._resetCopied}
        >${icon(this._copied ? 'copied' : 'copy')}</button>
    `;
  }

  // One status that is always rendered, so screen readers announce its changes. It
  // stays outside the buttons and the busy group, which can both hide announcements.
  _renderStatus() {
    let text = '';
    if (this._pending) text = LABELS.adding;
    else if (this._copied) text = LABELS.copied;
    return html`<span class="asset-status" role="status">${text}</span>`;
  }

  _renderActions() {
    if (!this.value) {
      return this._renderSelectButton();
    }
    return html`
      ${this._renderCopyButton()}
      ${this._renderAltTextButton()}
      ${this._renderChangeButtons()}
    `;
  }

  _renderPreviewImage(previewSrc) {
    return html`<img class=${previewSrc === this._loadedPreviewSrc ? 'is-loaded' : ''}
      src=${previewSrc} alt="" @load=${this._onPreviewLoad} @error=${this._onPreviewError}>`;
  }

  _renderPreview() {
    if (!this._hasPreviewPanel) return nothing;
    const previewSrc = this._previewSrc;
    return html`
      <div class="asset-preview">
        <span class="asset-file-type">${extensionOf(this._asset.name) || ASSET_KINDS.file}</span>
        ${previewSrc ? this._renderPreviewImage(previewSrc) : nothing}
      </div>
    `;
  }

  _renderUrl() {
    const { base, stem, tail } = splitHrefForDisplay(this.value);
    return html`<span class="asset-url" title=${base + stem + tail}><span class="asset-url-base">${base}</span><span class="asset-url-file"><span class="asset-url-stem">${stem}</span><span class="asset-url-tail">${tail}</span></span></span>`;
  }

  _renderRow() {
    return html`
      <div class="asset-row">
        ${this.value
          ? this._renderUrl()
          : html`<span class="asset-placeholder">${LABELS.empty}</span>`}
        <div class="asset-actions">${this._renderActions()}</div>
      </div>
    `;
  }

  get _offersAltText() {
    return !!this.acceptsAltText && !!this.value;
  }

  _renderAltTextLabel() {
    return html`${LABELS.altText}${this.altRequired ? html`<span class="form-required">*</span>` : nothing}`;
  }

  // The engine's required message names no field, so a missing alt text says what is missing.
  get _altTextError() {
    if (!this._offersAltText || !this.altError) {
      return undefined;
    }

    return this.altRequired && !this.altText ? MESSAGES.altTextRequired : this.altError;
  }

  _renderAltTextButton() {
    if (!this._offersAltText) return nothing;
    return html`
      <button type="button" class="asset-alt-edit asset-icon-button" title=${LABELS.editAltText}
        aria-label=${LABELS.editAltText} ?disabled=${!this._canChange}
        @click=${this._openAltTextDialog}>${icon('altText')}</button>
    `;
  }

  _renderAltTextDialog() {
    if (!this._editingAltText) return nothing;
    return html`
      <nx-dialog class="asset-alt-dialog" title=${LABELS.editAltText} @close=${this._onAltTextDialogClose}>
        <form id="asset-alt-form" class="asset-alt-form" @submit=${this._saveAltText}>
          <label for="asset-alt-input">${this._renderAltTextLabel()}</label>
          <input id="asset-alt-input" name="altText" class="nx-input" type="text" autocomplete="off"
            autofocus placeholder=${LABELS.altTextPlaceholder} .value=${this.altText ?? ''}>
        </form>
        <button slot="actions" type="button" class="nx-form-btn-secondary"
          @click=${this._closeAltTextDialog}>${LABELS.cancel}</button>
        <button slot="actions" type="submit" form="asset-alt-form"
          class="asset-alt-save nx-form-btn-primary">${LABELS.save}</button>
      </nx-dialog>
    `;
  }

  _renderRemoveDialog() {
    if (!this._confirmingRemove) return nothing;
    return html`
      <nx-dialog class="asset-remove-dialog" title=${LABELS.removeTitle}
        @close=${this._onRemoveDialogClose}>
        <p>${LABELS.removeBody}</p>
        <button slot="actions" type="button" class="nx-form-btn-secondary" autofocus
          @click=${this._closeRemoveDialog}>${LABELS.cancel}</button>
        <button slot="actions" type="button" class="asset-remove-confirm nx-form-btn-primary"
          @click=${this._confirmRemove}>${LABELS.remove}</button>
      </nx-dialog>
    `;
  }

  _renderMessage() {
    if (this._selectionError) {
      return html`<p role="alert" class="form-field-error">${this._selectionError}</p>`;
    }
    if (this.error) return html`<p class="form-field-error">${this.error}</p>`;
    if (this._altTextError) return html`<p class="form-field-error">${this._altTextError}</p>`;
    if (this.sources && !this._availableSources.length && !this.disabled) {
      const noSource = this.assetType === ASSET_TYPES.file
        ? MESSAGES.noFileSource
        : MESSAGES.noSource;
      return html`<p class="form-field-description">${noSource}</p>`;
    }
    if (this.description) return html`<p class="form-field-description">${this.description}</p>`;
    return nothing;
  }

  render() {
    const invalid = this.error || this._selectionError || this._altTextError;
    return html`
      <div class="form-field${invalid ? ' has-error' : ''}">
        ${this.label ? html`
          <label id="asset-label">${this.label}${this.required ? html`<span class="form-required">*</span>` : nothing}</label>
        ` : nothing}
        <div class="asset${this._hasPreviewPanel ? ' has-preview' : ''}" role="group"
          aria-labelledby=${this.label ? 'asset-label' : nothing} aria-busy=${this._pending ? 'true' : 'false'}>
          ${this._renderPreview()}
          ${this._renderRow()}
        </div>
        ${this._renderStatus()}
        ${this._renderMessage()}
      </div>
      <input class="file-input" type="file" hidden>
      ${this._renderRemoveDialog()}
      ${this._renderAltTextDialog()}
    `;
  }
}

if (!customElements.get('form-asset')) customElements.define('form-asset', FormAsset);

export default FormAsset;
