import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../scripts/utils.js';

const SITE_URL_ERROR = 'Enter an existing AEM site URL.';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const { parseSubdomain } = await import(`${getNx2()}/blocks/siteselector/site-utils.js`);
const [buttons, form, styles] = await Promise.all([
  loadStyle(`${getNx2()}/styles/buttons.css`),
  loadStyle(`${getNx2()}/styles/form.css`),
  loadStyle(import.meta.url),
]);

class DaAddSite extends LitElement {
  static properties = {
    _siteUrl: { state: true },
    _error: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [buttons, form, styles];
  }

  firstUpdated() {
    this.shadowRoot.querySelector('#site-url')?.focus();
  }

  _onInput({ target }) {
    this._siteUrl = target.value;
    this._error = undefined;
  }

  _onSubmit(e) {
    e.preventDefault();
    const hash = parseSubdomain(this._siteUrl.trim());
    if (!hash) {
      this._error = SITE_URL_ERROR;
      return;
    }
    this.openSite(`${window.location.origin}/${hash}`);
  }

  openSite(href) {
    window.location.href = href;
  }

  render() {
    return html`
      <form class="nx-form-field ${this._error ? 'nx-field-error' : ''}" @submit=${this._onSubmit}>
        <label for="site-url">Already have an existing site?</label>
        <p id="site-hint">Enter the URL to get started.</p>
        <div class="site-entry">
          <input class="nx-input" id="site-url" name="siteUrl" type="url" required
            autocomplete="url" placeholder="https://main--site--org.aem.page"
            aria-describedby=${this._error ? 'site-hint site-error' : 'site-hint'}
            aria-invalid=${this._error ? 'true' : nothing}
            @input=${this._onInput}>
          <button type="submit" class="nx-btn-accent"
            ?disabled=${!this._siteUrl?.trim()}>Open</button>
        </div>
        ${this._error ? html`<p id="site-error" class="nx-input-error-msg" role="alert">${this._error}</p>` : nothing}
      </form>
    `;
  }
}

customElements.define('da-add-site', DaAddSite);

export default function init(el) {
  el.replaceChildren(document.createElement('da-add-site'));
}
