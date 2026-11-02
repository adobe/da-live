import { LitElement, html } from 'da-lit';
import { getNx2 } from '../../../scripts/utils.js';
import { icon } from '../icons.js';

const { loadStyle } = await import(`${getNx2()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);

const EL_NAME = 'nx-reorder';

class Reorder extends LitElement {
  static properties = {
    targetIndex: { attribute: false },
    totalItems: { attribute: false },
  };

  constructor() {
    super();
    this.targetIndex = 0;
    this.totalItems = 0;
    this._onKeydown = this._handleKeydown.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    document.addEventListener('keydown', this._onKeydown);
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this._onKeydown);
    super.disconnectedCallback();
  }

  _dispatch(name) {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true }));
  }

  _isTypingTarget(target) {
    if (!(target instanceof Element)) return false;
    const tag = target.tagName?.toLowerCase?.();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    return target.closest?.('[contenteditable="true"]') != null;
  }

  _handleKeydown(e) {
    if (e.defaultPrevented) return;
    if (this._isTypingTarget(e.target)) return;

    const lastIndex = Math.max((this.totalItems ?? 0) - 1, 0);

    if (e.key === 'Escape') {
      this._dispatch('reorder-cancel');
      e.preventDefault();
      return;
    }

    if (e.key === 'Enter') {
      this._dispatch('reorder-confirm');
      e.preventDefault();
      return;
    }

    if (e.key === 'ArrowUp' && this.targetIndex > 0) {
      this._dispatch(e.shiftKey ? 'reorder-move-to-first' : 'reorder-move-up');
      e.preventDefault();
      return;
    }

    if (e.key === 'ArrowDown' && this.targetIndex < lastIndex) {
      this._dispatch(e.shiftKey ? 'reorder-move-to-last' : 'reorder-move-down');
      e.preventDefault();
    }
  }

  render() {
    const totalItems = this.totalItems ?? 0;
    const lastIndex = Math.max(totalItems - 1, 0);
    const canMoveUp = this.targetIndex > 0;
    const canMoveDown = this.targetIndex < lastIndex;

    return html`
      <div class="reorder-dialog" role="toolbar" aria-label="Reorder item">
        <div class="reorder-dialog-buttons">
          <button
            type="button"
            class="reorder-btn"
            ?disabled=${!canMoveUp}
            title="Move to first (Shift+Up)"
            aria-label="Move to first (Shift+Up)"
            @click=${() => this._dispatch('reorder-move-to-first')}
          >
            ${icon('doubleLeft')}
          </button>
          <button
            type="button"
            class="reorder-btn"
            ?disabled=${!canMoveUp}
            title="Move up one (Up)"
            aria-label="Move up one (Up)"
            @click=${() => this._dispatch('reorder-move-up')}
          >
            ${icon('chevronUp')}
          </button>
          <button
            type="button"
            class="reorder-btn"
            ?disabled=${!canMoveDown}
            title="Move down one (Down)"
            aria-label="Move down one (Down)"
            @click=${() => this._dispatch('reorder-move-down')}
          >
            ${icon('chevronDown')}
          </button>
          <button
            type="button"
            class="reorder-btn"
            ?disabled=${!canMoveDown}
            title="Move to last (Shift+Down)"
            aria-label="Move to last (Shift+Down)"
            @click=${() => this._dispatch('reorder-move-to-last')}
          >
            ${icon('doubleRight')}
          </button>
          <span class="reorder-dialog-separator" aria-hidden="true"></span>
          <button
            type="button"
            class="reorder-btn reorder-confirm"
            title="Apply new order (Enter)"
            aria-label="Apply new order (Enter)"
            @click=${() => this._dispatch('reorder-confirm')}
          >
            ${icon('confirm')}
          </button>
          <button
            type="button"
            class="reorder-btn reorder-cancel"
            title="Cancel reorder (Esc)"
            aria-label="Cancel reorder (Esc)"
            @click=${() => this._dispatch('reorder-cancel')}
          >
            ${icon('cancel')}
          </button>
        </div>
      </div>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, Reorder);
}
