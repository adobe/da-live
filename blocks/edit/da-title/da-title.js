import { LitElement, html } from '../../../deps/lit/lit-core.min.js';
import { saveToDa, saveToAem, saveDaConfig } from '../utils/helpers.js';
import getSheet from '../../shared/sheet.js';

const sheet = await getSheet('/blocks/edit/da-title/da-title.css');

export default class DaTitle extends LitElement {
  static properties = {
    details: { attribute: false },
    _actionsVis: {},
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this._actionsVis = false;
  }

  async handleAction(action) {
    this.toggleActions();
    const sendBtn = this.shadowRoot.querySelector('.da-title-action-send-icon');
    sendBtn.classList.add('is-sending');

    const { hash } = window.location;
    const pathname = hash.replace('#', '');
    // Only save to DA if it is a sheet or config
    if (this.details.view === 'sheet') {
      const dasSave = await saveToDa(pathname, this.sheet);
      if (!dasSave.ok) return;
    }
    if (this.details.view === 'config') {
      const daConfigResp = await saveDaConfig(pathname, this.sheet);
      if (!daConfigResp.ok) return;
    }
    if (action === 'preview' || action === 'publish') {
      const aemPath = this.sheet ? `${pathname}.json` : pathname;
      let json = await saveToAem(aemPath, 'preview');
      if (action === 'publish') json = await saveToAem(aemPath, 'live');
      const { url } = action === 'publish' ? json.live : json.preview;
      window.open(url, '_blank');
    }
    sendBtn.classList.remove('is-sending');
  }

  toggleActions() {
    this._actionsVis = !this._actionsVis;
  }

  renderSave() {
    return html`
    <button
      @click=${this.handleAction}
      class="con-button blue da-title-action"
      aria-label="Send">
      Save
    </button>`;
  }

  renderAemActions() {
    return html`
      <button
        @click=${() => this.handleAction('preview')}
        class="con-button blue da-title-action"
        aria-label="Send">
        Preview
      </button>
      <button
        @click=${() => this.handleAction('publish')}
        class="con-button blue da-title-action"
        aria-label="Send">
        Publish
      </button>`;
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
          ${this.details.view === 'config' ? this.renderSave() : this.renderAemActions()}
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
