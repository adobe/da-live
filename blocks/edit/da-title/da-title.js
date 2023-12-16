import { LitElement, html } from '../../../deps/lit/lit-core.min.js';
import { saveToDas, saveToFranklin } from '../utils/helpers.js';

import getSheet from '../../shared/sheet.js';
const sheet = await getSheet('/blocks/edit/da-title/da-title.css');

export default class DaTitle extends LitElement {
  static properties = {
    details: { attribute: false },
    _actionsVis: {},
  };

  constructor() {
    super();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this._actionsVis = false;
  }

  async handleAction(action) {
    const { hash } = window.location;
    const pathname = hash.replace('#', '');
    const dasSave = await saveToDas(pathname);
    if (!dasSave.ok) return;
    let json = await saveToFranklin(pathname, 'preview');
    if (action === 'publish') json = await saveToFranklin(pathname, 'live');
    const { url } = action === 'publish' ? json.live : json.preview;
    window.open(url, '_blank');
  }

  handlePreview() {
    this.handleAction('preview');
  }

  handlePublish() {
    this.handleAction('publish');
  }

  toggleActions() {
    this._actionsVis = !this._actionsVis;
  }

  render() {
    return html`
      <div class="da-title-inner">
        <div class="da-title-name">
          <a
            href="/#${this.details.parent}"
            target="${this.details.parent.replaceAll('/', '-')}"
            class="da-title-name-label">${this.details.parentName}</a>
          <h1>${this.details.name}</h1>
        </div>
        <div class="da-title-actions${this._actionsVis ? ' is-open' : ''}">
          <button
            @click=${this.handlePreview}
            class="con-button blue da-title-action"
            aria-label="Send">
            Preview
          </button>
          <button
            @click=${this.handlePublish}
            class="con-button blue da-title-action"
            aria-label="Send">
            Publish
          </button>
          <button
            @click=${this.toggleActions}
            class="con-button blue da-title-action-send"
            aria-label="Send">
            <span class="da-title-action-send-icon"></span>
          </button>
        </div>
      </div>
    `;
  }
}

customElements.define('da-title', DaTitle);
