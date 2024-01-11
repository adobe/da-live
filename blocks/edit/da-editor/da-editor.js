import { LitElement, html } from '../../../deps/lit/lit-core.min.js';
import getContent from '../utils/content.js';
import initProse from '../prose/index.js';

import getSheet from '../../shared/sheet.js';
const sheet = await getSheet('/blocks/edit/da-editor/da-editor.css');

export default class DaEditor extends LitElement {
  static properties = {
    path: {},
    _content: {},
    _contentLoaded: { state: true }
  };

  constructor() {
    super();
  }

  async getContent(path) {
    this._contentLoaded = false;
    this._content = await getContent(`${path}`);
    this._contentLoaded = true;
    this._path = path;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  attributeChangedCallback(name, _old, value) {
    super.attributeChangedCallback();
    if (name !== 'path') return;
    this.getContent(value);
  }

  render() {
    if (!this._content) return null;
    return html`<div class="da-prose-mirror"></div>`;
  }

  updated(props) {
    if (!this._content) return;
    const prose = this.shadowRoot.querySelector('.da-prose-mirror');
    prose.innerHTML = '';
    const content = document.createElement('div');
    content.append(...this._content);
    initProse(prose, content, this._path);
  }
}

customElements.define('da-editor', DaEditor);
