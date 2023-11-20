import { LitElement, html, map } from '../../../deps/lit/lit-all.min.js';
import sheet from './da-content.css' assert { type: 'css' };

import '../da-editor/da-editor.js';
import '../da-preview/da-preview.js';

export default class DaContent extends LitElement {
  static properties = {
    path: { type: String },
    _tabs: { state: true },
  };

  constructor() {
    super();
    this._tabs = [
      { name: 'Edit', active: true },
      { name: 'Preview', active: false },
    ];
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  tabContent(tab) {
    const content = ((tab) => {
      switch(tab.name) {
        case 'Edit':
          return html`<da-editor path=${this.path} />`;
        case 'Preview':
          return html`<da-preview path=${this.path} />`;
        default:
          return html`No known tab`;
      }
    })(tab);

    return html`
      <div class="da-content-tab-panel${tab.active ? ' is-active' : ''}">
        ${content}
      </div>`;
  }

  handleTabChange(setTab) {
    const tabs = this._tabs.map((tab) => {
      tab.active = setTab.name === tab.name;
      return tab;
    });
    this._tabs = tabs;
  }

  render() {
    return html`
      <div class="da-content-tab-container">
        <ul class="da-content-tab-list">
          ${map(this._tabs, (tab) => {
            return html`
              <li class="da-content-tab-item${tab.active ? ' is-active' : ''}">
                <button @click=${() => this.handleTabChange(tab)}>
                  ${tab.name}
                </button>
              </li>`;
          })}
        </ul>
      </div>
      <div class="da-content-tab-panels">
        ${map(this._tabs, (tab) => this.tabContent(tab))}
      </div>
    `;
  }
}

customElements.define('da-content', DaContent);
