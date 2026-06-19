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
import { selectionToolbarController } from '../editor-utils/selection-toolbar-controller.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);

await import(`${getNx()}/blocks/shared/popover/popover.js`);
await import(`${getNx()}/blocks/shared/picker/picker.js`);
await import('../../shared/da-link-dialog/da-link-dialog.js');

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
    _mode: { state: true },
    _linkDialogOpen: { state: true },
    _linkHref: { state: true },
    _linkText: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this._unsubscribeController = selectionToolbarController.subscribe((s) => {
      this.view = s.view ?? this.view;
      this._mode = s.mode;
      if (s.shouldShow) this._show();
      else if (!this.isInteracting) this._hide();
    });
    // Safety net: any click outside the toolbar, the active editor DOM, and
    // the WYSIWYG iframe deactivates the controller. Editor blur handlers
    // should normally take care of this; this catches the gaps.
    this._onOutsidePointerDown = (e) => {
      if (!this.open) return;
      const path = e.composedPath();
      if (path.includes(this)) return;
      const ctrl = selectionToolbarController.getState();
      const editorDom = ctrl.view?.dom;
      if (editorDom && path.includes(editorDom)) return;
      if (ctrl.iframe && path.includes(ctrl.iframe)) return;
      selectionToolbarController.setInactive();
    };
    document.addEventListener('pointerdown', this._onOutsidePointerDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('pointerdown', this._onOutsidePointerDown);
    this._unsubscribeController?.();
  }

  get _picker() { return this.shadowRoot?.querySelector('nx-picker'); }

  _show() {
    const main = document.querySelector('main');
    if (main) {
      const { left, width } = main.getBoundingClientRect();
      this.style.setProperty('--toolbar-anchor-x', `${left + width / 2}px`);
    }
    this.classList.add('open');
    this.requestUpdate();
  }

  _hide() {
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
      selectionToolbarController.restoreFocus();
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
      selectionToolbarController.restoreFocus();
      return;
    }
    if (id) {
      COMMAND_BY_ID.get(id)?.apply(this.view);
      this.requestUpdate();
      selectionToolbarController.restoreFocus();
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
    const info = getLinkInfoInSelection(this.view.state);
    if (info) {
      this._linkHref = info.href;
      this._linkText = info.text;
    } else {
      const { from, to } = this.view.state.selection;
      this._linkHref = '';
      this._linkText = from !== to ? this.view.state.doc.textBetween(from, to) : '';
    }
    selectionToolbarController.setInteracting(true);
    this._linkDialogOpen = true;
  }

  _closeLinkDialog() {
    this._linkDialogOpen = false;
    selectionToolbarController.setInteracting(false);
    selectionToolbarController.restoreFocus();
  }

  _onLinkDialogSubmit(e) {
    const { href, text } = e.detail;
    this._closeLinkDialog();
    applyLink(this.view, { href, text });
    selectionToolbarController.restoreFocus();
  }

  get linkDialogOpen() { return this._linkDialogOpen ?? false; }

  openLinkDialog(view) {
    this.view = view;
    this._showLinkDialog();
  }

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

  render() {
    const disabled = !this.view;
    // In wysiwyg mode the iframe owns block-level structure (paragraph/heading,
    // lists, tables) — only show inline marks and link controls.
    const inlineOnly = this._mode === 'wysiwyg';
    return html`
      <div class="toolbar-wrap"
        @mousedown=${(e) => e.preventDefault()}>
        <div class="toolbar-actions" ?data-disabled=${disabled}
          @click=${(e) => this._onToolbarClick(e)}>
          ${inlineOnly ? nothing : html`
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
          `}
          ${MARK_ITEMS.map((m) => this._renderMarkButton(m))}
          ${inlineOnly ? nothing : this._renderBlockStructure()}
          <span class="toolbar-sep" aria-hidden="true"></span>
          ${this._renderLinkButtons()}
        </div>
      </div>
      <da-link-dialog
        ?open=${this.linkDialogOpen}
        .href=${this._linkHref ?? ''}
        .text=${this._linkText ?? ''}
        @da-link-submit=${this._onLinkDialogSubmit}
        @da-link-cancel=${this._closeLinkDialog}
      ></da-link-dialog>
    `;
  }
}

customElements.define('ew-selection-toolbar', EwSelectionToolbar);

export default EwSelectionToolbar;
