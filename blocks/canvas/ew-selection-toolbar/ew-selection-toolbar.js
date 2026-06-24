import { LitElement, html } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { commandsFor, COMMAND_BY_ID } from '../editor-utils/command-defs.js';
import {
  getBlockTypePickerValue,
  getLinkInfoInSelection,
  applyLink,
} from '../editor-utils/command-helpers.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);

await import(`${getNx()}/blocks/shared/popover/popover.js`);
await import(`${getNx()}/blocks/shared/picker/picker.js`);
await import(`${getNx()}/blocks/shared/menu/menu.js`);
await import('../../shared/da-link-dialog/da-link-dialog.js');
await import('../../shared/da-alt-dialog/da-alt-dialog.js');

const styles = await loadStyle(import.meta.url);

const MARK_ITEMS = commandsFor('toolbar-marks');
const STRUCTURE_ITEMS = commandsFor('toolbar-structure');
const TABLE_ITEMS = commandsFor('toolbar-table');
const PICKER_DEFS = commandsFor('toolbar-picker');
const LINK_ITEMS = commandsFor('toolbar-link');
const IMAGE_ITEMS = commandsFor('toolbar-image');

const BLOCK_TYPE_LABELS = new Map(PICKER_DEFS.map(({ id, label }) => [id, label]));

const BLOCK_TYPE_PICKER_ITEMS = [
  { section: 'Change into' },
  ...PICKER_DEFS.map(({ id, label }) => ({ value: id, label })),
];

function blockTypeLabelForRaw(raw) {
  if (raw === 'mixed') return 'Mixed';
  return BLOCK_TYPE_LABELS.get(raw)
    ?? raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

class EwSelectionToolbar extends LitElement {
  static properties = {
    view: { attribute: false },
    org: { type: String },
    site: { type: String },
    sourceUrl: { type: String },
    _linkDialogOpen: { state: true },
    _linkHref: { state: true },
    _linkText: { state: true },
    _altDialogOpen: { state: true },
    _altText: { state: true },
    _hasAemAssets: { state: true },
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

  get _imageMenu() { return this.shadowRoot?.querySelector('nx-menu'); }

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
    this._imageMenu?.close();
  }

  get open() {
    return this.classList.contains('open');
  }

  get isInteracting() {
    return (this._picker?.open ?? false)
      || (this._altDialogOpen ?? false)
      || (this._imageMenu?.open ?? false);
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

  /* ---- Command queries ---- */

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

  /* ---- Toolbar button click ---- */

  _onToolbarClick(e) {
    e.preventDefault();
    if (!this.view) return;
    const btn = e.target instanceof Element ? e.target.closest('button') : null;
    if (!btn || btn.disabled) return;
    const { id } = btn.dataset;
    if (!id) return;
    COMMAND_BY_ID.get(id)?.apply(this.view);
    this.requestUpdate();
    if (!this._linkDialogOpen && !this._altDialogOpen) this.view.focus();
  }

  /* ---- Link dialog ---- */

  openLinkDialog(view) {
    if (view) this.view = view;
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
    this.hide();
    this._linkDialogOpen = true;
  }

  _closeLinkDialog() {
    this._linkDialogOpen = false;
    this.view?.focus();
  }

  _onLinkDialogSubmit(e) {
    const { href, text } = e.detail;
    this._closeLinkDialog();
    applyLink(this.view, { href, text });
    this.view.focus();
  }

  get linkDialogOpen() { return this._linkDialogOpen ?? false; }

  /* ---- Alt text dialog ---- */

  openAltDialog() {
    if (!this.view) return;
    this._altText = this.view.state.selection.node?.attrs?.alt ?? '';
    this.hide();
    this._altDialogOpen = true;
  }

  _closeAltDialog() {
    this._altDialogOpen = false;
    this.view?.focus();
  }

  _onAltDialogSubmit(e) {
    const { alt } = e.detail;
    if (!this.view) return;
    const { pos } = this.view.state.selection.$anchor;
    this._closeAltDialog();
    this.view.dispatch(this.view.state.tr.setNodeAttribute(pos, 'alt', alt));
    this.view.focus();
  }

  get altDialogOpen() { return this._altDialogOpen ?? false; }

  /* ---- AEM assets check ---- */

  async _checkAemAssets() {
    const { org, site } = this;
    if (!org || !site) {
      this._hasAemAssets = false;
      return;
    }
    const { getRepositoryConfig } = await import('../ew-panel-extensions/aem-assets.js');
    const config = await getRepositoryConfig(org, site);
    if (this.org !== org || this.site !== site) return;
    this._hasAemAssets = config !== null;
  }

  /* ---- Add image ---- */

  triggerAddImage() {
    if (!this.view) return;
    this._triggerUpload();
  }

  _triggerUpload() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/svg+xml,image/png,image/jpeg,image/gif';
    input.addEventListener('change', (e) => this._onFileSelected(e), { once: true });
    input.click();
  }

  async _onFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file || !this.view || !this.sourceUrl) return;
    const [{ getSourceUploadContext }, { uploadImageFile }] = await Promise.all([
      import('../ew-editor-doc/prose-plugins/sourceUploadContext.js'),
      import('../ew-editor-doc/prose-plugins/imageDrop.js'),
    ]);
    const details = getSourceUploadContext(this.sourceUrl);
    if (!details) return;
    await uploadImageFile(this.view, file, details);
  }

  _openAemAssets() {
    document.querySelector('ew-canvas-header')?.dispatchEvent(new CustomEvent('nx-canvas-open-panel', {
      bubbles: true,
      composed: true,
      detail: { position: 'after', panelName: 'aem-assets' },
    }));
  }

  /* ---- Rendering ---- */

  updated(changed) {
    this._syncBlockTypePicker();
    if (changed.has('org') || changed.has('site')) {
      this._checkAemAssets();
    }
  }

  _renderToolbarButton({ id, label, icon }) {
    const hidden = !this._isCommandVisible(id);
    const disabled = this._isCommandDisabled(id);
    const pressed = this._isCommandActive(id);
    return html`
      <button
        type="button"
        class="toolbar-btn"
        aria-label=${label}
        title=${label}
        aria-pressed=${pressed ? 'true' : 'false'}
        ?hidden=${hidden}
        ?disabled=${disabled}
        data-id=${id}
      >${this._icon(icon)}</button>
    `;
  }

  _renderAddImageItem(item) {
    if (!this._hasAemAssets) return this._renderToolbarButton(item);
    const menuItems = [
      { id: 'upload', label: 'Upload' },
      { id: 'aem-assets', label: 'AEM Assets' },
    ];
    return html`
      <nx-menu placement="above" .items=${menuItems}
        @select=${(e) => {
          if (e.detail.id === 'upload') this._triggerUpload();
          else this._openAemAssets();
        }}>
        <button slot="trigger" type="button" class="toolbar-btn"
          aria-label=${item.label} title=${item.label}>
          ${this._icon(item.icon)}
        </button>
      </nx-menu>
    `;
  }

  _renderImageItem(item) {
    if (item.id === 'image-add') return this._renderAddImageItem(item);
    return this._renderToolbarButton(item);
  }

  _renderBlockTypePicker() {
    return html`
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
    `;
  }

  _renderSections() {
    const renderButtons = (items) => items.map((i) => this._renderToolbarButton(i));
    const renderImageItems = (items) => items.map((i) => this._renderImageItem(i));

    const sections = [
      { items: PICKER_DEFS, render: () => this._renderBlockTypePicker() },
      { items: MARK_ITEMS, render: () => renderButtons(MARK_ITEMS) },
      { items: STRUCTURE_ITEMS, render: () => renderButtons(STRUCTURE_ITEMS) },
      { items: TABLE_ITEMS, render: () => renderButtons(TABLE_ITEMS) },
      { items: LINK_ITEMS, render: () => renderButtons(LINK_ITEMS) },
      { items: IMAGE_ITEMS, render: () => renderImageItems(IMAGE_ITEMS) },
    ];

    const visible = sections.filter(({ items }) => this._hasVisibleCommands(items));
    return visible.flatMap(({ render }, i) => {
      const part = render();
      return i === 0 ? [part] : [html`<span class="toolbar-sep" aria-hidden="true"></span>`, part];
    });
  }

  render() {
    const disabled = !this.view;
    return html`
      <div class="toolbar-wrap" @mousedown=${(e) => e.preventDefault()}>
        <div class="toolbar-actions" ?data-disabled=${disabled}
          @click=${(e) => this._onToolbarClick(e)}>
          ${this._renderSections()}
        </div>
      </div>
      <da-link-dialog
        ?open=${this.linkDialogOpen}
        .href=${this._linkHref ?? ''}
        .text=${this._linkText ?? ''}
        @da-link-submit=${this._onLinkDialogSubmit}
        @da-link-cancel=${this._closeLinkDialog}
      ></da-link-dialog>
      <da-alt-dialog
        ?open=${this.altDialogOpen}
        .alt=${this._altText ?? ''}
        @da-alt-submit=${this._onAltDialogSubmit}
        @da-alt-cancel=${this._closeAltDialog}
      ></da-alt-dialog>
    `;
  }
}

customElements.define('ew-selection-toolbar', EwSelectionToolbar);

export default EwSelectionToolbar;
