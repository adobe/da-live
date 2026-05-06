import { LitElement, html, nothing } from 'da-lit';
import getSheet from '../sheet.js';

const sheet = await getSheet('/blocks/shared/da-toast/da-toast.css');

export default class DaToast extends LitElement {
  static properties = { toast: { attribute: false } };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  updated(changedProps) {
    if (!changedProps.has('toast')) return;
    clearTimeout(this._timerId);
    if (!this.toast) return;
    const duration = this.toast.duration ?? 3000;
    if (!duration) return;
    this._timerId = setTimeout(() => {
      this.toast = null;
      this.dispatchEvent(new Event('close'));
    }, duration);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this._timerId);
  }

  render() {
    if (!this.toast) return nothing;
    const { text, description, type = 'info' } = this.toast;
    return html`
      <div class="da-toast-overlay">
        <div class="da-toast da-toast-type-${type}">
          <p class="da-toast-title">${text}</p>
          ${description ? html`<p class="da-toast-description">${description}</p>` : nothing}
        </div>
      </div>`;
  }
}

customElements.define('da-toast', DaToast);
