import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../scripts/utils.js';
import { loadLandingContent } from './landing-content.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const { loadBlock } = await import(`${getNx2()}/scripts/nx.js`);
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
    if (!this._ready) return;
    const request = {};
    this._contentRequest = request;
    this._loading = true;
    this._error = undefined;
    try {
      const result = this.blocks?.length ? { blocks: this.blocks } : await loadLandingContent();
      if (!this.isConnected || this._contentRequest !== request) return;
      if (result.error) throw new Error(result.error);
      this.contentBase = result.baseHref;
      const layout = document.createElement('div');
      layout.className = 'landing-content';
      const blocks = result.blocks.map((block) => block.cloneNode(true));
      layout.append(...blocks);
      this.replaceChildren(layout);
      await Promise.all(blocks.map((block) => loadBlock(block)));
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

export default async function init(el) {
  const landing = el.closest('da-landing');
  if (!landing?.scope) {
    el.hidden = true;
    return undefined;
  }
  const { default: loadTiles } = await import('./tile-group.js');
  if (!el.isConnected) return undefined;
  const contentBlock = el.cloneNode(true);
  el.replaceChildren();
  return loadTiles(el, { contentBlock, scope: landing.scope, baseHref: landing.contentBase });
}
