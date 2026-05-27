import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { commandsFor, COMMAND_BY_ID } from '../editor-utils/command-defs.js';
import {
  getBlockTypePickerValue,
  selectionHasLink,
  getLinkInfoInSelection,
  applyLink,
  removeLink,
} from '../editor-utils/command-helpers.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);

await import(`${getNx()}/blocks/shared/popover/popover.js`);
await import(`${getNx()}/blocks/shared/picker/picker.js`);

const styles = await loadStyle(import.meta.url);

const MARK_ITEMS = commandsFor('toolbar-marks');
const STRUCTURE_ITEMS = commandsFor('toolbar-structure');
const TABLE_ITEMS = commandsFor('toolbar-table');
const PICKER_DEFS = commandsFor('toolbar-picker');

const BLOCK_TYPE_LABELS = new Map(PICKER_DEFS.map(({ id, label }) => [id, label]));

const BLOCK_TYPE_PICKER_ITEMS = [
  { section: 'Change into' },
  ...PICKER_DEFS.map(({ id, label }) => ({ value: id, label })),
];

const LINK_ICON = 'link';
const UNLINK_ICON = 'unlink';

function blockTypeLabelForRaw(raw) {
  if (raw === 'mixed') return 'Mixed';
  return BLOCK_TYPE_LABELS.get(raw)
    ?? raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

class EwSelectionToolbar extends LitElement {
  static properties = {
    view: { attribute: false },
    _linkDialogOpen: { state: true },
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
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('pointerdown', this._onOutsidePointerDown);
  }

  get _picker() { return this.shadowRoot?.querySelector('nx-picker'); }

  show() {
    const main = document.querySelector('main');
    if (main) {
      const { left, width } = main.getBoundingClientRect();
      this.style.setProperty('--toolbar-anchor-x', `${left + width / 2}px`);
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

  get isInteracting() {
    return this._picker?.open ?? false;
  }

  _icon(name) {
    return html`<svg aria-hidden="true" class="icon" viewBox="0 0 20 20"><use href="/img/icons/s2-icon-${name}-20-n.svg#icon"></use></svg>`;
  }

  /* ---- Block-type picker ---- */

  _syncBlockTypePicker() {
    const picker = this._picker;
    if (!picker || !this.view) return;
    const raw = getBlockTypePickerValue(this.view.state);
    if (BLOCK_TYPE_LABELS.has(raw)) {
      picker.value = raw;
      picker.labelOverride = '';
    } else {
      picker.value = '';
      picker.labelOverride = blockTypeLabelForRaw(raw);
    }
  }

  _onBlockTypeChange(e) {
    if (!this.view) return;
    const cmd = COMMAND_BY_ID.get(e.detail.value);
    if (cmd) {
      cmd.apply(this.view);
      this.requestUpdate();
      this.view.focus();
    }
  }

  /* ---- Mark / structure buttons ---- */

  _onToolbarClick(e) {
    e.preventDefault();
    if (!this.view) return;
    const btn = e.target instanceof Element ? e.target.closest('button') : null;
    if (!btn || btn.disabled) return;

    const { id, link } = btn.dataset;
    if (link === 'create' || link === 'edit') {
      this._showLinkDialog();
      return;
    }
    if (link === 'remove') {
      removeLink(this.view);
      this.requestUpdate();
      this.view.focus();
      return;
    }
    if (id) {
      COMMAND_BY_ID.get(id)?.apply(this.view);
      this.requestUpdate();
      this.view.focus();
    }
  }

  _isCommandActive(id) {
    if (!this.view) return false;
    return COMMAND_BY_ID.get(id)?.active?.(this.view.state) ?? false;
  }

  _isCommandVisible(id) {
    if (!this.view) return true;
    const cmd = COMMAND_BY_ID.get(id);
    return cmd?.visible ? cmd.visible(this.view.state) : true;
  }

  _isCommandDisabled(id) {
    if (!this.view) return false;
    const cmd = COMMAND_BY_ID.get(id);
    return cmd?.disabled ? cmd.disabled(this.view.state) : false;
  }

  _hasVisibleCommands(items) {
    return items.some(({ id }) => this._isCommandVisible(id));
  }

  _renderToolbarSep() {
    return html`<span class="toolbar-sep" aria-hidden="true"></span>`;
  }

  _renderBlockStructure() {
    const hasStructure = this._hasVisibleCommands(STRUCTURE_ITEMS);
    const hasTable = this._hasVisibleCommands(TABLE_ITEMS);
    if (!hasStructure && !hasTable) return nothing;
    return html`
      ${this._renderToolbarSep()}
      ${hasStructure ? STRUCTURE_ITEMS.map((s) => this._renderStructureButton(s)) : nothing}
      ${hasStructure && hasTable ? this._renderToolbarSep() : nothing}
      ${hasTable ? TABLE_ITEMS.map((s) => this._renderStructureButton(s)) : nothing}
    `;
  }

  _hasLink() {
    if (!this.view) return false;
    return selectionHasLink(this.view.state);
  }

  /* ---- Link dialog ---- */

  _showLinkDialog() {
    if (!this.view) return;
    this.hide();
    this._linkDialogOpen = true;
  }

  _closeLinkDialog() {
    this._linkDialogOpen = false;
    this.view?.focus();
  }

  _onLinkDialogSubmit(e) {
    e.preventDefault();
    if (!this.view) return;
    const form = e.target;
    const href = form.elements['link-href'].value.trim();
    if (!href) return;
    const text = form.elements['link-text'].value;
    this._closeLinkDialog();
    applyLink(this.view, { href, text });
    this.view.focus();
  }

  _onLinkBackdropMousedown(e) {
    if (e.target === e.currentTarget) this._closeLinkDialog();
  }

  _onLinkBackdropKeydown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this._closeLinkDialog();
    }
  }

  get linkDialogOpen() { return this._linkDialogOpen ?? false; }

  /* ---- Rendering ---- */

  updated() {
    this._syncBlockTypePicker();
  }

  _renderMarkButton({ id, label, icon }) {
    const pressed = this._isCommandActive(id);
    return html`
      <button
        type="button"
        class="toolbar-btn"
        aria-label=${label}
        title=${label}
        aria-pressed=${pressed ? 'true' : 'false'}
        data-id=${id}
      >${this._icon(icon)}</button>
    `;
  }

  _renderStructureButton({ id, label, icon }) {
    const hidden = !this._isCommandVisible(id);
    const disabled = this._isCommandDisabled(id);
    return html`
      <button
        type="button"
        class="toolbar-btn"
        aria-label=${label}
        title=${label}
        ?hidden=${hidden}
        ?disabled=${disabled}
        data-id=${id}
      >${this._icon(icon)}</button>
    `;
  }

  _renderLinkButtons() {
    const hasLink = this._hasLink();
    return html`
      <button type="button" class="toolbar-btn" aria-label="Create link" title="Create link"
        data-link="create" ?hidden=${hasLink}>${this._icon(LINK_ICON)}</button>
      <button type="button" class="toolbar-btn" aria-label="Edit link" title="Edit link"
        data-link="edit" ?hidden=${!hasLink}>${this._icon(LINK_ICON)}</button>
      <button type="button" class="toolbar-btn" aria-label="Remove link" title="Remove link"
        data-link="remove" ?hidden=${!hasLink}>${this._icon(UNLINK_ICON)}</button>
    `;
  }

  _renderLinkDialog() {
    if (!this._linkDialogOpen) return nothing;
    const info = this.view ? getLinkInfoInSelection(this.view.state) : null;

    let hrefVal = '';
    let textVal = '';
    if (info) {
      hrefVal = info.href;
      textVal = info.text;
    } else if (this.view) {
      const { from, to } = this.view.state.selection;
      textVal = from !== to ? this.view.state.doc.textBetween(from, to) : '';
    }

    return html`
      <div class="link-dialog"
        @mousedown=${this._onLinkBackdropMousedown}
        @keydown=${this._onLinkBackdropKeydown}>
        <form class="link-form" @submit=${this._onLinkDialogSubmit}>
          <label class="link-form-field">
            <span>URL</span>
            <input name="link-href" type="url" placeholder="https://…"
                   required autocomplete="off" .value=${hrefVal} />
          </label>
          <label class="link-form-field">
            <span>Display text</span>
            <input name="link-text" type="text" placeholder="Link text"
                   autocomplete="off" .value=${textVal} />
          </label>
          <div class="link-form-actions">
            <button type="button" class="link-form-cancel"
              @click=${() => this._closeLinkDialog()}>Cancel</button>
            <button type="submit" class="link-form-save">Save</button>
          </div>
        </form>
      </div>
    `;
  }

  render() {
    const disabled = !this.view;
    return html`
      <div class="toolbar-wrap"
        @mousedown=${(e) => e.preventDefault()}>
        <div class="toolbar-actions" ?data-disabled=${disabled}
          @click=${(e) => this._onToolbarClick(e)}>
          <span class="toolbar-block-type-wrap">
            <nx-picker
              class="toolbar-block-type"
              placement="above"
              ignoreFocus
              .items=${BLOCK_TYPE_PICKER_ITEMS}
              value="paragraph"
              @change=${(e) => this._onBlockTypeChange(e)}
            ></nx-picker>
          </span>
          <span class="toolbar-sep" aria-hidden="true"></span>
          ${MARK_ITEMS.map((m) => this._renderMarkButton(m))}
          ${this._renderBlockStructure()}
          <span class="toolbar-sep" aria-hidden="true"></span>
          ${this._renderLinkButtons()}
        </div>
      </div>
      ${this._renderLinkDialog()}
    `;
  }
}

customElements.define('ew-selection-toolbar', EwSelectionToolbar);

export default EwSelectionToolbar;
