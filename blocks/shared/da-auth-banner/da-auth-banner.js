import { LitElement, html } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

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

  firstUpdated() {
    if (!this.isConnected) return;
    try { this.shadowRoot.querySelector('dialog')?.showModal(); } catch { /* detached */ }
  }

  _onStorage(event) {
    if (event.key !== 'nx-ims') return;
    if (event.newValue && !event.oldValue) {
      // Another tab signed in. imslib state in this tab may not pick up the
      // new session in place reliably, so reload — that re-runs init and
      // restores everything cleanly.
      this._reload();
    } else if (!event.newValue && event.oldValue) {
      // Another tab signed out — the global handler in scripts.js will
      // navigate home; this is just a defensive secondary path.
      this._goHome();
    }
  }

  // Indirected for testability.
  // eslint-disable-next-line class-methods-use-this
  _reload() { window.location.reload(); }

  // eslint-disable-next-line class-methods-use-this
  _goHome() { window.location = '/'; }

  async _signIn() {
    const { loadIms, handleSignIn } = await import(`${getNx()}/utils/ims.js`);
    await loadIms();
    handleSignIn();
  }

  _dismiss() {
    const dlg = this.shadowRoot?.querySelector('dialog');
    if (dlg?.open) dlg.close();
    if (mountedInstance === this) mountedInstance = null;
    this.remove();
  }

  render() {
    return html`
      <dialog role="alertdialog"
              aria-labelledby="da-auth-title"
              @cancel=${(e) => e.preventDefault()}>
        <h2 id="da-auth-title" class="da-auth-title">Your session has expired</h2>
        <p class="da-auth-msg">Sign in again to continue.</p>
        <div class="da-auth-actions">
          <button class="da-auth-action" @click=${this._signIn}>Sign in</button>
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

export function hideAuthBanner() {
  // eslint-disable-next-line no-underscore-dangle
  if (mountedInstance) mountedInstance._dismiss();
}
