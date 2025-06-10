import { LitElement, html } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

// Styles
const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const STYLE = await getStyle(import.meta.url);

export default class DaActionBarModal extends LitElement {
  static properties = {
    items: { attribute: false },
    action: { type: String },
    failedItems: { attribute: false },
    totalDeleteCount: { type: Number },
    currentDeleteCount: { type: Number },
    unpublishErrors: { type: Array },
    _inProgress: { state: true },
    _isUnpublishChecked: { state: true },
    _confirmationText: { state: true },
  };

  constructor() {
    super();
    this.items = [];
    this.action = 'delete'; // Default action
    this.failedItems = null;
    this.unpublishErrors = [];
    this._inProgress = false;
    this._isUnpublishChecked = false;
    this._confirmationText = '';
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [STYLE];
    import('./da-progressbar.js');
  }

  showModal() {
    this._dialog?.showModal();
  }

  get _dialog() {
    return this.shadowRoot.querySelector('sl-dialog');
  }

  get _deleteButton() {
    return this.shadowRoot.querySelector('.delete-button');
  }

  // updated(changedProperties) {
  //   if (changedProperties.has('show')) {
  //     if (this.show) {
  //       if (!this.failedItems) {
  //         this._isUnpublishChecked = false;
  //         this._confirmationText = '';
  //       }
  //       this._dialog?.showModal();
  //     }
  //   }
  // }

  cancelModal() {
    this.failedItems = null;
    this._dialog?.close();
    this.dispatchEvent(new Event('modal-closed'));
  }

  handleCheckboxChange(e) {
    this._isUnpublishChecked = e.target.checked;
    if (this._isUnpublishChecked) {
      this._deleteButton.setAttribute('disabled', '');
      setTimeout(() => {
        this.shadowRoot.querySelector('sl-input')?.focus();
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
      unpublish: this._isUnpublishChecked,
      items: this.items,
    };

    this._inProgress = true;
    this.requestUpdate();
    this.dispatchEvent(new CustomEvent('delete-items', { detail, bubbles: true, composed: true }));
  }

  renderUnpublishErrors() {
    const getStatusText = (status) => {
      if (status === 401 || status === 403) return 'Access denied.';
      return `Unknown error: ${status}`;
    };
    return html`
          <div class="da-actionbar-modal-note">
            <p>The following could not be unpublished.</p>
            <ul class="failed-items-list">
              ${this.unpublishErrors.map(
                ([item, status]) => html`
                  <li>
                    ${item}
                    <span>${getStatusText(status)}</span>
                  </li>
                `,
              )}
            </ul>
          </div>
    `;
  }

  getTitle() {
    if (this.unpublishErrors.length) return 'Note';

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
        @input=${this.handleCheckboxChange}/>
      <label for="ab-checkbox">${checkboxText}</label>
    </div>`;
  }

  isInTrashDir() {
    return this.items[0]?.path.includes('/.trash/');
  }

  renderTrashWarning() {
    return html`<div class="da-actionbar-modal-trash-warning">
        <img src="/blocks/edit/img/Smock_Alert_18_N.svg" />
        <p>Warning: Trash items will be permanently deleted.</p>
      </div>`;
  }

  renderConfirmationSection() {
    return html`
      <div class="da-actionbar-modal-confirmation">
        <p>Are you sure you want to unpublish?</p>
        <p>Type <strong>YES</strong> to confirm.</p>
        <sl-input
          type="text"
          placeholder="YES"
          autofocus
          @input=${this.handleInputChange}
        ></sl-input>
      </div>
    `;
  }

  renderInProgress() {
    const text = this._isUnpublishChecked ? 'Deleting and Unpublishing ...' : 'Deleting ...';
    const progress = this.totalDeleteCount > 0
      ? (this.currentDeleteCount / this.totalDeleteCount) * 100
      : 0;

    return html`
      <div class="da-actionbar-modal-in-progress">
      <da-progress-bar .progress=${progress}></da-progress-bar>
      <p>${text}</p>
      </div>
    `;
  }

  getContent() {
    if (this.unpublishErrors.length) return this.renderUnpublishErrors();
    if (this.isInTrashDir()) return this.renderTrashWarning();
    if (this._inProgress) return this.renderInProgress();
    return html`
      ${this.getCheckbox()}
      ${this._isUnpublishChecked && !this._inProgress ? this.renderConfirmationSection() : ''}
    `;
  }

  renderDeleteModal() {
    const buttonType = 'negative';

    const buttonText = this._isUnpublishChecked ? 'Delete and Unpublish' : 'Delete';

    return html`
      <sl-dialog
        @close=${this.cancelModal}
        ?open=${!this.failedItems}>
        <div class="da-actionbar-modal">
          <div class="da-actionbar-modal-header">
            <h3>${this.getTitle()}</h3>
            <div class="da-actionbar-modal-close" @click=${this.cancelModal}>
              <img src="/blocks/edit/img/Smock_Close_18_N.svg" />
            </div>
          </div>
          <div class="da-actionbar-modal-content">
            ${this.getContent()}
          </div>
          ${
            this._inProgress
              ? ''
              : html`
          <div class="da-actionbar-modal-footer">
            <sl-button slot="footer" @click=${this.handlePrimaryAction} class="delete-button ${buttonType}">${buttonText}</sl-button>
          </div>
          `
          }
        </div>
      </sl-dialog>
    `;
  }

  render() {
    if (this.unpublishErrors.length) {
      return this.renderUnpublishErrors();
    }
    return this.renderDeleteModal();
  }
}

customElements.define('da-actionbar-modal', DaActionBarModal);
