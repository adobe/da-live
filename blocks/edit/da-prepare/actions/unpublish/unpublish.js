import { LitElement, html, nothing } from 'da-lit';
import getSheet from '../../../../shared/sheet.js';
import { getNx, getNx2, getNx2Api } from '../../../../../scripts/utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const [form, sheet] = await Promise.all([
  loadStyle(`${getNx2()}/styles/form.css`),
  getSheet(import.meta.url.replace('js', 'css')),
]);

class DaUnpublish extends LitElement {
  static properties = {
    details: { attribute: false },
    _confirmText: { state: true },
    _statusText: { state: true },
    _results: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [form, sheet];
  }

  handleClose() {
    // This will bubble to the sl-dialog and it will close automatically
    const opts = { bubbles: true, composed: true };
    const event = new CustomEvent('close', opts);
    this.dispatchEvent(event);
  }

  async handleUnpublish() {
    this._results = [];
    this._statusText = 'Removing preview';

    const fullpath = this.details.fullpath.replace(/\.html$/, '');

    const { aem } = await getNx2Api();

    const previewResp = await aem.unPreview(fullpath);
    if (!previewResp.ok) this._results.push('Couldn\'t remove preview.');

    this._statusText = 'Unpublishing';

    const liveResp = await aem.unPublish(fullpath);
    if (!liveResp.ok) {
      this._results.push('Couldn\'t unpublish from production.');
    }

    if (this._results.length) {
      this._statusText = 'There was an error';
      return;
    }
    // Otherwise, close the dialog
    this.handleClose();
  }

  get _disabled() {
    return this._confirmText !== 'YES' || this._statusText || this._results?.length;
  }

  get _confirmError() {
    return this._confirmText?.length >= 3 && this._confirmText !== 'YES'
      ? 'Type YES in uppercase.'
      : '';
  }

  renderResults() {
    return this._results.map((result) => html`<p>${result}</p>`);
  }

  renderInput() {
    return html`
      <p class="sl-heading-m">Are you sure you want to unpublish?</p>
      <p>Type <strong>YES</strong> to confirm.</p>
      <div class="nx-form-field ${this._confirmError ? 'nx-field-error' : ''}">
        <input
          class="nx-input"
          type="text"
          placeholder="YES"
          @input=${({ target }) => { this._confirmText = target.value; }}
          aria-label="Type YES to confirm unpublish"
          aria-invalid=${this._confirmError ? 'true' : 'false'}
          aria-describedby=${this._confirmError ? 'confirm-error' : nothing}
          value=${this._confirmText ?? ''}>
        <span id="confirm-error" class="nx-input-error-msg" role="alert">${this._confirmError}</span>
      </div>`;
  }

  render() {
    return html`
      <div class="confirmation">
        ${this._results?.length ? this.renderResults() : this.renderInput()}
      </div>
      <div class="footer">
        <p class="status-text">${this._statusText}</p> 
        <sl-button class="negative" @click=${this.handleUnpublish} ?disabled=${this._disabled}>Unpublish</sl-button>
      </div>`;
  }
}

customElements.define('da-unpublish', DaUnpublish);

export default function render(details) {
  const cmp = document.createElement('da-unpublish');
  cmp.details = details;
  return cmp;
}
