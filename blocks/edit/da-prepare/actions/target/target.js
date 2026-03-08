import { LitElement, html, nothing } from 'da-lit';
import getSheet from '../../../../shared/sheet.js';
import { fetchTargetConfig, authenticate, savePreview, sendToTarget } from './utils.js';

const sheet = await getSheet(import.meta.url.replace('js', 'css'));

class DaTarget extends LitElement {
  static properties = {
    details: { attribute: false },
    _config: { state: true },
    _name: { state: true },
    _statusText: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.loadTargetConfig();
  }

  async loadTargetConfig() {
    const { org, site } = this.details;
    this._statusText = 'Fetching Target config';
    this._config = await fetchTargetConfig(org, site);
    if (this._config) this._statusText = undefined;
  }

  async handleSend() {
    const { org, site, path } = this.details;
    this._statusText = 'Authenticating...';
    const authResult = await authenticate(org, site);
    if (authResult.error) {
      this._statusText = authResult.error;
      return;
    }
    this._statusText = 'Previewing...';
    const prevResult = await savePreview(org, site, path);
    if (prevResult.error) {
      this._statusText = prevResult.error;
      return;
    }
    const { token } = authResult;
    const { url: aemPath } = prevResult.preview;

    this._statusText = 'Sending to Target...';
    const sendResult = await sendToTarget(org, site, aemPath, token);
  }

  get _placeholder() {
    return `${new Date().getFullYear()} promotion`;
  }

  get _disabled() {
    return !this._config || this._statusText || !this._name;
  }

  render() {
    return html`
      <div class="content">
        <sl-input
          type="text"
          label="Target offer name"
          placeholder=${this._placeholder}
          @input=${({ target }) => { this._name = target.value; }}
          aria-label="Target Offer name"
          value=${this._name}></sl-input>
      </div>
      <div class="footer">
        <p class="status-text">${this._statusText}</p> 
        <sl-button class="negative" @click=${this.handleSend} ?disabled=${this._disabled}>Unpublish</sl-button>
      </div>
      `;
  }
}

customElements.define('da-adobetarget', DaTarget);

export default function render(details) {
  const cmp = document.createElement('da-adobetarget');
  cmp.details = details;
  return cmp;
}
