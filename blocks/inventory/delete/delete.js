import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { deleteSourcePath } from '../browse-api.js';
const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
await import(`${getNx()}/blocks/shared/dialog/dialog.js`);
const styles = await loadStyle(import.meta.url);

class NxInventoryDeleteDialog extends LitElement {
  static properties = {
    selectedRows: { type: Array },
    _isPending: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  _emitComplete(detail = {}) {
    this.dispatchEvent(new CustomEvent('nx-browse-action-complete', {
      detail,
      bubbles: true,
      composed: true,
    }));
  }

  _handleCancel = () => { this._emitComplete(); };

  _handleClose = () => { this._emitComplete(); };

  _handleConfirm = async () => {
    const { selectedRows } = this;
    if (!selectedRows?.length) { this._emitComplete(); return; }
    this._isPending = true;
    try {
      for (const item of selectedRows) {
        const result = await deleteSourcePath(item.path);
        if (!result.ok) {
          this._emitComplete({ message: result.error || 'Delete failed' });
          return;
        }
      }
      this._emitComplete({ success: true });
    } catch {
      this._emitComplete({ message: 'An unexpected error occurred.' });
    } finally {
      this._isPending = false;
    }
  };

  render() {
    const selectedRows = this.selectedRows ?? [];
    if (!selectedRows.length) return nothing;

    const count = selectedRows.length;
    const itemWord = count === 1 ? 'item' : 'items';
    const lines = selectedRows.map((item) => item.path).slice(0, 5);
    const more = count > 5 ? count - 5 : 0;

    return html`
      <nx-dialog
        .title=${`Delete ${count} ${itemWord}`}
        .busy=${this._isPending}
        .persistent=${this._isPending}
        @close=${this._handleClose}
      >
        <div>
          <ul class="list">
            ${lines.map((path) => html`<li>${path}</li>`)}
          </ul>
          ${more > 0 ? html`<p class="hint">…and ${more} more</p>` : nothing}
        </div>
        <button
          slot="actions"
          type="button"
          class="btn btn-secondary"
          ?disabled=${this._isPending}
          @click=${this._handleCancel}
        >Cancel</button>
        <button
          slot="actions"
          type="button"
          class="btn btn-danger"
          ?disabled=${this._isPending}
          aria-busy=${this._isPending ? 'true' : 'false'}
          @click=${this._handleConfirm}
        >
          ${this._isPending ? html`<span class="spinner" aria-hidden="true"></span>` : nothing}
          <span>Delete</span>
        </button>
      </nx-dialog>
    `;
  }
}

if (!customElements.get('nx-inventory-delete-dialog')) {
  customElements.define('nx-inventory-delete-dialog', NxInventoryDeleteDialog);
}
