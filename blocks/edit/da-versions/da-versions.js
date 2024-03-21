import { LitElement, html } from '../../../deps/lit/lit-core.min.js';
import getSheet from '../../shared/sheet.js';

const sheet = await getSheet('/blocks/edit/da-versions/da-versions.css');

export default class DaVersions extends LitElement {
  constructor() {
    super();
    this.parent = document.querySelector('da-content');
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  setDaVersionVisibility(displayStyle) {
    const dav = this.parent.shadowRoot.querySelector('da-version');
    dav.style.display = displayStyle;
    return dav;
  }

  hideVersions() {
    this.setDaVersionVisibility('none');

    this.parent.classList.remove('show-versions');
    this.classList.remove('show-versions');
  }

  versionSelected(event) {
    const dav = this.setDaVersionVisibility('block');
    const pm = dav.shadowRoot.querySelector('.ProseMirror');
    pm.innerHTML = `<p>${event.target.innerText}</p>`;
  }


  render() {
    return html`
    <div class="da-versions-menubar">
      <span class="da-versions-menuitem da-versions-create"></span>
      <span class="da-versions-menuitem da-versions-restore"></span>
      <span class="da-versions-menuitem da-versions-close" @click=${this.hideVersions}></span>
    </div>
    <div class="da-versions-panel">
    <ul @click=${this.versionSelected}>
      <li tabindex="1">6 hours ago
      <br>David Bosschaert

      <li tabindex="1">Mar 19, 2024 17:50 PM
      <br>Chris Millar

      <li tabindex="1">Mar 19, 2024 9:53 AM
      <br>Karl Pauls
    </ul>
    </div>
    `;
  }
}

customElements.define('da-versions', DaVersions);
