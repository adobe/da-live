import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../scripts/utils.js';
import initGreeting from '../shared/da-greeting/da-greeting.js';
import initRecentFiles from './recent-files/recent-files.js';
import initTiles from './tiles/tile-group.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const { loadIms, handleSignIn } = await import(`${getNx2()}/utils/ims.js`);
const { getCreateSiteHref, getSiteOptions } = await import(`${getNx2()}/blocks/siteselector/site-utils.js`);
const background = await loadStyle(import.meta.url);
const styles = await Promise.all([
  loadStyle(`${getNx2()}/styles/buttons.css`),
  background,
]);

export class DaLanding extends LitElement {
  static properties = {
    blocks: { attribute: false },
    _ready: { state: true },
    _authError: { state: true },
    _error: { state: true },
    _loading: { state: true },
  };

  _onSiteSelect = ({ detail: { value } }) => {
    const [org, site] = value.split('/');
    return this.setScope({ org, site });
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = styles;
    this.initialized = this.initialize();
  }

  disconnectedCallback() {
    document.removeEventListener('site-select', this._onSiteSelect);
    this._contentRequest = undefined;
    super.disconnectedCallback();
  }

  async initialize() {
    this._ready = false;
    this._authError = undefined;
    let value;
    try {
      const recentSites = JSON.parse(localStorage.getItem('da-sites')) ?? [];
      value = getSiteOptions({ recentSites })[0]?.value;
    } catch {
      // Unavailable site history follows the new-user route.
    }
    if (!value) {
      this.redirectToStart();
      return;
    }
    try {
      const ims = await loadIms();
      if (!this.isConnected) return;
      if (!ims?.accessToken) {
        handleSignIn();
        return;
      }
      this.profile = ims;
    } catch {
      if (this.isConnected) this._authError = 'Could not sign in. Please reload the page to try again.';
      return;
    }
    const [org, site] = value.split('/');
    this.scope = { org, site };
    document.addEventListener('site-select', this._onSiteSelect);
    this._ready = true;
    await this.loadContent();
  }

  get path() {
    return this.scope ? `/${this.scope.org}/${this.scope.site}` : '';
  }

  async setScope(scope) {
    this.scope = scope;
    await Promise.all([...this.querySelectorAll('da-recent-files, da-landing-tiles')]
      .map((block) => block.setScope(scope)));
  }

  async loadContent() {
    if (!this._ready || !this.isConnected) return;
    const request = {};
    this._contentRequest = request;
    this._loading = true;
    this._error = undefined;
    try {
      if (!this.blocks?.length) throw new Error('No Landing content is configured.');
      const layout = document.createElement('div');
      layout.className = 'landing-content';
      const blocks = this.blocks.map((block) => {
        const clone = block.cloneNode(true);
        clone.hidden = false;
        return clone;
      });
      layout.append(...blocks);
      this.replaceChildren(layout);
      blocks.forEach((block) => {
        if (block.classList.contains('greeting')) {
          initGreeting(block, { profile: this.profile });
        } else if (block.classList.contains('recent-files')) {
          initRecentFiles(block, { scope: this.scope });
        } else if (block.classList.contains('landing')) {
          const tiles = initTiles(block, { contentBlock: block, scope: this.scope });
          block.replaceChildren(tiles);
        }
      });
    } catch (error) {
      if (this.isConnected && this._contentRequest === request) this._error = error.message;
    }
    if (this.isConnected && this._contentRequest === request) this._loading = false;
  }

  redirectToStart() {
    window.location.replace(getCreateSiteHref());
  }

  reloadPage() {
    window.location.reload();
  }

  render() {
    if (this._authError || this._error) {
      return html`<div class="landing-error">
        <p role="alert">${this._authError || this._error}</p>
        <button class="nx-action-btn" @click=${this._authError ? this.reloadPage : this.loadContent}>
          ${this._authError ? 'Reload page' : 'Try again'}
        </button>
      </div>`;
    }
    if (!this._ready) return nothing;
    return this._loading ? html`<p role="status">Loading...</p>` : html`<slot></slot>`;
  }
}

customElements.define('da-landing', DaLanding);

export async function loadLanding(el, { blocks } = {}) {
  if (!document.adoptedStyleSheets.includes(background)) {
    document.adoptedStyleSheets.push(background);
  }
  let surface = el.querySelector(':scope > .landing');
  if (!surface) {
    surface = document.createElement('div');
    surface.className = 'landing';
    el.replaceChildren(surface);
  }
  const landing = document.createElement('da-landing');
  landing.blocks = blocks;
  surface.replaceChildren(landing);
  await landing.initialized;
  return landing;
}
