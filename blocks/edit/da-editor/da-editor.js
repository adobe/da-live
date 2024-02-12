import { LitElement, html } from '../../../deps/lit/lit-core.min.js';
import initProse from '../prose/index.js';
import getSheet from '../../shared/sheet.js';

const sheet = await getSheet('/blocks/edit/da-editor/da-editor.css');

// Milo Imports
const { getLibs } = await import('../../../scripts/utils.js');
const { loadIms } = await import(`${getLibs()}/utils/utils.js`);

export default class DaEditor extends LitElement {
  static properties = {
    path: {},
    _imsLoaded: { state: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.shadowRoot.createRange = () => document.createRange();
    loadIms().then(() => {
      this._imsLoaded = true;
    });
  }

  attributeChangedCallback(name, _old, value) {
    super.attributeChangedCallback();
    if (name !== 'path') return;
    this._path = value;
  }

  render() {
    if (!this._imsLoaded) return null;
    return html`<div class="da-prose-mirror"></div>`;
  }

  updated() {
    if (!this._imsLoaded) return;
    const prose = this.shadowRoot.querySelector('.da-prose-mirror');
    prose.innerHTML = '';
    initProse({ editor: prose, path: this._path });
  }
}

customElements.define('da-editor', DaEditor);
