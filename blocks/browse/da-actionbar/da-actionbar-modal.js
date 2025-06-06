import { LitElement, html, ref, createRef } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

// Styles
const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const STYLE = await getStyle(import.meta.url);

export default class DaActionBarModal extends LitElement {
  static properties = {
    items: { attribute: false },
    action: { type: String },
    show: { type: Boolean, reflect: true },
    failedItems: { attribute: false },
    _inProgress: { state: true },
    _isUnpublishChecked: { state: true },
    _confirmationText: { state: true },
  };

  constructor() {
    super();
    this.items = [];
    this.action = 'delete'; // Default action
    this.show = false;
    this.failedItems = null;
    this._inProgress = false;
    this._isUnpublishChecked = false;
    this._confirmationText = '';
  }

  confirmationInputRef = createRef();

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [STYLE];
  }

  get _dialog() {
    return this.shadowRoot.querySelector('sl-dialog');
  }

  get _deleteButton() {
    return this.shadowRoot.querySelector('.delete-button');
  }

  updated(changedProperties) {
    if (changedProperties.has('show')) {
      if (this.show) {
        if (!this.failedItems) {
          this._isUnpublishChecked = false;
          this._confirmationText = '';
          if (this.action === 'delete') {
          }
        }
        this._dialog?.showModal();
      }
    }
  }

  cancelModal() {
    this.show = false;
    this.failedItems = null;
    this._dialog?.close();
    this.dispatchEvent(new Event('modal-closed'));
  }

  handleCheckboxChange(e) {
    this._isUnpublishChecked = e.target.checked;
    if (this._isUnpublishChecked) {
      setTimeout(() => {
        this._deleteButton.setAttribute('disabled', '');
        this.confirmationInputRef.value.focus();
      }, 100);
    } else {
      this._deleteButton.removeAttribute('disabled');
    }
  }

  handleInputChange(e) {
    this._confirmationText = e.target.value;
    if (this._confirmationText.toUpperCase() === 'YES') {
      this._deleteButton.removeAttribute('disabled');
    } else {
      this._deleteButton.setAttribute('disabled', '');
    }
  }

  handlePrimaryAction() {
    const detail = {
      action: this.action,
      unpublish: this._isUnpublishChecked,
      items: this.items,
    };

    this._inProgress = true;
    this.requestUpdate();
    this.dispatchEvent(new CustomEvent('delete-items', { detail, bubbles: true, composed: true }));
  }

  renderFailedItems() {
    const buttonType = 'primary outline';
    return html`
      <sl-dialog
        class="da-actionbar-modal-note"
        label="Note"
        ?open=${this.show && this.failedItems}
      >
      <div class="da-actionbar-modal">
          <div class="da-actionbar-modal-header">
            <h3>${this.getTitle()}</h3>
            <div class="da-actionbar-modal-header-close-button" @click=${this.cancelModal}>
              <img src="/blocks/edit/img/Smock_Close_18_N.svg" />
            </div>
          </div>
          <div class="da-actionbar-modal-content">
            <p>The following could not be unpublished.</p>
            <ul class="failed-items-list">
              ${this.failedItems.map(
                (item) => html`
                  <li>
                    ${item.name}
                    <span>Access denied.</span>
                  </li>
                `
              )}
            </ul>
          </div>
          <div class="da-actionbar-modal-footer">
            <sl-button slot="footer" @click=${this.handlePrimaryAction} class="delete-button ${buttonType}" disabled>Close</sl-button>
          </div>
        </div>
      </sl-dialog>
    `;
  }

  getTitle() {
    const itemCount = this.items.length;
    const itemStr = itemCount > 1 ? 'items' : 'item';
    const deleteStr = `Delete${this._isUnpublishChecked ? ' and Unpublish' : ''}`;
    if (itemCount === 1) {
      return `${deleteStr} ${this.items[0].name?.split('.')[0]}`;
    }
    return `${deleteStr} ${itemCount} ${itemStr}`;
  }

  getCheckbox() {
    if (this.isInTrashDir() || this.items.some((item) => !item.ext)) return '';
    const checkboxText = `Unpublish page${this.items.length > 1 ? 's' : ''}`;
    return html`<div class="da-actionbar-modal-checkbox">
      <input
        type="checkbox"
        id="ab-checkbox"
        ?checked=${this._isUnpublishChecked}
        @change=${this.handleCheckboxChange}/>
      <label for="ab-checkbox">${checkboxText}</label>
    </div>`;
  }

  isInTrashDir() {
    return this.items[0]?.path.includes('/.trash/');
  }

  renderTrashWarning() {
    if (this.isInTrashDir()) {
      return html`<div class="da-actionbar-modal-trash-warning">
        <img src="/blocks/edit/img/Smock_Alert_18_N.svg" />
        <p>Warning: Trash items will be permanently deleted.</p>
      </div>`;
    }
    return '';
  }

  renderConfirmationSection() {
    return html`
      <div class="da-actionbar-modal-confirmation">
        <p>Are you sure you want to unpublish?</p>
        <p>Type <strong>YES</strong> to confirm.</p>
        <sl-input type="text" ${ref(this.confirmationInputRef)} placeholder="YES" @input=${this.handleInputChange}></sl-input>
      </div>
    `;
  }

  renderInProgress() {
    return html`
      <div class="da-actionbar-modal-in-progress">
        <img src="/blocks/edit/img/Smock_Refresh_18_N.svg" />
        <p>Deleting...</p>
      </div>
    `;
  }

  renderDeleteModal() {
    const buttonType = 'negative';

    const buttonText = this._isUnpublishChecked ? 'Delete and Unpublish' : 'Delete';

    return html`
      <sl-dialog
        @close=${this.cancelModal}
        ?open=${this.show && !this.failedItems}>
        <div class="da-actionbar-modal">
          <div class="da-actionbar-modal-header">
            <h3>${this.getTitle()}</h3>
            <div class="da-actionbar-modal-close" @click=${this.cancelModal}>
              <img src="/blocks/edit/img/Smock_Close_18_N.svg" />
            </div>
          </div>
          <div class="da-actionbar-modal-content">
            ${this._inProgress ? this.renderInProgress() : ''}
            ${this.renderTrashWarning()}
            ${this.getCheckbox()}
            ${this._isUnpublishChecked ? this.renderConfirmationSection() : ''}
          </div>
          <div class="da-actionbar-modal-footer">
            <sl-button slot="footer" @click=${this.handlePrimaryAction} class="delete-button ${buttonType}">${buttonText}</sl-button>
          </div>
        </div>
      </sl-dialog>
    `;
  }

  render() {
    if (this.show && this.failedItems) {
      return this.renderFailedItems();
    }
    if (this.show && this.action === 'delete') {
      return this.renderDeleteModal();
    }
    return html``;
  }
}

customElements.define('da-actionbar-modal', DaActionBarModal);
