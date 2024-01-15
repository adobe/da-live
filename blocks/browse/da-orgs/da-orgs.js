import { LitElement, html } from '../../../deps/lit/lit-core.min.js';
import { origin } from '../../shared/constants.js';
import { daFetch } from '../../shared/utils.js';
import getSheet from '../../shared/sheet.js';

const sheet = await getSheet('/blocks/browse/da-orgs/da-orgs.css');

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

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.getOrgs();
  }

  async getOrgs() {
    const resp = await daFetch(`${origin}/list`);
    if (!resp.ok) return;
    this._orgs = await resp.json();
  }

  formatDate(string) {
    const date = new Date(string);
    const localeDate = date.toLocaleString();
    return localeDate.split(', ');
  }

  render() {
    if (!this._orgs) return null;

    return html`
      <h1>Organizations</h1>
      <ul class="da-orgs-list">
        ${this._orgs.map((org) => html`
          <li>
            <a class="da-org" href="#/${org.name}">
              <div class="image-container">
                <img src="${getRandomImg()}" loading="lazy" />
              </div>
              <div class="details-area">
                <p class="label">Name</p>
                <p class="details-title">${org.name}</p>
                <p class="label">Created</p>
                <p class="details-title">${this.formatDate(org.created)[0]}</p>
              </div>
            </a>
          </li>`)}
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
