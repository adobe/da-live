import { LitElement, html, map } from '../../../deps/lit/lit-all.min.js';
import { origin } from '../state/index.js';

import getSheet from '../../shared/sheet.js';
const sheet = await getSheet('/blocks/browse/da-browse/da-browse.css');

export default class DaBrowse extends LitElement {
  static properties = {
    details: {
      attribute: false,
    },
    _listItems: {  },
  };

  constructor() {
    super();
  }

  async getList() {
    const resp = await fetch(`${origin}/list${this.details.fullpath}`);
    if (!resp.ok) return;
    return resp.json();
  }

  getEditPath(path) {
    const pathSplit = path.split('.');
    // This will fail spectacularly if there are other periods in the path
    return `/edit#${pathSplit[0]}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  async update(props) {
    if (props.has('details')) {
      this._listItems = await this.getList();
    }
    super.update(props);
  }

  render() {
    return html`
      <h1>Browse</h1>
      <ul class="da-item-list">
        ${map(this._listItems, (item) => html`
          <li class="da-item-list-item">
            <input type="checkbox" name="select" style="display: none;">
            <a href="${item.isFile ? this.getEditPath(item.path) : `/#${item.path}`}" class="da-item-list-item-title">
              <span class="da-item-list-item-type ${item.isFile ? 'da-item-list-item-type-file' : 'da-item-list-item-type-folder' }">
              </span>${item.name.split('.')[0]}
            </a>
          </li>
        `)}
      </ul>
    `;
  }
}

customElements.define('da-browse', DaBrowse);
