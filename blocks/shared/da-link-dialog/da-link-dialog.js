import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

const nx = getNx();
await import(`${nx}/blocks/shared/dialog/dialog.js`);

const { loadStyle } = await import(`${nx}/utils/utils.js`);
const [base, styles] = await Promise.all([
  loadStyle(new URL('../styles/base.css', import.meta.url).href),
  loadStyle(import.meta.url),
]);

// nx-dialog closes on any click whose target resolves to the backdrop. Dragging to
// select text inside the dialog and releasing over the backdrop produces exactly that
// click, so guard by only allowing backdrop-clicks that also *started* on the backdrop.
function guardBackdropDragClose(nxDialogEl) {
  let downTarget;
  nxDialogEl.addEventListener('mousedown', (e) => { [downTarget] = e.composedPath(); }, true);
  nxDialogEl.addEventListener('click', (e) => {
    const inner = nxDialogEl.shadowRoot?.querySelector('dialog');
    const [clickTarget] = e.composedPath();
    if (clickTarget === inner && downTarget !== inner) e.stopPropagation();
  }, true);
}

class DaLinkDialog extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    href: { type: String },
    text: { type: String },
    title: { type: String, attribute: 'dialog-title' },
    saveLabel: { type: String },
    _urlError: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [base, styles];
  }

  updated(changed) {
    if (changed.has('open') && this.open) {
      guardBackdropDragClose(this.shadowRoot.querySelector('nx-dialog'));
    }
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
    this._urlError = '';
  }

  render() {
    if (!this.open) return nothing;
    return html`
      <nx-dialog title="${this.title ?? 'Edit link'}" @close=${this._onClose}>
        <form class="link-form">
          <label class="da-form-field ${this._urlError ? 'da-field-error' : ''}">
            <span>URL</span>
            <input class="da-input" name="link-href" type="text" autofocus placeholder="https://…"
                   autocomplete="off" .value=${this.href ?? ''}
                   @input=${() => { this._urlError = ''; }} />
            <span class="da-input-error-msg" role="alert">${this._urlError}</span>
          </label>
          <label class="da-form-field">
            <span>Display text</span>
            <input class="da-input" name="link-text" type="text" placeholder="Link text"
                   autocomplete="off" .value=${this.text ?? ''} />
          </label>
        </form>
        <button type="button" slot="actions" class="da-btn-secondary"
          @click=${this._onCancel}>Cancel</button>
        <button type="button" slot="actions" class="da-btn-primary"
          @click=${this._onSave}>${this.saveLabel ?? 'Save'}</button>
      </nx-dialog>
    `;
  }
}

customElements.define('da-link-dialog', DaLinkDialog);
export default DaLinkDialog;
