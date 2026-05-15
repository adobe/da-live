import { LitElement, html } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { getAuthToken } from '../utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const STYLE = await loadStyle(import.meta.url);

let mountedInstance = null;

export class DaAuthBanner extends LitElement {
  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [STYLE];
    this._onStorage = this._onStorage.bind(this);
    window.addEventListener('storage', this._onStorage);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('storage', this._onStorage);
    if (mountedInstance === this) mountedInstance = null;
  }

  async _onStorage(event) {
    if (event.key !== 'nx-ims' || !event.newValue || event.oldValue) return;
    // Another tab signed in. Pull the new token and dismiss.
    try { await window.adobeIMS?.refreshToken?.(); } catch { /* ignore */ }
    if (await getAuthToken()) this._recover();
  }

  async _signIn() {
    const { loadIms, handleSignIn } = await import(`${getNx()}/utils/ims.js`);
    await loadIms();
    handleSignIn();
  }

  _recover() {
    window.dispatchEvent(new CustomEvent('da-auth-recovered'));
    this._dismiss();
  }

  _dismiss() {
    if (mountedInstance === this) mountedInstance = null;
    this.remove();
  }

  render() {
    return html`
      <div class="da-auth-banner" role="alert">
        <span class="da-auth-banner-msg">Your session has expired.</span>
        <button class="da-auth-banner-action" @click=${this._signIn}>Sign in</button>
      </div>
    `;
  }
}

customElements.define('da-auth-banner', DaAuthBanner);

export function showAuthBanner() {
  if (mountedInstance?.isConnected) return mountedInstance;
  mountedInstance = document.createElement('da-auth-banner');
  document.body.appendChild(mountedInstance);
  return mountedInstance;
}

export function hideAuthBanner() {
  // eslint-disable-next-line no-underscore-dangle
  if (mountedInstance) mountedInstance._dismiss();
}
