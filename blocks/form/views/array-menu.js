import { LitElement, html, nothing } from 'da-lit';
import { getNx2 } from '../../../scripts/utils.js';
import { icon } from '../icons.js';

const { loadStyle } = await import(`${getNx2()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);

const EL_NAME = 'nx-array-menu';

class ArrayMenu extends LitElement {
  static properties = {
    pointer: { attribute: false },
    index: { attribute: false },
    pointers: { attribute: false },
    readonly: { attribute: false },
    itemCount: { attribute: false },
    minItems: { attribute: false },
    maxItems: { attribute: false },
    required: { attribute: false },
    active: { attribute: false },
    open: { attribute: false },
    _confirmRemove: { state: true },
  };

  constructor() {
    super();
    this.active = false;
    this.open = false;
    this.required = false;
    this._confirmRemove = false;
    this._confirmTimer = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  disconnectedCallback() {
    this._clearConfirmTimer();
    super.disconnectedCallback();
  }

  updated(changed) {
    if (changed.has('open') && !this.open) this._resetConfirmRemove();
  }

  _count() {
    return this.itemCount ?? (this.pointers?.length ?? 0);
  }

  _canInsert() {
    if (this.readonly) return false;
    return this.maxItems === undefined || this._count() < this.maxItems;
  }

  _canReorder() {
    if (this.readonly) return false;
    return this._count() > 1;
  }

  _canRemove() {
    if (this.readonly) return false;
    // No minItems floor — mirrors the SDK's canRemove: below-min is flagged by
    // validation, not blocked. Keep in sync with the SDK guard.
    return this._count() > 0;
  }

  _clearConfirmTimer() {
    if (!this._confirmTimer) return;
    clearTimeout(this._confirmTimer);
    this._confirmTimer = null;
  }

  _resetConfirmRemove() {
    this._clearConfirmTimer();
    this._confirmRemove = false;
  }

  _armConfirmRemove() {
    this._clearConfirmTimer();
    this._confirmRemove = true;
    this._confirmTimer = setTimeout(() => {
      this._confirmRemove = false;
      this._confirmTimer = null;
    }, 3000);
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, {
      detail,
      bubbles: true,
      composed: true,
    }));
  }

  _toggle(e) {
    e.stopPropagation();
    this._emit('array-menu-toggle', { pointer: this.pointer });
  }

  _insert(e) {
    e.stopPropagation();
    if (!this._canInsert()) return;
    this._emit('array-insert', { pointer: this.pointer });
  }

  _startReorder(e) {
    e.stopPropagation();
    if (!this._canReorder()) return;
    this._emit('array-reorder-start', { pointer: this.pointer, index: this.index ?? 0 });
  }

  _remove(e) {
    e.stopPropagation();
    if (!this._canRemove()) return;

    if (!this._confirmRemove) {
      this._armConfirmRemove();
      return;
    }

    this._resetConfirmRemove();
    this._emit('array-remove', { pointer: this.pointer });
  }

  render() {
    const canInsert = this._canInsert();
    const canReorder = this._canReorder();
    const canRemove = this._canRemove();
    const removeLabel = this._confirmRemove && canRemove ? 'Confirm removal' : 'Remove';

    return html`
      <div class="array-item-menu ${this.open ? 'open' : ''}">
        <button
          type="button"
          class="menu-trigger ${this.active ? 'active' : ''}"
          title="Item actions"
          aria-label="Item actions"
          aria-expanded=${this.open ? 'true' : 'false'}
          aria-haspopup="menu"
          @click=${this._toggle}
        >
          ${icon('settingsEdit')}
        </button>
        ${this.open ? html`
          <div class="menu-dropdown" role="menu">
            <button
              type="button"
              class="menu-item"
              role="menuitem"
              ?disabled=${!canInsert}
              @click=${this._insert}
            >
              ${icon('add', 'insert-icon')}
              Insert before
            </button>
            <button
              type="button"
              class="menu-item"
              role="menuitem"
              ?disabled=${!canReorder}
              @click=${this._startReorder}
            >
              ${icon('reorder')}
              Reorder
            </button>
            <button
              type="button"
              class="menu-item ${this._confirmRemove ? 'confirm' : ''}"
              role="menuitem"
              ?disabled=${!canRemove}
              @click=${this._remove}
            >
              ${this._confirmRemove ? icon('confirm') : icon('remove')}
              ${removeLabel}
            </button>
          </div>
        ` : nothing}
      </div>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, ArrayMenu);
}
