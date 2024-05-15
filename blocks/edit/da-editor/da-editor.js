import { LitElement, html } from '../../../deps/lit/lit-core.min.js';
import initProse from '../prose/index.js';
import getSheet from '../../shared/sheet.js';
import { initIms } from '../../shared/utils.js';

const sheet = await getSheet('/blocks/edit/da-editor/da-editor.css');

export default class DaEditor extends LitElement {
  static properties = {
    path: {},
    _imsLoaded: { state: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.shadowRoot.createRange = () => document.createRange();
    initIms().then(() => {
      this._imsLoaded = true;
    });
  }

  disconnectWebsocket() {
    if (this.wsProvider) {
      this.wsProvider.disconnect({ data: 'Client navigation' });
      this.wsProvider = undefined;
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.disconnectWebsocket();
  }

  attributeChangedCallback(name, _old, value) {
    super.attributeChangedCallback();
    if (name !== 'path') return;
    this._path = value;
  }

  triggerErrorStack(el) {
    const es = el.target.parentNode.querySelector('.da-editor-error-stack');
    const hidden = es.classList.toggle('da-editor-error-hidden');
    el.target.innerText = hidden ? '▸' : '▾';
  }

  render() {
    if (!this._imsLoaded) return null;
    return html`<div class="da-editor-error da-editor-error-hidden">
      <div class="da-editor-error-close">⛌</div>
      <div class="da-editor-error-message"></div>
      <div class="da-editor-error-twistie" @click=${this.triggerErrorStack}>▸</div>
      <div class="da-editor-error-stack da-editor-error-hidden"></div>
    </div>
    <div class="da-prose-mirror"></div>`;
  }

  updated() {
    if (!this._imsLoaded) return;
    this.disconnectWebsocket();
    const prose = this.shadowRoot.querySelector('.da-prose-mirror');
    prose.innerHTML = '';
    this.wsProvider = initProse({ editor: prose, path: this._path });
  }
}

customElements.define('da-editor', DaEditor);
