import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';

const nx = getNx();
await import(`${nx}/blocks/shared/dialog/dialog.js`);

const { loadStyle } = await import(`${nx}/utils/utils.js`);
const [formStyle, styles] = await Promise.all([
  loadStyle(`${getNx2()}/styles/form.css`),
  loadStyle(import.meta.url),
]);

class DaLinkDialog extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    href: { type: String },
    text: { type: String },
    title: { type: String, attribute: 'dialog-title' },
    showTitle: { type: Boolean, attribute: 'show-title' },
    anchorTitle: { type: String },
    saveLabel: { type: String },
    _urlError: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [formStyle, styles];
  }

  _onSave() {
    const form = this.shadowRoot.querySelector('.link-form');
    const href = form.elements['link-href'].value.trim();
    if (!href) {
      this._urlError = 'URL is required';
      return;
    }
    if (/^(javascript|data|vbscript):/i.test(href)) {
      this._urlError = 'Invalid URL protocol';
      return;
    }
    this._urlError = '';
    const text = form.elements['link-text'].value;
    const detail = { href, text };
    if (this.showTitle) {
      detail.title = form.elements['link-title'].value.trim();
    }
    this.dispatchEvent(new CustomEvent('da-link-submit', {
      detail,
      bubbles: true,
      composed: true,
    }));
  }

  _onCancel() {
    this.shadowRoot.querySelector('nx-dialog').close();
  }

  _onClose() {
    this._urlError = '';
  }

  render() {
    if (!this.open) return nothing;
    return html`
      <nx-dialog title="${this.title ?? 'Edit link'}" @close=${this._onClose}>
        <form class="link-form">
          <label class="nx-form-field ${this._urlError ? 'nx-field-error' : ''}">
            <span>URL</span>
            <input class="nx-input" name="link-href" type="text" autofocus placeholder="https://…"
                   autocomplete="off" .value=${this.href ?? ''}
                   @input=${() => { this._urlError = ''; }} />
            <span class="nx-input-error-msg" role="alert">${this._urlError}</span>
          </label>
          <label class="nx-form-field">
            <span>Display text</span>
            <input class="nx-input" name="link-text" type="text" placeholder="Link text"
                   autocomplete="off" .value=${this.text ?? ''} />
          </label>
          ${this.showTitle ? html`
            <label class="nx-form-field">
              <span>Title</span>
              <input class="nx-input" name="link-title" type="text" placeholder="Link title"
                     autocomplete="off" .value=${this.anchorTitle ?? ''} />
            </label>` : nothing}
        </form>
        <button type="button" slot="actions" class="nx-form-btn-secondary"
          @click=${this._onCancel}>Cancel</button>
        <button type="button" slot="actions" class="nx-form-btn-primary"
          @click=${this._onSave}>${this.saveLabel ?? 'Save'}</button>
      </nx-dialog>
    `;
  }
}

customElements.define('da-link-dialog', DaLinkDialog);
export default DaLinkDialog;
