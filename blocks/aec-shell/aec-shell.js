import { LitElement, html } from '../../../deps/lit/lit-core.min.js';
import getSheet from '../shared/sheet.js';

const sheet = await getSheet('/blocks/aec-shell/aec-shell-wc.css');

// Milo Imports
const { getLibs } = await import('../../../scripts/utils.js');
const { getConfig, loadIms } = await import(`${getLibs()}/utils/utils.js`);

class AECShell extends LitElement {
  static properties = {
    _ims: { state: true },
    _ioAvatar: { state: true },
  };

  constructor() {
    super();
    this._ims = 'unknown';
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    loadIms().then(() => { this.imsReady(); });
  }

  async imsReady() {
    const accessToken = window.adobeIMS.getAccessToken();
    if (!accessToken) { this._ims = 'anonymous'; return; }

    const { env } = getConfig();
    const headers = new Headers({ Authorization: `Bearer ${accessToken.token}` });
    const resp = await fetch(`https://${env.adobeIO}/profile`, { headers });

    if (resp.status !== 200) { this._ims = 'anonymous'; return; }

    const { user } = await resp.json();
    this._ioAvatar = user.avatar;
    this._ims = 'signed-in';
  }

  handleSignIn() {
    window.adobeIMS.signIn();
  }

  handleSignOut() {
    window.adobeIMS.signOut();
  }

  handleLogoClick() {
    window.location.href = '/';
  }

  render() {
    return html`
      <button class="aec-button" @click=${this.handleLogoClick}>
        <img class="aec-logo" src="/blocks/aec-shell/img/aec.svg#AdobeExperienceCloud" />Project Dark Alley
      </button>
      <div class="ims ims-${this._ims}">
        <button class="sign-in" @click=${this.handleSignIn}>Sign in</button>
        <div class="profile">
          <button class="profile-button" aria-label="Profile" @click=${this.handleSignOut}>
            <img src="${this._ioAvatar}" />
          </button>
        </div>
      </div>
    `;
  }
}

customElements.define('aec-shell', AECShell);

export default function init(el) {
  el.append(document.createElement('aec-shell'));
}
