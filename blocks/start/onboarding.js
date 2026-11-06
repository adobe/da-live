import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../scripts/utils.js';
import { initIms } from '../shared/utils.js';
import { ONBOARDING_TILES } from './constants.js';
import { addSite, getGitHubSite } from './utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const [form, styles] = await Promise.all([
  loadStyle(`${getNx2()}/styles/form.css`),
  loadStyle(import.meta.url),
]);

class DaOnboarding extends LitElement {
  static properties = {
    _name: { state: true },
    _site: { state: true },
    _error: { state: true },
    _loading: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [form, styles];
    this._loadName();
  }

  async _loadName() {
    const profile = await initIms();
    if (this.isConnected) this._name = profile?.first_name || profile?.displayName?.split(' ')[0];
  }

  _onInput(e) {
    this._site = getGitHubSite(e.target.value.trim());
    this._error = undefined;
  }

  async _onSubmit(e) {
    e.preventDefault();
    if (!this._site || this._loading) return;
    this._loading = true;
    const { org, site } = this._site;
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
        <section class="panel" aria-labelledby="add-site-title">
          <div class="panel-heading">
            <h2 id="add-site-title">Already have an EDS project?</h2>
            <p>Enter its GitHub repository URL to add your site.</p>
          </div>
          <form class="nx-form-field ${this._error ? 'nx-field-error' : ''}" @submit=${this._onSubmit}>
            <div class="add-site">
              <input
                type="text"
                class="nx-input"
                aria-label="GitHub repository URL"
                placeholder="https://github.com/your-org/your-site"
                autocomplete="off"
                @input=${this._onInput} />
              <button class="nx-form-btn-primary" ?disabled=${!this._site || this._loading}>
                ${this._loading ? 'Adding site…' : 'Add site'}
              </button>
            </div>
            ${this._error ? html`<span class="nx-input-error-msg" role="alert">${this._error}</span>` : nothing}
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
