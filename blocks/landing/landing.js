import { html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../scripts/utils.js';
import { createGreeting } from '../greeting/greeting.js';
import { getBrowseSettings } from '../browse/v2/shared/settings.js';
import { DaRecentFiles } from './recent-files/recent-files.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const { loadIms, handleSignIn } = await import(`${getNx2()}/utils/ims.js`);
const { getCreateSiteHref, getSiteOptions } = await import(`${getNx2()}/blocks/siteselector/site-utils.js`);
const background = await loadStyle(import.meta.url);
const styles = await loadStyle(new URL('./landing-content.css', import.meta.url).href);

export class DaLanding extends DaRecentFiles {
  static properties = {
    ...DaRecentFiles.properties,
    _scope: { state: true },
    _ready: { state: true },
    _authError: { state: true },
  };

  _onSiteSelect = ({ detail: { value } }) => {
    const [org, site] = value.split('/');
    return this.setScope({ org, site });
  };

  constructor() {
    super();
    this.heading = 'Content';
    this._view = getBrowseSettings().view === 'list' ? 'list' : 'card';
  }

  connectedCallback() {
    this._ready = false;
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [...this.shadowRoot.adoptedStyleSheets, styles];
    this.initialize();
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

    let ims;
    try {
      ims = await loadIms();
      if (!this.isConnected) return;
      if (!ims?.accessToken) {
        handleSignIn();
        return;
      }
    } catch {
      if (this.isConnected) this._authError = 'Could not sign in. Please reload the page to try again.';
      return;
    }

    this._ready = true;
    this.closest('main')?.querySelectorAll('div.greeting')
      .forEach((greeting) => createGreeting(greeting, { profile: ims }));
    this.refreshFavorites();
    document.addEventListener('site-select', this._onSiteSelect);
    if (value !== this._scope) this._onSiteSelect({ detail: { value } });
    else if (this._scope) this.loadSite();
  }

  redirectToStart() {
    window.location.replace(getCreateSiteHref());
  }

  reloadPage() {
    window.location.reload();
  }

  disconnectedCallback() {
    document.removeEventListener('site-select', this._onSiteSelect);
    super.disconnectedCallback();
  }

  get scope() {
    return this._scope;
  }

  async setScope(state) {
    const scope = state?.org && state?.site ? `${state.org}/${state.site}` : undefined;
    if (this._scope === scope && this._request && !this._request.signal.aborted) return;
    this._scope = scope;
    this.changeTab('recent');
    this._actionError = undefined;
    this.refreshFavorites();
    await this.loadSite();
  }

  loadSite() {
    if (!this._ready) return undefined;
    return super.loadSite();
  }

  render() {
    if (this._authError) {
      return html`<div class="landing"><div class="empty-state">
        <p role="alert">${this._authError}</p>
        <button class="nx-action-btn" @click=${this.reloadPage}>Reload page</button>
      </div></div>`;
    }
    if (!this._ready || !this._scope) return nothing;
    return super.render();
  }
}

customElements.define('da-landing', DaLanding);

export default function init(el) {
  if (!document.adoptedStyleSheets.includes(background)) {
    document.adoptedStyleSheets.push(background);
  }
  let landing = el.querySelector(':scope > .landing');
  if (!landing) {
    landing = document.createElement('div');
    landing.className = 'landing';
    el.replaceChildren(landing);
  }
  const content = document.createElement('da-landing');
  landing.replaceChildren(content);
  return content;
}
