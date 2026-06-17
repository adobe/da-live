import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

const nx = getNx();
await import(`${nx}/blocks/shared/dialog/dialog.js`);

const { loadStyle } = await import(`${nx}/utils/utils.js`);
const styles = await loadStyle(import.meta.url);

class DaLinkDialog extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    href: { type: String },
    text: { type: String },
    _hrefError: { type: String, state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  willUpdate(changed) {
    if (changed.has('open') && this.open) this._hrefError = '';
  }

  _onSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const href = form.elements['link-href'].value.trim();
    if (!href) return;
    if (/^(javascript|data|vbscript):/i.test(href)) {
      this._hrefError = 'Invalid URL protocol';
      return;
    }
    const text = form.elements['link-text'].value;
    this.dispatchEvent(new CustomEvent('da-link-submit', {
      detail: { href, text },
      bubbles: true,
      composed: true,
    }));
  }

  _onCancel() {
    this.shadowRoot.querySelector('nx-dialog').close();
  }

  _onClose() {
    this.dispatchEvent(new CustomEvent('da-link-cancel', {
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    if (!this.open) return nothing;
    return html`
      <nx-dialog title="Edit link" @close=${this._onClose}>
        <form id="link-form" class="link-form" @submit=${this._onSubmit}>
          <label class="link-form-field">
            <span>URL</span>
            <input name="link-href" type="text" autofocus placeholder="https://…"
                   required autocomplete="off" .value=${this.href ?? ''}
                   @input=${() => { this._hrefError = ''; }} />
            ${this._hrefError ? html`<span class="link-form-error">${this._hrefError}</span>` : nothing}
          </label>
          <label class="link-form-field">
            <span>Display text</span>
            <input name="link-text" type="text" placeholder="Link text"
                   autocomplete="off" .value=${this.text ?? ''} />
          </label>
        </form>
        <button slot="actions" class="link-form-cancel"
          @click=${this._onCancel}>Cancel</button>
        <button slot="actions" class="link-form-save" form="link-form"
          @click=${() => this.shadowRoot.querySelector('.link-form').requestSubmit()}>Save</button>
      </nx-dialog>
    `;
  }
}

customElements.define('da-link-dialog', DaLinkDialog);
export default DaLinkDialog;
