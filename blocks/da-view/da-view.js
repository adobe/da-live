import { LitElement, html } from '../../deps/lit/lit-core.min.js';
import getPathDetails from '../shared/pathDetails.js';

import getSheet from '../shared/sheet.js';

const sheet = await getSheet('/blocks/da-view/da-view-wc.css');

class DaView extends LitElement {
  static properties = {};

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    document.title = `View ${this.details.name} - Dark Alley`;
  }

  render() {
    return html`
      <div class="da-title-wrapper">
        <div class="title-label">Name</div>
        <h1>${this.details.name}</h1>
      </div>
      <div class="da-content">
        <img src="${this.details.contentUrl}" width="900" height="600" />
      </div>
    `;
  }
}

customElements.define('da-view', DaView);

export default function init(el) {
  const daView = document.createElement('da-view');
  daView.details = getPathDetails();
  el.append(daView);
}
