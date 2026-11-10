import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../scripts/utils.js';
import { initIms } from '../shared/utils.js';
import { ONBOARDING_TILES } from './constants.js';
import { addSite, getRequestedSite } from '../start/utils.js';
import { getSiteFromUrl } from './utils.js';

const SITE_URL_ERROR = 'Enter a GitHub repository URL or an existing AEM site URL.';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const [buttons, form, styles, landingStyles] = await Promise.all([
  loadStyle(`${getNx2()}/styles/buttons.css`),
  loadStyle(`${getNx2()}/styles/form.css`),
  loadStyle(import.meta.url),
  loadStyle(new URL('../landing/landing.css', import.meta.url).href),
]);

class DaOnboarding extends LitElement {
  static properties = {
    _name: { state: true },
    _siteUrl: { state: true },
    _error: { state: true },
    _loading: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [buttons, form, styles];
    const requested = getRequestedSite(window.location.search);
    this._siteUrl = requested ? `https://github.com/${requested.org}/${requested.site}` : '';
    this._loadName();
  }

  async firstUpdated() {
    this.shadowRoot.querySelector('#site-url')?.focus();
    if (!this._siteUrl) return;
    await initIms();
    this._addSite();
  }

  async _loadName() {
    const profile = await initIms();
    if (this.isConnected) this._name = profile?.first_name || profile?.displayName?.split(' ')[0];
  }

  _onInput({ target }) {
    this._siteUrl = target.value;
    this._error = undefined;
  }

  _onSubmit(e) {
    e.preventDefault();
    this._addSite();
  }

  async _addSite() {
    if (this._loading) return;
    const requested = getSiteFromUrl(this._siteUrl.trim());
    if (!requested) {
      this._error = SITE_URL_ERROR;
      return;
    }
    this._loading = true;
    const { org, site } = requested;
    const { error } = await addSite({ org, site });
    if (error) {
      this._error = error;
      this._loading = false;
      return;
    }
    window.location = `${window.location.origin}/#/${org}/${site}`;
  }

  _renderTile(tile) {
    const action = tile.href
      ? html`<a class="nx-form-btn-secondary tile-action" href=${tile.href} target="_blank" rel="noopener">${tile.action}</a>`
      : html`<button type="button" class="nx-form-btn-secondary tile-action" disabled>${tile.action}</button>`;
    return html`
      <li class="tile">
        <span class="tile-icon">
          ${tile.icon ? html`<img src=${tile.icon} alt="" width="32" height="32">` : nothing}
        </span>
        <h3>${tile.title}</h3>
        <p>${tile.description}</p>
        ${action}
      </li>`;
  }

  render() {
    return html`
      <div class="onboarding">
        <header>
          <h1>Welcome to Experience Workspace${this._name ? `, ${this._name}` : ''}</h1>
          <p>Add a site to get started.</p>
        </header>
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
                ?disabled=${!this._siteUrl.trim() || this._loading}>Open</button>
            </div>
            ${this._error ? html`<p id="site-error" class="nx-input-error-msg" role="alert">${this._error}</p>` : nothing}
          </form>
        </section>
        <section class="panel" aria-labelledby="create-site-title">
          <div class="panel-heading">
            <h2 id="create-site-title">Need to create a site?</h2>
            <p>Choose a starting point to create your AEM site</p>
          </div>
          <ul class="tiles">
            ${ONBOARDING_TILES.map((tile) => this._renderTile(tile))}
          </ul>
        </section>
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
