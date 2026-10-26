import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import getSheet from '../../shared/sheet.js';
import { INHERITED_KEY, LEVEL_LABEL } from '../utils.js';

await import(`${getNx()}/blocks/shared/pills/pills.js`);

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);

const [form, buttons, style] = await Promise.all([
  getSheet(`${getNx2()}/styles/form.css`),
  getSheet(`${getNx2()}/styles/buttons.css`),
  loadStyle(import.meta.url),
]);

const CLOSE_ICON_SRC = '/img/icons/s2-icon-close-20-n.svg';

const SECTION_LABEL = {
  config: (name) => `Configuration Permissions for: ${name}`,
  content: (name) => `Content Permissions for: ${name}`,
  folders: () => 'Folder Permissions',
};

// The section heading already names config/content scopes; only these need a card title.
const TITLED_KINDS = ['folder', 'other'];

class DaPermissionsCards extends LitElement {
  static properties = {
    slots: { attribute: false },
    org: { type: String },
    scopeName: { type: String },
    canAddFolder: { type: Boolean },
    query: { type: String },
    editable: { type: Boolean },
    busy: { type: Boolean },
    adding: { attribute: false },
  };

  constructor() {
    super();
    this.slots = [];
    this.org = '';
    this.scopeName = '';
    this.canAddFolder = false;
    this.query = '';
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

  _requestAddFolder() {
    this.dispatchEvent(new CustomEvent('permissions-add-folder', { bubbles: true, composed: true }));
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
    // preventDefault on the X's mousedown keeps focus in the input, so the input's blur
    // doesn't cancel first and swallow the click.
    return html`
      <div class="row-add-field">
        <input
          type="text"
          class="row-add-input nx-input"
          placeholder="Email or IMS group ID, then press Enter"
          aria-label="Add to ${label} ${LEVEL_LABEL[level]}"
          @keydown=${(e) => this._onAddKeydown(e, path, level)}
          @blur=${() => this._cancelAdd()}
        >
        <button
          type="button"
          class="row-add-cancel nx-action-btn-icon"
          aria-label="Cancel adding to ${label} ${LEVEL_LABEL[level]}"
          @mousedown=${(e) => e.preventDefault()}
          @click=${() => this._cancelAdd()}
        >
          <svg aria-hidden="true" viewBox="0 0 20 20"><use href="${CLOSE_ICON_SRC}#icon"></use></svg>
        </button>
      </div>`;
  }

  _renderAddButton(slot, level, isAdding) {
    // Stays in place (disabled) while the field is open, so the members column keeps its width.
    return html`
      <button
        type="button"
        class="row-add nx-form-btn-secondary"
        aria-label="Add to ${slot.label} ${LEVEL_LABEL[level]}"
        ?disabled=${this.busy || isAdding}
        @click=${() => this._openAdd(slot.path, level)}
      >Add</button>`;
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
    const needle = (this.query || '').trim().toLowerCase();
    const isMatch = (who) => !!needle && who.toLowerCase().includes(needle);

    return html`
      <div class="level-row" data-level=${level}>
        <span class="level-label">${levelLabel.toUpperCase()}</span>
        <div class="row-members ${(direct.length && inherited.length) || isAdding ? 'stacked' : ''}">
          ${total === 0 ? html`<span class="row-empty">No one</span>` : nothing}
          ${direct.length ? html`
            <nx-pills
              size="m"
              class="direct-pills"
              .label=${directLabel}
              .items=${direct.map((who) => ({ id: who, label: who, removable, highlighted: isMatch(who) }))}
              @nx-pill-remove=${(e) => this._requestRemove(slot.path, level, e.detail.id)}
            ></nx-pills>
          ` : nothing}
          ${inherited.length ? html`
            <div class="inherited-group">
              <span class="from-label">Inherited from ${this.org}:</span>
              <nx-pills
                size="m"
                class="inherited-pills"
                .label=${inheritedLabel}
                .items=${inherited.map((who) => ({ id: who, label: who, removable: false, highlighted: isMatch(who) }))}
              ></nx-pills>
            </div>
          ` : nothing}
          ${canAdd && isAdding ? this._renderAddInput(slot.path, level, slot.label) : nothing}
        </div>
        ${canAdd && this.editable ? this._renderAddButton(slot, level, isAdding) : nothing}
      </div>`;
  }

  _renderCard(slot) {
    const hasNone = (slot.none?.length || 0) > 0 || (slot.inheritedNone?.length || 0) > 0;
    return html`
      <article class="scope-card" data-path=${slot.path} aria-label=${slot.label}>
        ${TITLED_KINDS.includes(slot.kind) ? html`
          <div class="card-header">
            <h4 class="card-title">${slot.label}</h4>
          </div>
        ` : nothing}
        <div class="card-body">
          ${this._renderLevelRow(slot, 'read')}
          ${this._renderLevelRow(slot, 'write')}
          ${hasNone ? this._renderLevelRow(slot, 'none') : nothing}
        </div>
      </article>`;
  }

  _renderSection(kind, slots) {
    const withAddFolder = kind === 'folders' && this.canAddFolder;
    if (!slots.length && !withAddFolder) return nothing;
    const body = slots.length
      ? slots.map((slot) => this._renderCard(slot))
      : html`<p class="row-empty section-empty">No folder permissions yet.</p>`;
    return html`
      <section class="scope-section" data-section=${kind}>
        <div class="scope-section-header">
          <h3>${SECTION_LABEL[kind](this.scopeName)}</h3>
          ${withAddFolder ? html`
            <button
              type="button"
              class="add-folder nx-form-btn-secondary"
              ?disabled=${this.busy}
              @click=${() => this._requestAddFolder()}
            >Add folder</button>
          ` : nothing}
        </div>
        ${body}
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
