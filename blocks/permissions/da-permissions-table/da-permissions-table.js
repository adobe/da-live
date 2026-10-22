import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import getSheet from '../../shared/sheet.js';

await import(`${getNx()}/blocks/shared/pills/pills.js`);

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);

const [form, buttons, style] = await Promise.all([
  getSheet(`${getNx2()}/styles/form.css`),
  getSheet(`${getNx2()}/styles/buttons.css`),
  loadStyle(import.meta.url),
]);

const ADD_ICON_SRC = '/img/icons/s2-icon-addcircle-20-n.svg';
const VISIBLE_LIMIT = 4;

const INHERITED_KEY = { read: 'inheritedRead', write: 'inheritedWrite', none: 'inheritedNone' };
const LEVEL_LABEL = { read: 'Read', write: 'Write', none: 'None' };

/**
 * Presentational B2 table: renders `Slot[]` as a compact Scope | Read | Write
 * table with collapsible member cells. Owns no permission state itself —
 * every change is an outbound event for `<da-permissions>` to act on.
 */
class DaPermissionsTable extends LitElement {
  static properties = {
    slots: { attribute: false },
    org: { type: String },
    site: { attribute: false },
    expanded: { attribute: false },
    editable: { type: Boolean },
    busy: { type: Boolean },
    adding: { attribute: false },
  };

  constructor() {
    super();
    this.slots = [];
    this.org = '';
    this.site = null;
    this.expanded = new Set();
    this.editable = false;
    this.busy = false;
    this.adding = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [form, buttons, style];
  }

  _toggle(path) {
    this.dispatchEvent(new CustomEvent('permissions-toggle', { detail: { path }, bubbles: true, composed: true }));
  }

  _openAdd(path, level) {
    this.dispatchEvent(new CustomEvent('permissions-add-open', { detail: { path, level }, bubbles: true, composed: true }));
  }

  _cancelAdd() {
    this.dispatchEvent(new CustomEvent('permissions-add-cancel', { bubbles: true, composed: true }));
  }

  _requestAdd(path, level, value) {
    this.dispatchEvent(new CustomEvent('permissions-add', {
      detail: { path, level, value },
      bubbles: true,
      composed: true,
    }));
  }

  _requestRemove(path, level, who) {
    this.dispatchEvent(new CustomEvent('permissions-remove', {
      detail: { path, level, who },
      bubbles: true,
      composed: true,
    }));
  }

  _onAddKeydown(e, path, level) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = e.target.value.trim();
      if (!value) return;
      this._requestAdd(path, level, value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this._cancelAdd();
    }
  }

  _renderAddInput(path, level) {
    return html`
      <input
        type="text"
        class="cell-add-input nx-input"
        autofocus
        @keydown=${(e) => this._onAddKeydown(e, path, level)}
        @blur=${() => this._cancelAdd()}
      >`;
  }

  _renderCell(slot, level) {
    const direct = slot[level] || [];
    const inherited = slot[INHERITED_KEY[level]] || [];
    const total = direct.length + inherited.length;
    const isExpanded = this.expanded instanceof Set && this.expanded.has(slot.path);
    const visibleCount = isExpanded ? total : Math.min(VISIBLE_LIMIT, total);
    const directVisible = direct.slice(0, visibleCount);
    const inheritedVisible = inherited.slice(0, Math.max(0, visibleCount - directVisible.length));
    const more = total - visibleCount;
    const isAdding = this.adding?.path === slot.path && this.adding?.level === level;

    return html`
      <div class="permissions-cell">
        ${total === 0 ? html`<span class="cell-empty">No one</span>` : html`
          <nx-pills
            .items=${directVisible.map((who) => ({ id: who, label: who, removable: this.editable && !this.busy }))}
            @nx-pill-remove=${(e) => this._requestRemove(slot.path, level, e.detail.id)}
          ></nx-pills>
          ${inheritedVisible.length ? html`
            <span class="cell-inherited-label">From ${this.org}</span>
            <nx-pills
              .items=${inheritedVisible.map((who) => ({ id: who, label: who, removable: false }))}
            ></nx-pills>
          ` : nothing}
          ${more > 0 ? html`
            <button
              type="button"
              class="cell-more nx-action-btn-quiet nx-btn-sm"
              @click=${() => this._toggle(slot.path)}
            >+${more} more</button>
          ` : nothing}
        `}
        ${this.editable ? html`
          <button
            type="button"
            class="cell-add nx-action-btn-icon nx-btn-sm"
            aria-label="Add to ${slot.label} ${LEVEL_LABEL[level]}"
            ?disabled=${this.busy}
            @click=${() => this._openAdd(slot.path, level)}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20"><use href="${ADD_ICON_SRC}#icon"></use></svg>
          </button>
        ` : nothing}
        ${isAdding ? this._renderAddInput(slot.path, level) : nothing}
      </div>`;
  }

  _renderNone(slot) {
    return html`
      <div class="scope-none">
        <span class="scope-none-label">None</span>
        <nx-pills
          .items=${slot.none.map((who) => ({ id: who, label: who, removable: this.editable && !this.busy }))}
          @nx-pill-remove=${(e) => this._requestRemove(slot.path, 'none', e.detail.id)}
        ></nx-pills>
      </div>`;
  }

  _renderSlotRow(slot) {
    return html`
      <tr class="slot-row" data-path=${slot.path}>
        <td class="scope-cell">
          <span class="scope-label">${slot.label}</span>
          ${slot.none.length ? this._renderNone(slot) : nothing}
        </td>
        <td>${this._renderCell(slot, 'read')}</td>
        <td>${this._renderCell(slot, 'write')}</td>
      </tr>`;
  }

  get _configSlots() {
    return this.slots.filter((slot) => slot.kind === 'config');
  }

  get _contentSlots() {
    return this.slots.filter((slot) => slot.kind !== 'config');
  }

  render() {
    return html`
      <table class="permissions-table">
        <thead>
          <tr><th>Scope</th><th>Read</th><th>Write</th></tr>
        </thead>
        <tbody>
          <tr class="section-row"><td colspan="3">Config</td></tr>
          ${this._configSlots.map((slot) => this._renderSlotRow(slot))}
          <tr class="section-row"><td colspan="3">Content</td></tr>
          ${this._contentSlots.map((slot) => this._renderSlotRow(slot))}
        </tbody>
      </table>`;
  }
}

if (!customElements.get('da-permissions-table')) {
  customElements.define('da-permissions-table', DaPermissionsTable);
}

export default DaPermissionsTable;
