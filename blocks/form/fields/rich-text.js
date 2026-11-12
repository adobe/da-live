import { LitElement, html, nothing } from 'da-lit';
import { getNx2 } from '../../../scripts/utils.js';
import defaults from './defaults.js';
import { icon } from '../icons.js';
import './rich-text-toolbar.js';
import { loadRichTextEditor } from '../utils/rich-text/editor.js';
import { getLinkDraft } from '../utils/rich-text/commands.js';
import { TOOL_IDS } from '../utils/rich-text/tools.js';
import { placeBubble } from '../utils/rich-text/bubble.js';

const { loadStyle } = await import(`${getNx2()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);

const ELEMENT_NAME = 'form-rich-text';

/** The id of the label, which names the editable area. */
const LABEL_ID = 'form-rich-text-label';

const STATUS = Object.freeze({ ready: 'ready', error: 'error' });

const SELECTORS = {
  toolbars: 'form-rich-text-toolbar',
  bubble: '.form-rich-text-bubble',
  editor: '.form-rich-text-editor',
  linkDialog: 'da-link-dialog',
};

/** The properties the attributes of the editable area depend on. */
const ATTRIBUTE_PROPERTIES = ['disabled', 'error', 'label'];

const loadLinkDialog = () => import('../../shared/da-link-dialog/da-link-dialog.js');

/**
 * A form field that holds rich text as HTML. Authors format it with a toolbar, a bubble
 * next to the selection, and keyboard shortcuts.
 * @property {string} [value] The HTML value, in the form the SDK stores.
 * @property {string} [label] The field label.
 * @property {string} [description] The help text below the field.
 * @property {string} [error] The validation error of the value.
 * @property {boolean} required Whether the value is required.
 * @property {boolean} disabled Whether the field is read-only.
 * @fires input When the value changes while typing.
 * @fires change When the field loses focus after its value changed.
 */
class FormRichText extends LitElement {
  static properties = {
    value: { type: String },
    label: { type: String },
    description: { type: String },
    error: { type: String },
    required: { type: Boolean },
    disabled: { type: Boolean, reflect: true },
    _status: { state: true },
    _editorState: { state: true },
    _focused: { state: true },
    _link: { state: true },
  };

  /** Loads the editor. Tests replace it to make loading fail. */
  static loadEditor = loadRichTextEditor;

  _editor;

  _view;

  /** The value the editor shows, so the echo of a published value does not reset it. */
  _editorValue;

  /** Whether the value changed since the last `change` event. */
  _dirty = false;

  /** Adopts the stylesheets and restores the editor when the field comes back. */
  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [defaults, style];
    if (this._status === STATUS.ready) {
      this._initEditor();
    }
  }

  /** Releases the editor when the field leaves the page. */
  disconnectedCallback() {
    this._view?.destroy();
    this._view = undefined;
    super.disconnectedCallback();
  }

  /** Starts loading the editor. */
  async firstUpdated() {
    await this._loadEditor();
  }

  /**
   * Keeps the bubble and the editor in step with the properties.
   * @param {Map<string, unknown>} changed The properties that changed.
   */
  updated(changed) {
    this._positionBubble();
    this._syncEditor(changed);
  }

  /**
   * Waits for the toolbars too, so the field is settled once `updateComplete` resolves.
   * @returns {Promise<boolean>} Whether no update is pending.
   */
  async getUpdateComplete() {
    const complete = await super.getUpdateComplete();
    const toolbars = [...this.shadowRoot.querySelectorAll(SELECTORS.toolbars)];
    await Promise.all(toolbars.map((toolbar) => toolbar.updateComplete));
    return complete;
  }

  /** Moves the focus into the editable area. */
  focus() {
    this._view?.focus();
  }

  /** Loads and mounts the editor, or shows that it could not load. */
  async _loadEditor() {
    try {
      this._editor = await this.constructor.loadEditor({ onLink: () => this._openLink() });
      this._status = STATUS.ready;
      if (this.isConnected) {
        this._initEditor();
      }
    } catch {
      this._status = STATUS.error;
    }
  }

  /**
   * Keeps the editor in step with the value and the attributes set from outside.
   * @param {Map<string, unknown>} changed The properties that changed.
   */
  _syncEditor(changed) {
    if (!this._view) {
      return;
    }

    if (changed.has('value')) {
      this._loadValue();
    }
    if (ATTRIBUTE_PROPERTIES.some((property) => changed.has(property))) {
      this._view.setProps({ attributes: this._attributes() });
    }
  }

  /** Loads a value set from outside into the editor, unless the editor already shows it. */
  _loadValue() {
    const value = this.value ?? '';
    if (value === this._editorValue) {
      return;
    }

    this._editorValue = value;
    this._view.updateState(this._editor.createState(value));
    this._syncEditorState();
  }

  /**
   * Answers whether the author can edit, which needs a mounted editor and an enabled field.
   * @returns {boolean} Whether the field is editable.
   */
  get _canEdit() {
    return !!this._view && !this.disabled;
  }

  /**
   * Answers whether the bubble shows, which needs a focused selection and no open dialog.
   * @returns {boolean} Whether the bubble shows.
   */
  get _showBubble() {
    return this._canEdit && !!this._focused && !this._link && !this._editorState.selection.empty;
  }

  /**
   * Places the bubble next to the selection while it shows, and hides it when the
   * selection scrolls away.
   */
  async _positionBubble() {
    if (!this._showBubble) {
      return;
    }

    const bubble = this.shadowRoot.querySelector(SELECTORS.bubble);
    await bubble.updateComplete;
    if (!bubble.isConnected || !this._view) {
      return;
    }

    const { from, to } = this._view.state.selection;
    const { left, top, hidden } = placeBubble({
      start: this._view.coordsAtPos(from),
      end: this._view.coordsAtPos(to),
      area: bubble.offsetParent.getBoundingClientRect(),
      width: bubble.offsetWidth,
      height: bubble.offsetHeight,
    });
    Object.assign(bubble.style, {
      left: `${left}px`,
      top: `${top}px`,
      visibility: hidden ? 'hidden' : '',
    });
  }

  /**
   * Lists the attributes of the editable area.
   * @returns {Record<string, string>} The attributes by name.
   */
  _attributes() {
    return {
      role: 'textbox',
      'aria-multiline': 'true',
      ...(this.label ? { 'aria-labelledby': LABEL_ID } : { 'aria-label': 'Rich text' }),
      ...(this.error ? { 'aria-invalid': 'true' } : {}),
      ...(this.disabled ? { 'aria-disabled': 'true' } : {}),
      class: 'form-rich-text-content',
    };
  }

  /** Mounts the editor with the current value. The editor must be loaded. */
  _initEditor() {
    const mount = this.shadowRoot.querySelector(SELECTORS.editor);
    this._editorValue = this.value ?? '';
    this._view = this._editor.mount(mount, {
      state: this._editor.createState(this._editorValue),
      editable: () => !this.disabled,
      attributes: this._attributes(),
      dispatchTransaction: (transaction) => this._dispatch(transaction),
    });
    this._view.dom.addEventListener('scroll', () => this._positionBubble());
    this._syncEditorState();
  }

  /**
   * Applies a transaction to the editor, and publishes the value when the document changed.
   * @param {object} transaction The ProseMirror transaction.
   */
  _dispatch(transaction) {
    this._view.updateState(this._view.state.apply(transaction));
    this._syncEditorState();
    if (transaction.docChanged) {
      this._publishValue();
    }
  }

  /** Publishes the value the editor shows and emits `input`, unless it did not change. */
  _publishValue() {
    const value = this._editor.serialize(this._view.state);
    if (value === this._editorValue) {
      return;
    }

    this._editorValue = value;
    this._dirty = true;
    this.value = value;
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  }

  /** Copies the editor state into a reactive property, so the field renders it. */
  _syncEditorState() {
    this._editorState = this._view.state;
  }

  /**
   * Runs a command on the editor and keeps the focus there.
   * @param {import('../utils/rich-text/commands.js').RichTextCommand} command The command.
   */
  _run(command) {
    if (!this._canEdit) {
      return;
    }

    command(this._view.state, this._view.dispatch);
    this._view.focus();
  }

  /**
   * Runs the command a toolbar asks for.
   * @param {CustomEvent} event The `form-rich-text-command` event.
   */
  _onCommand(event) {
    this._run(event.detail.command);
  }

  /** Opens the link dialog for the link or the text at the selection. */
  async _openLink() {
    if (!this._canEdit || this._link) {
      return;
    }

    const draft = getLinkDraft(this._view.state);
    try {
      await loadLinkDialog();
    } catch {
      return;
    }
    this._link = draft;
  }

  /**
   * Applies the link the author entered and closes the dialog.
   * @param {CustomEvent} event The `da-link-submit` event.
   */
  _onLinkSubmit(event) {
    event.stopPropagation();
    const { href, text, title } = event.detail;
    const link = this._editor.linkCommand({ href, text, title });
    link(this._view.state, this._view.dispatch);
    this.shadowRoot.querySelector(SELECTORS.linkDialog)?.close();
  }

  /**
   * Forgets the closed link dialog and returns the focus to the editor.
   * @param {Event} event The `close` event of the dialog.
   */
  _onLinkClose(event) {
    event.stopPropagation();
    this._link = undefined;
    this._view?.focus();
  }

  /** Emits `change` when the value changed since the last one. */
  _commit() {
    if (!this._dirty) {
      return;
    }

    this._dirty = false;
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  /**
   * Keeps the native `input` events of the editor and the link dialog inside the field.
   * They fire before the value changes, and the field emits its own once it has.
   * @param {Event} event The native `input` event.
   */
  _onInnerInput(event) {
    event.stopPropagation();
  }

  /** Shows the toolbar state for the selection. */
  _onFocusIn() {
    this._focused = true;
  }

  /**
   * Commits the value when the focus leaves the field.
   * @param {FocusEvent} event The `focusout` event.
   */
  _onFocusOut(event) {
    if (this.shadowRoot.contains(event.relatedTarget)) {
      return;
    }

    this._focused = false;
    this._commit();
  }

  /**
   * Renders a toolbar, which shows the editor state and asks the field to run commands.
   * @param {object} [options] The render settings.
   * @param {boolean} [options.floating] Whether it is the bubble next to the selection.
   * @returns {import('da-lit').TemplateResult} The toolbar.
   */
  _renderToolbar({ floating = false } = {}) {
    return html`
      <form-rich-text-toolbar
        class=${floating ? 'form-rich-text-bubble' : nothing}
        ?floating=${floating}
        .editorState=${this._editorState}
        .toolset=${this._editor?.toolset}
        .focused=${!!this._focused}
        .openTool=${this._link ? TOOL_IDS.link : undefined}
        .disabled=${!this._canEdit}
        @form-rich-text-command=${this._onCommand}
      ></form-rich-text-toolbar>
    `;
  }

  /**
   * Renders the link dialog while the author edits a link.
   * @returns {import('da-lit').TemplateResult|typeof nothing} The dialog, or nothing.
   */
  _renderLink() {
    if (!this._link) {
      return nothing;
    }

    return html`
      <da-link-dialog
        open
        show-title
        .href=${this._link.href}
        .text=${this._link.text}
        .anchorTitle=${this._link.title}
        @da-link-submit=${this._onLinkSubmit}
        @close=${this._onLinkClose}
      ></da-link-dialog>
    `;
  }

  /**
   * Renders the label, which focuses the editor when clicked.
   * @returns {import('da-lit').TemplateResult|typeof nothing} The label, or nothing.
   */
  _renderLabel() {
    if (!this.label) {
      return nothing;
    }

    const required = this.required ? html`<span class="form-required">*</span>` : nothing;
    return html`
      <label id=${LABEL_ID} @click=${() => this.focus()}>${this.label}${required}</label>
    `;
  }

  /**
   * Renders the load error, the validation error and the help text.
   * @returns {import('da-lit').TemplateResult} The messages below the field.
   */
  _renderMessages() {
    const showHint = !this.error && this.description;
    return html`
      ${this._status === STATUS.error
        ? html`<p class="form-field-error">The rich text editor could not be loaded.</p>`
        : nothing}
      ${this.error ? html`<p class="form-field-error">${this.error}</p>` : nothing}
      ${showHint ? html`<p class="form-field-description">${this.description}</p>` : nothing}
    `;
  }

  render() {
    return html`
      <div class="form-field${this.error ? ' has-error' : ''}"
        @focusin=${this._onFocusIn} @focusout=${this._onFocusOut} @input=${this._onInnerInput}>
        ${this._renderLabel()}
        <div class="form-rich-text">
          ${this._renderToolbar()}
          ${this._renderLink()}
          <div class="form-input-wrap">
            <div class="form-rich-text-editor" aria-busy=${this._status ? 'false' : 'true'}></div>
            ${this._showBubble ? this._renderToolbar({ floating: true }) : nothing}
            ${this.error ? icon('alert', 'form-field-icon') : nothing}
          </div>
        </div>
        ${this._renderMessages()}
      </div>
    `;
  }
}

if (!customElements.get(ELEMENT_NAME)) customElements.define(ELEMENT_NAME, FormRichText);

export default FormRichText;
