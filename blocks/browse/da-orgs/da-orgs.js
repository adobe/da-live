import { LitElement, html, map } from '../../../deps/lit/lit-all.min.js';
import { origin } from '../../shared/constants.js';

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

  formatDate(string) {
    const date = new Date(string);
    const localeDate = date.toLocaleString();
    return localeDate.split(', ');
  }

  render() {
    if (!this._orgs) return;

    return html`
      <h1>Organizations</h1>
      <ul class="da-orgs-list">
        ${map(this._orgs, (org) => html`
          <li>
            <a class="da-org" href="#/${org.name}">
              <div class="image-container">
                <img src="${getRandomImg()}" />
              </div>
              <div class="details-area">
                <p class="label">Name</p>
                <p class="details-title">${org.name}</p>
                <p class="label">Created</p>
                <p class="details-title">${this.formatDate(org.created)[0]}</p>
              </div>
            </a>
          </li>`
        )}
        <li>
          <a class="da-org new" href="/start">
            <div class="new-icon">
              <img src="/blocks/browse/da-orgs/img/Smock_AddCircle_18_N.svg" alt="Add new organization"/>
            </div>
            <h3 class="new-title">Add new</h3>
          </a>
        </li>
      </ul>
    `;
  }
}

customElements.define('da-orgs', DaOrgs);
