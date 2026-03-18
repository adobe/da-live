import { LitElement, html } from 'da-lit';
import getSheet from '../../../../shared/sheet.js';
import { aemAdmin } from '../../../../shared/utils.js';

const sheet = await getSheet(import.meta.url.replace('js', 'css'));

class DaUnpublish extends LitElement {
  static properties = {
    details: { attribute: false },
    _confirmText: { state: true },
    _statusText: { state: true },
    _results: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
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

    const { org, site, path } = this.details;
    const fullpath = `/${org}/${site}${path}`;

    const previewJson = await aemAdmin(fullpath, 'preview', 'DELETE');
    if (!previewJson) this._results.push('Couldn\'t remove preview.');

    this._statusText = 'Unpublishing';

    const liveJson = await aemAdmin(fullpath, 'live', 'DELETE');
    if (!liveJson) {
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

  renderResults() {
    return this._results.map((result) => html`<p>${result}</p>`);
  }

  renderInput() {
    return html`
      <p class="sl-heading-m">Are you sure you want to unpublish?</p>
      <p>Type <strong>YES</strong> to confirm.</p>
      <sl-input
        type="text"
        placeholder="YES"
        @input=${({ target }) => { this._confirmText = target.value; }}
        aria-label="Type yes to confirm unpublish"
        value=${this._confirmText}></sl-input>`;
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
