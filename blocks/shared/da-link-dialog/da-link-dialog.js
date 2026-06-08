import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const styles = await loadStyle(import.meta.url);

class DaLinkDialog extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    href: { type: String },
    text: { type: String },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  updated(changed) {
    if (changed.has('open') && this.open) {
      this.updateComplete.then(() => {
        this.shadowRoot?.querySelector('input[name="link-href"]')?.focus();
      });
    }
  }

  _onSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const href = form.elements['link-href'].value.trim();
    if (!href) return;
    const text = form.elements['link-text'].value;
    this.dispatchEvent(new CustomEvent('da-link-submit', {
      detail: { href, text },
      bubbles: true,
      composed: true,
    }));
  }

  _onCancel() {
    this.dispatchEvent(new CustomEvent('da-link-cancel', {
      bubbles: true,
      composed: true,
    }));
  }

  _onBackdropClick(e) {
    if (e.target === e.currentTarget) this._onCancel();
  }

  _onBackdropKeydown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this._onCancel();
    }
  }

  render() {
    if (!this.open) return nothing;
    return html`
      <div class="link-dialog"
        @click=${this._onBackdropClick}
        @keydown=${this._onBackdropKeydown}>
        <form class="link-form" @submit=${this._onSubmit}>
          <label class="link-form-field">
            <span>URL</span>
            <input name="link-href" type="text" placeholder="https://…"
                   required autocomplete="off" .value=${this.href ?? ''} />
          </label>
          <label class="link-form-field">
            <span>Display text</span>
            <input name="link-text" type="text" placeholder="Link text"
                   autocomplete="off" .value=${this.text ?? ''} />
          </label>
          <div class="link-form-actions">
            <button type="button" class="link-form-cancel"
              @click=${this._onCancel}>Cancel</button>
            <button type="submit" class="link-form-save">Save</button>
          </div>
        </form>
      </div>
    `;
  }
}

customElements.define('da-link-dialog', DaLinkDialog);
export default DaLinkDialog;
