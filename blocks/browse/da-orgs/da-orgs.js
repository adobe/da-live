import { LitElement, html, map } from '../../../deps/lit/lit-all.min.js';
import { origin } from '../state/index.js';

import getSheet from '../../shared/sheet.js';
const sheet = await getSheet('/blocks/browse/da-orgs/da-orgs.css');

const MOCK_ORGS = [
  { Name: 'auniverseaway' },
  { Name: 'adobecom' },
];

const MOCK_IMGS = [
  '/blocks/browse/da-orgs/img/adobe-dark-alley.jpg',
  '/blocks/browse/da-orgs/img/da-two-50.jpg',
  '/blocks/browse/da-orgs/img/da-three-50.jpg',
  '/blocks/browse/da-orgs/img/da-four-50.jpg',
  '/blocks/browse/da-orgs/img/da-five-50.jpg',
];

function getRandomImg() {
  const idx = Math.floor(Math.random() * 5);
  return MOCK_IMGS[idx];
}

export default class DaOrgs extends LitElement {
  static properties = {
    details: { attribute: false },
    _orgs: { state: true },
  };

  constructor() {
    super();
    this.getOrgs();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  async getOrgs() {
    const resp = await fetch(`${origin}/list`);
    if (!resp.ok) return;
    this._orgs = await resp.json();
  }

  onOrgClick(org) {
    window.location.hash = `/${org.name}`;
  }

  render() {
    return html`
      <h1>Organizations</h1>
      <ul class="da-orgs-list">
        ${map(this._orgs, (org) => html`
          <li class="da-org" @click=${(e) => { this.onOrgClick(org); }}>
            <div class="image-container">
              <img src="${getRandomImg()}" />
            </div>
            <div class="details-area">
              <h3 class="details-title">${org.Name}</h3>
            </div>
          </li>`
        )}
      </ul>
    `;
  }
}

customElements.define('da-orgs', DaOrgs);
