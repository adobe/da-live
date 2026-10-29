import { LitElement, html, nothing } from 'da-lit';
import { getNx2 } from '../../../scripts/utils.js';
import { icon } from '../icons.js';
import { findAssetType } from '../assets/asset-types.js';
import { CANCELLED } from '../assets/sources.js';
import {
  describeAsset,
  extensionOf,
  isAssetHref,
  splitHrefForDisplay,
} from '../assets/media.js';
import defaults from './defaults.js';

/** The base URL nx2 modules are loaded from. */
const nx2 = getNx2();
const [{ loadStyle }] = await Promise.all([
  import(`${nx2}/utils/utils.js`),
  // Define `nx-dialog` and `nx-menu`.
  import(`${nx2}/blocks/shared/dialog/dialog.js`),
  import(`${nx2}/blocks/shared/menu/menu.js`),
]);

/** The stylesheets of the field and of nx2 forms, adopted by its shadow root. */
const [style, formStyle] = await Promise.all([
  loadStyle(import.meta.url),
  loadStyle(`${nx2}/styles/form.css`),
]);

/** The tag name the field is registered as. */
const ELEMENT_NAME = 'form-asset';

/** The visible and accessible texts of the field. */
const LABELS = {
  select: 'Select',
  replace: 'Replace',
  remove: 'Remove',
  cancel: 'Cancel',
  copy: 'Copy URL',
  copied: 'URL copied',
  adding: 'Adding asset',
  empty: 'No asset selected',
  fileBadge: 'file',
  removeTitle: 'Remove asset?',
  removeBody: 'The asset will be removed from this field.',
  altText: 'Alt text',
  editAltText: 'Edit alt text',
  altTextPlaceholder: 'Describe the image',
  save: 'Save',
};

/** The error and hint messages of the field. */
const MESSAGES = {
  failed: 'The file could not be added.',
  noSource: 'No source is available for this field.',
  unusableResult: 'The selected file did not return a usable URL.',
  altTextRequired: 'Alt text is required.',
};

/** Where the source menu opens relative to its trigger. */
const MENU_PLACEMENT = 'below-end';

/** The elements of the shadow root the field queries or focuses. */
const SELECTORS = {
  fileInput: '.file-input',
  removeButton: '.asset-remove',
  removeDialog: '.asset-remove-dialog',
  altTextButton: '.asset-alt-edit',
  altTextDialog: '.asset-alt-dialog',
  sourceTrigger: '.asset-source-trigger',
};

/**
 * Renders the mark that flags a required value.
 * @param {boolean} required Whether the value is required.
 * @returns {import('da-lit').TemplateResult|typeof nothing} The mark, or nothing.
 */
function renderRequiredMark(required) {
  if (!required) {
    return nothing;
  }
  return html`<span class="form-required">*</span>`;
}

/**
 * A form field that holds the URL of an image or file. Authors select the asset from one
 * of the field's sources, and image fields can also hold its alt text.
 * @property {string} [value] The stored asset URL.
 * @property {string} [altText] The alt text of the asset.
 * @property {string} [assetType] The name of the accepted asset type, see `ASSET_TYPES`.
 * @property {boolean} showsPreview Whether images expand to a preview panel.
 * @property {boolean} acceptsAltText Whether the field holds alt text.
 * @property {boolean} altRequired Whether the alt text is required.
 * @property {string} [altError] The validation error of the alt text.
 * @property {string} [label] The field label.
 * @property {string} [description] The help text below the field.
 * @property {string} [error] The validation error of the value.
 * @property {boolean} required Whether the value is required.
 * @property {boolean} disabled Whether the field is read-only.
 * @property {object[]} [sources] The sources to select assets from, see
 *   `createAssetSources`.
 * @property {string} [previewOrigin] The origin that serves previews of site media.
 * @fires change When the value or the alt text changes.
 */
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

  /** Results of an older request are ignored once a newer one starts or the value changes. */
  _activeRequestId = 0;

  /** The asset the author selected last, which keeps its name while it is the value. */
  _selection;

  /** The display details of the current value, see `describeAsset`. */
  _asset;

  /** Adopts the field stylesheets once the shadow root exists. */
  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [defaults, formStyle, style];
  }

  /** Drops a running selection and the open remove dialog when the field leaves the page. */
  disconnectedCallback() {
    this._forgetSelection();
    this._confirmingRemove = false;
    super.disconnectedCallback();
  }

  /**
   * Describes the value before each render. A changed value resets the copy confirmation
   * and forgets a selection it no longer matches.
   * @param {Map<string, unknown>} changedProperties The properties that changed, with their
   *   previous values.
   */
  willUpdate(changedProperties) {
    if (changedProperties.has('value')) {
      this._resetCopied();
      if (this.value !== this._selection?.href) {
        this._forgetSelection();
      }
    }
    this._asset = describeAsset({
      href: this.value,
      name: this._selection?.name,
      previewOrigin: this.previewOrigin,
    });
  }

  /**
   * Lists the sources the field offers. A source limited to some asset types is hidden on
   * fields of other types.
   * @returns {object[]} The available sources, see `createAssetSources`.
   */
  get _availableSources() {
    return (this.sources ?? []).filter(({ assetTypes }) => !assetTypes
      || !this.assetType || assetTypes.includes(this.assetType));
  }

  /**
   * Answers whether selecting opens a menu. Several sources open a menu, a single source
   * starts right away.
   * @returns {boolean} Whether there is more than one available source.
   */
  get _hasSourceMenu() {
    return this._availableSources.length > 1;
  }

  /**
   * Answers whether the preview of the current value failed to load.
   * @returns {boolean} Whether the preview URL is the one that failed.
   */
  get _previewFailed() {
    const { previewHref } = this._asset;
    return !!previewHref && previewHref === this._failedPreviewSrc;
  }

  /**
   * Gives the preview URL of the current value, unless it failed to load.
   * @returns {string|undefined} The preview URL, or undefined.
   */
  get _previewSrc() {
    if (this._previewFailed) {
      return undefined;
    }
    return this._asset.previewHref;
  }

  /**
   * Answers whether the field expands to the preview panel. Only images expand, and only in
   * fields that show previews. Everything else stays a single row.
   * @returns {boolean} Whether the preview panel shows.
   */
  get _hasPreviewPanel() {
    if (!this.showsPreview || !this.value) {
      return false;
    }
    return !!findAssetType(this._asset.assetType)?.showsPreview && !this._previewFailed;
  }

  /**
   * Answers whether the author can select a new asset or edit the alt text now.
   * @returns {boolean} Whether the field is editable and no selection is running.
   */
  get _canChange() {
    return !this.disabled && !this._pending;
  }

  /**
   * Answers whether the author can clear the field now.
   * @returns {boolean} Whether the field can change and holds a value.
   */
  get _canRemove() {
    return this._canChange && !!this.value;
  }

  /**
   * Answers whether the field offers to edit alt text.
   * @returns {boolean} Whether the field holds alt text and has a value to describe.
   */
  get _offersAltText() {
    return !!this.acceptsAltText && !!this.value;
  }

  /**
   * Gives the alt text error to show. The engine's required message names no field, so a
   * missing alt text says what is missing.
   * @returns {string|undefined} The error, or undefined when the alt text is valid.
   */
  get _altTextError() {
    if (!this._offersAltText || !this.altError) {
      return undefined;
    }
    if (this.altRequired && !this.altText) {
      return MESSAGES.altTextRequired;
    }
    return this.altError;
  }

  /**
   * Explains why the field offers no source. An asset type can explain it better than the
   * generic hint.
   * @returns {string} The hint.
   */
  get _noSourceMessage() {
    return findAssetType(this.assetType)?.noSourceMessage ?? MESSAGES.noSource;
  }

  /**
   * Gives the text of the status that screen readers announce.
   * @returns {string} The progress or copy confirmation, or an empty string.
   */
  get _statusText() {
    if (this._pending) {
      return LABELS.adding;
    }
    if (this._copied) {
      return LABELS.copied;
    }
    return '';
  }

  /** Forgets the last selection and supersedes a running one, so its result is ignored. */
  _forgetSelection() {
    this._activeRequestId += 1;
    this._selection = undefined;
    this._selectionError = undefined;
    this._pending = false;
  }

  /**
   * Announces a new value or alt text. Native `change` events are not composed, so the host
   * emits its own.
   */
  _emitChange() {
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  /**
   * Moves the focus to an element of the field once it has rendered.
   * @param {string} selector The element to focus, see `SELECTORS`.
   * @returns {Promise<void>} Settles once the element is focused, or the field left the
   *   page.
   */
  async _focus(selector) {
    await this.updateComplete;
    if (this.isConnected) {
      this.shadowRoot.querySelector(selector)?.focus();
    }
  }

  /**
   * Lets the author pick a local file.
   * @param {string[]} types The accepted MIME types.
   * @returns {Promise<File|undefined>} The picked file, or undefined when the author
   *   cancelled.
   */
  _pickFile(types) {
    const input = this.shadowRoot.querySelector(SELECTORS.fileInput);
    input.accept = types.join(',');
    input.value = '';
    return new Promise((resolve) => {
      const listening = new AbortController();
      /** Stops listening and resolves with the picked file, if any. */
      const finish = () => {
        listening.abort();
        resolve(input.files?.[0]);
      };
      input.addEventListener('change', finish, { signal: listening.signal });
      input.addEventListener('cancel', finish, { signal: listening.signal });
      input.click();
    });
  }

  /**
   * Selects an asset from a source. Sources with file types first let the author pick a
   * local file.
   * @param {object} source The source, see `createAssetSources`.
   * @returns {Promise<object>} The source result, an `error`, or `CANCELLED`.
   */
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

  /**
   * Stores the selected asset, or shows why the selection failed.
   * @param {object} result The source result, see `_runSource`.
   */
  _applyResult(result) {
    if (result.cancelled) {
      return;
    }
    if (result.error || !isAssetHref(result.href)) {
      this._selectionError = result.error || MESSAGES.unusableResult;
      return;
    }

    this._selection = { href: result.href, name: result.name };
    this.value = result.href;
    // A new asset needs its own description, so the alt text comes from the source or
    // starts empty.
    this.altText = this.acceptsAltText ? result.alt : undefined;
    this._emitChange();
  }

  /**
   * Selects an asset from a source and stores it, unless a newer request superseded it.
   * @param {object} [source] The source, see `createAssetSources`.
   * @returns {Promise<void>} Settles once the result is applied or superseded.
   */
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

  /**
   * Selects from the source the author chose in the menu.
   * @param {CustomEvent<{ id: string }>} event The menu's `select` event.
   */
  _onMenuSelect({ detail }) {
    this._selectFrom(this._availableSources.find(({ id }) => id === detail.id));
  }

  /** Asks the author to confirm clearing the field. */
  _openRemoveDialog() {
    if (this._canRemove) {
      this._confirmingRemove = true;
    }
  }

  /** Closes the remove dialog. */
  _closeRemoveDialog() {
    this.shadowRoot.querySelector(SELECTORS.removeDialog)?.close();
  }

  /** Returns the focus once the remove dialog closes, to the select button when cleared. */
  _onRemoveDialogClose() {
    this._confirmingRemove = false;
    this._focus(this.value ? SELECTORS.removeButton : SELECTORS.sourceTrigger);
  }

  /** Clears the field and its alt text. Clearing never deletes the file at its source. */
  _confirmRemove() {
    if (this._canRemove) {
      this._forgetSelection();
      this.value = undefined;
      this.altText = undefined;
      this._emitChange();
    }
    this._closeRemoveDialog();
  }

  /** Opens the dialog that edits the alt text. */
  _openAltTextDialog() {
    if (this._canChange) {
      this._editingAltText = true;
    }
  }

  /** Closes the alt text dialog. */
  _closeAltTextDialog() {
    this.shadowRoot.querySelector(SELECTORS.altTextDialog)?.close();
  }

  /** Returns the focus to the alt text button once the dialog closes. */
  _onAltTextDialogClose() {
    this._editingAltText = false;
    this._focus(SELECTORS.altTextButton);
  }

  /**
   * Stores the alt text from the dialog form. Blank alt text is stored as no alt text.
   * @param {SubmitEvent} event The form's `submit` event.
   */
  _saveAltText(event) {
    event.preventDefault();
    this.altText = event.target.elements.altText.value.trim() || undefined;
    this._emitChange();
    this._closeAltTextDialog();
  }

  /**
   * Copies the stored URL. Long URLs show cut in the row, so authors copy the full stored
   * value from here.
   * @returns {Promise<void>} Settles once copied, or when the clipboard refused.
   */
  async _copyValue() {
    try {
      await navigator.clipboard.writeText(this.value);
    } catch {
      return;
    }
    this._copied = true;
  }

  /** Hides the copy confirmation, which stays until the pointer or focus leaves the button. */
  _resetCopied() {
    this._copied = false;
  }

  /**
   * Remembers the loaded preview, so it fades in.
   * @param {Event} event The preview image's `load` event.
   */
  _onPreviewLoad(event) {
    this._loadedPreviewSrc = event.currentTarget.getAttribute('src');
  }

  /**
   * Remembers the failed preview, so the field falls back to a single row.
   * @param {Event} event The preview image's `error` event.
   */
  _onPreviewError(event) {
    this._failedPreviewSrc = event.currentTarget.getAttribute('src');
  }

  /**
   * Renders the field label with its required mark.
   * @returns {import('da-lit').TemplateResult|typeof nothing} The label, or nothing without
   *   one.
   */
  _renderLabel() {
    if (!this.label) {
      return nothing;
    }
    return html`<label id="asset-label">${this.label}${renderRequiredMark(this.required)}</label>`;
  }

  /**
   * Adds the spinner to a busy trigger. The spinner is only visual, the status outside
   * the buttons announces progress.
   * @param {import('da-lit').TemplateResult} content The trigger content.
   * @returns {import('da-lit').TemplateResult} The content, with the spinner while busy.
   */
  _renderTriggerContent(content) {
    if (!this._pending) {
      return content;
    }
    return html`<span class="asset-trigger-content">${content}</span>
      <span class="nx-loading-spinner" aria-hidden="true"></span>`;
  }

  /**
   * Renders the button that selects a new asset, as the trigger of the source menu when
   * there are several sources.
   * @param {object} options The trigger settings.
   * @param {string} options.className The button classes.
   * @param {import('da-lit').TemplateResult} options.content The button content.
   * @param {string} [options.label] The accessible name of an icon button.
   * @returns {import('da-lit').TemplateResult} The button, wrapped in the menu when there
   *   are several sources.
   */
  _renderSourceTrigger({ className, content, label }) {
    const [source] = this._availableSources;
    const hasMenu = this._hasSourceMenu;
    const classes = this._pending ? `${className} is-pending` : className;
    const button = html`
      <button type="button" slot=${hasMenu ? 'trigger' : nothing} class=${classes}
        title=${label ?? nothing} aria-label=${label ?? nothing}
        ?disabled=${!this._canChange || !source}
        @click=${hasMenu ? undefined : () => this._selectFrom(source)}
        >${this._renderTriggerContent(content)}</button>
    `;
    if (!hasMenu) {
      return button;
    }

    const items = this._availableSources.map(({ id, label: itemLabel }) => ({
      id,
      label: itemLabel,
    }));
    return html`
      <nx-menu placement=${MENU_PLACEMENT} .items=${items} @select=${this._onMenuSelect}>
        ${button}
      </nx-menu>
    `;
  }

  /**
   * Renders the button that selects the first asset of an empty field.
   * @returns {import('da-lit').TemplateResult} The select button.
   */
  _renderSelectButton() {
    const chevron = this._hasSourceMenu ? icon('chevronDown', 'asset-menu-chevron') : nothing;
    return this._renderSourceTrigger({
      className: 'asset-source-trigger asset-select',
      content: html`${LABELS.select}${chevron}`,
    });
  }

  /**
   * Renders the buttons that replace or remove the current asset.
   * @returns {import('da-lit').TemplateResult} The replace and remove buttons.
   */
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

  /**
   * Renders the button that copies the URL. Copying only reads the value, so it stays
   * available in read-only fields.
   * @returns {import('da-lit').TemplateResult} The copy button.
   */
  _renderCopyButton() {
    const label = this._copied ? LABELS.copied : LABELS.copy;
    return html`
      <button type="button" class="asset-copy asset-icon-button" title=${label} aria-label=${label}
        @click=${this._copyValue} @pointerleave=${this._resetCopied} @blur=${this._resetCopied}
        >${icon(this._copied ? 'copied' : 'copy')}</button>
    `;
  }

  /**
   * Renders the button that opens the alt text dialog.
   * @returns {import('da-lit').TemplateResult|typeof nothing} The button, or nothing when
   *   the field offers no alt text.
   */
  _renderAltTextButton() {
    if (!this._offersAltText) {
      return nothing;
    }
    return html`
      <button type="button" class="asset-alt-edit asset-icon-button" title=${LABELS.editAltText}
        aria-label=${LABELS.editAltText} ?disabled=${!this._canChange}
        @click=${this._openAltTextDialog}>${icon('altText')}</button>
    `;
  }

  /**
   * Renders one status that is always present, so screen readers announce its changes. It
   * stays outside the buttons and the busy group, which can both hide announcements.
   * @returns {import('da-lit').TemplateResult} The status.
   */
  _renderStatus() {
    return html`<span class="asset-status" role="status">${this._statusText}</span>`;
  }

  /**
   * Renders the actions of the row, by whether the field holds a value.
   * @returns {import('da-lit').TemplateResult} The select button, or the value actions.
   */
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

  /**
   * Renders the preview image, which fades in once loaded.
   * @param {string} previewSrc The preview URL.
   * @returns {import('da-lit').TemplateResult} The image.
   */
  _renderPreviewImage(previewSrc) {
    return html`<img class=${previewSrc === this._loadedPreviewSrc ? 'is-loaded' : ''}
      src=${previewSrc} alt="" @load=${this._onPreviewLoad} @error=${this._onPreviewError}>`;
  }

  /**
   * Renders the preview panel with the file type badge.
   * @returns {import('da-lit').TemplateResult|typeof nothing} The panel, or nothing when
   *   the field shows no preview.
   */
  _renderPreview() {
    if (!this._hasPreviewPanel) {
      return nothing;
    }

    const previewSrc = this._previewSrc;
    return html`
      <div class="asset-preview">
        <span class="asset-file-type">${extensionOf(this._asset.name) || LABELS.fileBadge}</span>
        ${previewSrc ? this._renderPreviewImage(previewSrc) : nothing}
      </div>
    `;
  }

  /**
   * Renders the stored URL, split so its file name stays visible when cut. The parts join
   * without whitespace, so the row text reads as the stored URL.
   * @returns {import('da-lit').TemplateResult} The URL.
   */
  _renderUrl() {
    const { base, stem, tail } = splitHrefForDisplay(this.value);
    const baseSpan = html`<span class="asset-url-base">${base}</span>`;
    const stemSpan = html`<span class="asset-url-stem">${stem}</span>`;
    const tailSpan = html`<span class="asset-url-tail">${tail}</span>`;
    const fileSpan = html`<span class="asset-url-file">${stemSpan}${tailSpan}</span>`;
    return html`<span class="asset-url" title=${base + stem + tail}>${baseSpan}${fileSpan}</span>`;
  }

  /**
   * Renders the row with the URL or placeholder and the actions.
   * @returns {import('da-lit').TemplateResult} The row.
   */
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

  /**
   * Renders the dialog that edits the alt text.
   * @returns {import('da-lit').TemplateResult|typeof nothing} The dialog, or nothing while
   *   closed.
   */
  _renderAltTextDialog() {
    if (!this._editingAltText) {
      return nothing;
    }
    return html`
      <nx-dialog class="asset-alt-dialog" title=${LABELS.editAltText}
        @close=${this._onAltTextDialogClose}>
        <form id="asset-alt-form" class="asset-alt-form" @submit=${this._saveAltText}>
          <label for="asset-alt-input">${LABELS.altText}${renderRequiredMark(this.altRequired)}</label>
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

  /**
   * Renders the dialog that confirms clearing the field.
   * @returns {import('da-lit').TemplateResult|typeof nothing} The dialog, or nothing while
   *   closed.
   */
  _renderRemoveDialog() {
    if (!this._confirmingRemove) {
      return nothing;
    }
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

  /**
   * Renders the most pressing message, errors before hints.
   * @returns {import('da-lit').TemplateResult|typeof nothing} The message, or nothing.
   */
  _renderMessage() {
    if (this._selectionError) {
      return html`<p role="alert" class="form-field-error">${this._selectionError}</p>`;
    }
    if (this.error) {
      return html`<p class="form-field-error">${this.error}</p>`;
    }
    if (this._altTextError) {
      return html`<p class="form-field-error">${this._altTextError}</p>`;
    }
    if (this.sources && !this._availableSources.length && !this.disabled) {
      return html`<p class="form-field-description">${this._noSourceMessage}</p>`;
    }
    if (this.description) {
      return html`<p class="form-field-description">${this.description}</p>`;
    }
    return nothing;
  }

  /**
   * Renders the field, its status and message, the hidden file input and open dialogs.
   * @returns {import('da-lit').TemplateResult} The field.
   */
  render() {
    const invalid = this.error || this._selectionError || this._altTextError;
    return html`
      <div class="form-field${invalid ? ' has-error' : ''}">
        ${this._renderLabel()}
        <div class="asset${this._hasPreviewPanel ? ' has-preview' : ''}" role="group"
          aria-labelledby=${this.label ? 'asset-label' : nothing}
          aria-busy=${this._pending ? 'true' : 'false'}>
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

if (!customElements.get(ELEMENT_NAME)) {
  customElements.define(ELEMENT_NAME, FormAsset);
}

export default FormAsset;
