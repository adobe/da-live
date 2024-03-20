import { LitElement, html } from '../../../deps/lit/lit-core.min.js';
import getSheet from '../../shared/sheet.js';

const sheet = await getSheet('/blocks/edit/da-versions/da-versions.css');

const SIZES = {
  mobile: '375px',
  tablet: '899px',
  laptop: '1280px',
  desktop: '1440px',
};

export default class DaVersions extends LitElement {
  constructor() {
    super();
    console.log('haha');
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  hideVersions() {
    this.parent.classList.remove('show-versions');
    this.classList.remove('show-versions');
  }

  render() {
    return html`
      <div class="da-preview-menubar">
      ${Object.keys(SIZES).map((key) => html`
        <span
          class="da-preview-menuitem set-${key}"
          @click=${() => this.setWidth(key)}>
        </span>`)}
      <span class="da-preview-menuitem" @click=${this.hideVersions}></span>
    </div>
    <div class="da-versions-panel">The versions list </div>
    `;
  }
}

customElements.define('da-versions', DaVersions);
