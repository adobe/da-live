import { LitElement, html, nothing } from 'da-lit';
import { getNx, loadStyle } from '../../shared/nxutils.js';

await import(`${getNx()}/blocks/shared/popover/popover.js`);
await import(`${getNx()}/blocks/shared/picker/picker.js`);
import { commandsFor, COMMAND_BY_ID } from './command-defs.js';
import {
  getBlockTypePickerValue,
  selectionHasLink,
  getLinkInfoInSelection,
  applyLink,
  removeLink,
} from './command-helpers.js';

const styles = await loadStyle(import.meta.url);

const MARK_ITEMS = commandsFor('toolbar-marks');
const STRUCTURE_ITEMS = commandsFor('toolbar-structure');
const PICKER_DEFS = commandsFor('toolbar-picker');

const BLOCK_TYPE_LABELS = new Map(PICKER_DEFS.map(({ id, label }) => [id, label]));

const BLOCK_TYPE_PICKER_ITEMS = [
  { section: 'Change into' },
  ...PICKER_DEFS.map(({ id, label }) => ({ value: id, label })),
];

const LOCAL_ICONS = new Set([
  'BlockCode', 'BlockQuote', 'Heading1', 'Heading2', 'Heading3', 'Heading4', 'Heading5', 'Heading6',
  'Rail', 'Separator', 'TableAdd', 'TextIndentIncrease', 'TextIndentDecrease',
]);

function iconSrc(name) {
  const file = `s2-icon-${name.toLowerCase()}-20-n.svg`;
  return LOCAL_ICONS.has(name) ? `/blocks/canvas/img/${file}` : `/img/icons/${file}`;
}

function blockTypeLabelForRaw(raw) {
  if (raw === 'mixed') return 'Mixed';
  return BLOCK_TYPE_LABELS.get(raw)
    ?? raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

class NxSelectionToolbar extends LitElement {
  static properties = {
    view: { attribute: false },
    _linkDialogOpen: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  get _popover() { return this.shadowRoot?.querySelector('nx-popover'); }

  get _picker() { return this.shadowRoot?.querySelector('nx-picker'); }

  show({ x, y }) {
    this._popover?.show({ x, y, placement: 'above' });
    this.requestUpdate();
  }

  hide() {
    this._popover?.close();
  }

  get open() {
    return this._popover?.open ?? false;
  }

  _icon(name) {
    return html`<img src="${iconSrc(name)}" aria-hidden="true">`;
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
        data-link="create" ?hidden=${hasLink}>${this._icon('Link')}</button>
      <button type="button" class="toolbar-btn" aria-label="Edit link" title="Edit link"
        data-link="edit" ?hidden=${!hasLink}>${this._icon('Link')}</button>
      <button type="button" class="toolbar-btn" aria-label="Remove link" title="Remove link"
        data-link="remove" ?hidden=${!hasLink}>${this._icon('Unlink')}</button>
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
      <nx-popover placement="above">
        <div class="toolbar-actions" ?data-disabled=${disabled}
          @mousedown=${(e) => { e.preventDefault(); e.stopPropagation(); }}
          @click=${(e) => this._onToolbarClick(e)}>
          <span class="toolbar-block-type-wrap">
            <nx-picker
              class="toolbar-block-type"
              placement="below"
              ignoreFocus
              .items=${BLOCK_TYPE_PICKER_ITEMS}
              value="paragraph"
              @change=${(e) => this._onBlockTypeChange(e)}
            ></nx-picker>
          </span>
          <span class="toolbar-sep" aria-hidden="true"></span>
          ${MARK_ITEMS.map((m) => this._renderMarkButton(m))}
          <span class="toolbar-sep" aria-hidden="true"></span>
          ${STRUCTURE_ITEMS.map((s) => this._renderStructureButton(s))}
          <span class="toolbar-sep" aria-hidden="true"></span>
          ${this._renderLinkButtons()}
        </div>
      </nx-popover>
      ${this._renderLinkDialog()}
    `;
  }
}

customElements.define('nx-selection-toolbar', NxSelectionToolbar);

export default NxSelectionToolbar;
