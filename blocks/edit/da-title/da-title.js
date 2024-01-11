import { LitElement, html, render } from '../../../deps/lit/lit-core.min.js';
import { saveToDas, saveToFranklin } from '../utils/helpers.js';

import getSheet from '../../shared/sheet.js';
const sheet = await getSheet('/blocks/edit/da-title/da-title.css');

export default class DaTitle extends LitElement {
  static properties = {
    details: { attribute: false },
    _sendActionsVis: {},
    _customActions: {},
    _customActionsVis: {},
  };

  constructor() {
    super();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this._sendActionsVis = false;
    this._customActions = '';
    this._customActionsVis = false;
    this.loadPlugins();
  }

  async handleSendAction(action) {
    this.toggleSendActions();
    const sendBtn = this.shadowRoot.querySelector('.da-title-action-send-icon');
    sendBtn.classList.add('is-sending');

    const { hash } = window.location;
    const pathname = hash.replace('#', '');
    const dasSave = await saveToDas(pathname, this.sheet);
    if (!dasSave.ok) return;
    const aemPath = this.sheet ? `${pathname}.json` : pathname;
    let json = await saveToFranklin(aemPath, 'preview');
    if (action === 'publish') json = await saveToFranklin(aemPath, 'live');
    const { url } = action === 'publish' ? json.live : json.preview;
    window.open(url, '_blank');
    sendBtn.classList.remove('is-sending');
  }

  handlePreview() {
    this.handleSendAction('preview');
  }

  handlePublish() {
    this.handleSendAction('publish');
  }

  toggleSendActions() {
    if(this._customActionsVis) {
      this.toggleCustomActions();
    }
    this._sendActionsVis = !this._sendActionsVis;
  }

  toggleCustomActions() {
    if(this._sendActionsVis) {
      this.toggleSendActions();
    }
    this._customActionsVis = !this._customActionsVis;
  }

  get palette() {
    return document.querySelector('.custom-palette');
  }

  closePalette(context) {
    return () => {
      context.palette.classList.add('hidden');
    };
  }

  generateCustomActionHandler(plugin) {
    if(plugin.isPalette) {
      const existingPalette = this.palette;
      return () => {
        this.toggleCustomActions();
        if(existingPalette) {
          existingPalette.style = plugin.paletteRect;
          existingPalette.querySelector('h2').textContent = plugin.title;
          existingPalette.querySelector('iframe').src = plugin.url;
          existingPalette.classList.remove('hidden');
        } else {
          render(html`
            <div class="custom-palette" style="${plugin.paletteRect}">
              <div class="custom-palette-title">
                <h2>${plugin.title}</h2>
                <span class="custom-palette-close" @click=${this.closePalette(this)}></span>
              </div>
              <iframe src="${plugin.url}">
            </div>`, document.body);
        }
      };
    }
    return () => {
      window.open(new URL(plugin.url, new URL(this.details.previewOrigin)).toString(), '_blank');
    };
  }

  async loadPlugins() {
    const config = await (await fetch(`${this.details.previewOrigin}/tools/sidekick/config.json`)).json();
    const plugins = config.plugins.filter((plugin) => plugin.environments && plugin.environments.indexOf('edit') > -1);
    const customActions = [];
    plugins.forEach((plugin) => {
      customActions.push(html`
        <button
          @click=${this.generateCustomActionHandler(plugin)}
          class="con-button gray da-title-action"
          aria-label="${plugin.title}">
          ${plugin.title}
        </button>`);
    })

    this._customActions = html`
      <button
        @click=${this.toggleCustomActions}
        class="con-button gray da-title-action-top"
        aria-label="Custom Actions">
        <span class="da-title-action-icon da-title-action-custom-icon"></span>
      </button>
      ${customActions}`;
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
        <div class="da-title-actions${this._customActionsVis ? ' is-open' : ''}">
          <div class="da-title-actions-custom">
            ${this._customActions}
          </div>
        </div>
        <div class="da-title-actions${this._sendActionsVis ? ' is-open' : ''}">
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
            @click=${this.toggleSendActions}
            class="con-button blue da-title-action-top"
            aria-label="Send">
            <span class="da-title-action-icon  da-title-action-send-icon"></span>
          </button>
        </div>
      </div>
    `;
  }
}

customElements.define('da-title', DaTitle);
