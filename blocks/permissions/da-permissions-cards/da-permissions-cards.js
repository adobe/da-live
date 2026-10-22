import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import getSheet from '../../shared/sheet.js';
import { LEVEL_LABEL } from '../utils.js';

await import(`${getNx()}/blocks/shared/pills/pills.js`);

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);

const [form, buttons, style] = await Promise.all([
  getSheet(`${getNx2()}/styles/form.css`),
  getSheet(`${getNx2()}/styles/buttons.css`),
  loadStyle(import.meta.url),
]);

const INHERITED_KEY = { read: 'inheritedRead', write: 'inheritedWrite', none: 'inheritedNone' };

const SECTION_LABEL = { config: 'Config permissions', content: 'Content permissions', folders: 'Folders' };

/**
 * Presentational A1 cards: renders `Slot[]` as one column of scope cards,
 * one per scope, with a READ/WRITE/NONE row each. Owns no permission state
 * itself — every change is an outbound event for `<da-permissions>` to act on.
 */
class DaPermissionsCards extends LitElement {
  static properties = {
    slots: { attribute: false },
    org: { type: String },
    editable: { type: Boolean },
    busy: { type: Boolean },
    adding: { attribute: false },
  };

  constructor() {
    super();
    this.slots = [];
    this.org = '';
    this.editable = false;
    this.busy = false;
    this.adding = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [form, buttons, style];
  }

  updated(changed) {
    if (changed.has('adding') && this.adding) {
      this.shadowRoot.querySelector('.row-add-input')?.focus();
    }
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

  _renderAddInput(path, level, label) {
    return html`
      <input
        type="text"
        class="row-add-input nx-input"
        aria-label="Add to ${label} ${LEVEL_LABEL[level]}"
        @keydown=${(e) => this._onAddKeydown(e, path, level)}
        @blur=${() => this._cancelAdd()}
      >`;
  }

  _renderLevelRow(slot, level) {
    const direct = slot[level] || [];
    const inherited = slot[INHERITED_KEY[level]] || [];
    const total = direct.length + inherited.length;
    const isAdding = this.adding?.path === slot.path && this.adding?.level === level;
    const canAdd = level !== 'none';
    const removable = this.editable && !this.busy;
    const levelLabel = LEVEL_LABEL[level];
    const directLabel = `${slot.label} ${levelLabel}`;
    const inheritedLabel = `${directLabel} inherited from ${this.org}`;

    return html`
      <div class="level-row" data-level=${level}>
        <span class="level-label">${levelLabel.toUpperCase()}</span>
        ${total === 0 ? html`<span class="row-empty">No one</span>` : html`
          ${direct.length ? html`
            <nx-pills
              class="direct-pills"
              .label=${directLabel}
              .items=${direct.map((who) => ({ id: who, label: who, removable }))}
              @nx-pill-remove=${(e) => this._requestRemove(slot.path, level, e.detail.id)}
            ></nx-pills>
          ` : nothing}
          ${inherited.length ? html`
            <span class="from-label">From ${this.org}</span>
            <nx-pills
              class="inherited-pills"
              .label=${inheritedLabel}
              .items=${inherited.map((who) => ({ id: who, label: who, removable: false }))}
            ></nx-pills>
          ` : nothing}
        `}
        ${canAdd && this.editable && !isAdding ? html`
          <button
            type="button"
            class="row-add nx-action-btn-quiet nx-btn-sm"
            aria-label="Add to ${slot.label} ${LEVEL_LABEL[level]}"
            ?disabled=${this.busy}
            @click=${() => this._openAdd(slot.path, level)}
          >+ Add</button>
        ` : nothing}
        ${canAdd && isAdding ? this._renderAddInput(slot.path, level, slot.label) : nothing}
      </div>`;
  }

  _renderCard(slot) {
    const hasNone = (slot.none?.length || 0) > 0 || (slot.inheritedNone?.length || 0) > 0;
    return html`
      <article class="scope-card" data-path=${slot.path}>
        <div class="card-header">
          <h4 class="card-title">${slot.label}</h4>
        </div>
        <div class="card-body">
          ${this._renderLevelRow(slot, 'read')}
          ${this._renderLevelRow(slot, 'write')}
          ${hasNone ? this._renderLevelRow(slot, 'none') : nothing}
        </div>
      </article>`;
  }

  _renderSection(kind, slots) {
    if (!slots.length) return nothing;
    return html`
      <section class="scope-section" data-section=${kind}>
        <h3>${SECTION_LABEL[kind]}</h3>
        ${slots.map((slot) => this._renderCard(slot))}
      </section>`;
  }

  render() {
    const configSlots = this.slots.filter((slot) => slot.kind === 'config');
    const folderSlots = this.slots.filter((slot) => slot.kind === 'folder');
    const contentSlots = this.slots.filter((slot) => slot.kind !== 'config' && slot.kind !== 'folder');

    return html`
      ${this._renderSection('config', configSlots)}
      ${this._renderSection('content', contentSlots)}
      ${this._renderSection('folders', folderSlots)}
    `;
  }
}

if (!customElements.get('da-permissions-cards')) {
  customElements.define('da-permissions-cards', DaPermissionsCards);
}

export default DaPermissionsCards;
