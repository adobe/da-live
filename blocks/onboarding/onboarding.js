import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../scripts/utils.js';
import { loadCards } from './content.js';

const SITE_URL_ERROR = 'Enter an existing AEM site URL.';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const { parseSubdomain } = await import(`${getNx2()}/blocks/siteselector/site-utils.js`);
const [buttons, form, styles, landingStyles] = await Promise.all([
  loadStyle(`${getNx2()}/styles/buttons.css`),
  loadStyle(`${getNx2()}/styles/form.css`),
  loadStyle(import.meta.url),
  loadStyle(new URL('../landing/landing.css', import.meta.url).href),
]);

class DaOnboarding extends LitElement {
  static properties = {
    _siteUrl: { state: true },
    _error: { state: true },
    _cards: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [buttons, form, styles];
    const params = new URLSearchParams(window.location.search);
    const [org, site] = [params.get('org'), params.get('site')];
    this._siteUrl = org && site ? `https://main--${site}--${org}.aem.page` : '';
  }

  firstUpdated() {
    this.shadowRoot.querySelector('#site-url')?.focus();
    this._loadCards();
    if (this._siteUrl) this._submit();
  }

  async _loadCards() {
    const [{ cards }] = await Promise.all([
      loadCards(),
      import(`${getNx2()}/blocks/shared/action-card/action-card.js`),
    ]);
    if (cards?.length) this._cards = cards;
  }

  _onInput({ target }) {
    this._siteUrl = target.value;
    this._error = undefined;
  }

  _onSubmit(e) {
    e.preventDefault();
    this._submit();
  }

  _submit() {
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

  _renderCards() {
    return html`
      <section class="panel" aria-labelledby="create-site-title">
        <div class="panel-heading">
          <h2 id="create-site-title">Need to create a site?</h2>
          <p>Choose a starting point to create your AEM site</p>
        </div>
        <div class="cards" role="list">
          ${this._cards.map((card) => html`
            <nx-action-card role="listitem"
              .heading=${card.heading}
              .description=${card.description}
              .tint=${card.tint}
              .action=${card.href}>
              ${card.icon ? html`<svg slot="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="${card.icon}#icon"></use></svg>` : nothing}
            </nx-action-card>`)}
        </div>
      </section>`;
  }

  render() {
    return html`
      <div class="onboarding">
        <section class="panel">
          <form class="nx-form-field ${this._error ? 'nx-field-error' : ''}" @submit=${this._onSubmit}>
            <label for="site-url">Already have an existing site?</label>
            <p id="site-hint">Enter the URL to get started.</p>
            <div class="site-entry">
              <input class="nx-input" id="site-url" name="siteUrl" type="url" required
                .value=${this._siteUrl}
                autocomplete="url" placeholder="https://main--site--org.aem.page"
                aria-describedby=${this._error ? 'site-hint site-error' : 'site-hint'}
                aria-invalid=${this._error ? 'true' : nothing}
                @input=${this._onInput}>
              <button type="submit" class="nx-btn-accent"
                ?disabled=${!this._siteUrl.trim()}>Open</button>
            </div>
            ${this._error ? html`<p id="site-error" class="nx-input-error-msg" role="alert">${this._error}</p>` : nothing}
          </form>
        </section>
        ${this._cards ? this._renderCards() : nothing}
      </div>
    `;
  }
}

customElements.define('da-onboarding', DaOnboarding);

export default function init(el) {
  const { adoptedStyleSheets } = document;
  if (!adoptedStyleSheets.includes(landingStyles)) adoptedStyleSheets.push(landingStyles);
  const onboarding = document.createElement('da-onboarding');
  onboarding.className = 'landing';
  el.replaceChildren(onboarding);
}
