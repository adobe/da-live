import { LitElement, html } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const STYLE = await loadStyle(import.meta.url);

let mountedInstance = null;

export class DaAuthBanner extends LitElement {
  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [STYLE];
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (mountedInstance === this) mountedInstance = null;
  }

  firstUpdated() {
    if (!this.isConnected) return;
    try { this.shadowRoot.querySelector('dialog')?.showModal(); } catch { /* detached */ }
  }

  async _signIn() {
    const { loadIms, handleSignIn } = await import(`${getNx()}/utils/ims.js`);
    await loadIms();
    handleSignIn();
  }

  render() {
    return html`
      <dialog role="alertdialog"
              aria-labelledby="da-auth-title"
              @cancel=${(e) => e.preventDefault()}>
        <h2 id="da-auth-title" class="da-auth-title">Your session has expired</h2>
        <p class="da-auth-msg">Sign in again to continue.</p>
        <div class="da-auth-actions">
          <button type="button" class="da-auth-action" @click=${this._signIn}>Sign in</button>
        </div>
      </dialog>
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
