import { LitElement, html, nothing } from 'da-lit';
import getSheet from '../../../../shared/sheet.js';
import { deleteFromTarget, fetchTargetConfig, getOfferDetails, savePreview, sendToTarget } from './utils.js';
import { I18nController, t } from '../../../../shared/i18n.js';

const sheet = await getSheet(import.meta.url.replace('js', 'css'));

class DaTarget extends LitElement {
  static properties = {
    details: { attribute: false },
    _config: { state: true },
    _offerId: { state: true },
    _name: { state: true },
    _statusText: { state: true },
  };

  // eslint-disable-next-line no-unused-private-class-members
  #i18n = new I18nController(this);

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.loadTargetConfig();
  }

  async loadTargetConfig() {
    const { org, site } = this.details;
    this._statusText = t('edit.target.fetching');
    const config = await fetchTargetConfig(org, site);
    if (!config) {
      this._statusText = t('edit.target.auth.failed');
      return;
    }

    const { id, name } = await getOfferDetails(org, site);
    if (id) this._offerId = id;
    if (name) this._name = name;

    this._statusText = undefined;
  }

  async handleSend() {
    const { org, site, path } = this.details;
    this._statusText = t('edit.target.previewing');
    const prevResult = await savePreview(org, site, path);
    if (prevResult.error) {
      this._statusText = prevResult.error;
      return;
    }

    const { url: aemPath } = prevResult.preview;
    this._statusText = t('edit.target.sending');
    const { displayName } = await window.adobeIMS.getProfile();

    const result = await sendToTarget(org, site, this._name, aemPath, displayName, this._offerId);
    if (result.error) {
      this._statusText = result.error;
      return;
    }
    this._statusText = result.success;
    this._offerId = result.offerId;
    setTimeout(() => {
      this.handleClose();
    }, 3000);
  }

  handleClose() {
    // This will bubble to the sl-dialog and it will close automatically
    const opts = { bubbles: true, composed: true };
    const event = new CustomEvent('close', opts);
    this.dispatchEvent(event);
  }

  async handleRemove() {
    const { org, site } = this.details;
    this._statusText = t('edit.target.deleting');

    const result = await deleteFromTarget(org, site, this._offerId);
    if (result.error) {
      this._statusText = result.error;
      return;
    }

    this._offerId = null;
    this._statusText = result.success;
    setTimeout(() => {
      this.handleClose();
    }, 3000);
  }

  get _buttonText() {
    return this._offerId ? t('edit.target.updateOffer') : t('edit.target.createOffer');
  }

  get _placeholder() {
    return t('edit.target.offerNamePlaceholder', { year: new Date().getFullYear() });
  }

  get _disabled() {
    return this._statusText || !this._name;
  }

  render() {
    return html`
      <div class="content">
        <sl-input
          type="text"
          label="${t('edit.target.offerName')}"
          placeholder=${this._placeholder}
          @input=${({ target }) => { this._name = target.value; }}
          aria-label="${t('edit.target.offerName')}"
          value=${this._name}></sl-input>
      </div>
      <div class="footer">
        <p class="status-text">${this._statusText}</p>
        <div class="actions">
          ${this._offerId ? html`
            <button class="target-action-remove" aria-label="${t('edit.target.deleteOffer')}" ?disabled=${this._statusText} @click=${this.handleRemove}>
              <svg viewBox="0 0 20 20">
                <use href="/blocks/edit/img/S2_Icon_Delete_20_N.svg#S2_Icon_Delete"/>
              </svg>
            </button>
          ` : nothing}
          <sl-button @click=${this.handleSend} ?disabled=${this._disabled}>${this._buttonText}</sl-button>
        </div>
      </div>
      `;
  }
}

customElements.define('da-adobetarget', DaTarget);

export default function render(details) {
  const cmp = document.createElement('da-adobetarget');
  cmp.details = details;
  return cmp;
}
