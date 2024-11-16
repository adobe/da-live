import { LitElement, html, nothing } from 'da-lit';
import { getDaAdmin } from '../../shared/constants.js';
import { daFetch } from '../../shared/utils.js';
import getSheet from '../../shared/sheet.js';

const sheet = await getSheet('/blocks/browse/da-orgs/da-orgs.css');

const DA_ORIGIN = getDaAdmin();
const MOCK_IMGS = [
  '/blocks/browse/da-orgs/img/da-one.webp',
  '/blocks/browse/da-orgs/img/da-two.webp',
  '/blocks/browse/da-orgs/img/da-three.webp',
  '/blocks/browse/da-orgs/img/da-four.webp',
  '/blocks/browse/da-orgs/img/da-five.webp',
];

function getRandomImg() {
  const idx = Math.floor(Math.random() * 5);
  return MOCK_IMGS[idx];
}

const MOCK_ORGS = [
  { name: 'aemsites', created: '2024-01-10T17:43:13.390Z', img: MOCK_IMGS[0] },
];

export default class DaOrgs extends LitElement {
  static properties = {
    details: { attribute: false },
    _recents: { state: true },
    _orgs: { state: true },
    _orgsLoaded: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.getRecents();
    this.getOrgs();
  }

  getRecents() {
    const recentOrgs = JSON.parse(localStorage.getItem('da-orgs')) || [];
    if (recentOrgs.length === 0) return;
    this._recents = recentOrgs.map((org) => ({
      name: org,
      img: getRandomImg(),
    }));
  }

  async getOrgs() {
    this._orgs = MOCK_ORGS;
    const resp = await daFetch(`${DA_ORIGIN}/list`);
    if (!resp.ok) return;
    const data = await resp.json();
    this._orgs = data.map((org, idx) => {
      const img = this._orgs[idx]?.img || getRandomImg();
      this.updateRecentOrg(org);
      return { ...org, img };
    });
    this._orgsLoaded = true;
  }

  updateRecentOrg(org) {
    if (!this._recents) return;
    const found = this._recents.find((recent) => recent.name === org.name);
    if (found) found.created = org.created;
  }

  formatDate(string) {
    const date = new Date(string);
    const localeDate = date.toLocaleString();
    return localeDate.split(', ');
  }

  renderOrgs(title, orgs, renderNew) {
    return html`
      <h1>${title}</h1>
      <ul class="da-orgs-list">
        ${orgs.map((org, idx) => html`
          <li>
            <a class="da-org" href="#/${org.name}">
              <div class="image-container">
                <img src="${org.img}" loading="${idx === 0 ? 'eager' : 'lazy'}" alt="" />
              </div>
              <div class="details-area">
                <p class="label">Name</p>
                <p class="details-title">${org.name}</p>
                ${org.created ? html`
                  <p class="label">Created</p>
                  <p class="details-title">${org.created ? this.formatDate(org.created)[0] : ''}</p>
                ` : nothing}
              </div>
            </a>
          </li>`)}
          ${renderNew && this._orgsLoaded ? html`
            <li>
              <a class="da-org new" href="/start">
                <div class="new-icon">
                  <img src="/blocks/browse/da-orgs/img/Smock_AddCircle_18_N.svg" alt="Add new organization"/>
                </div>
                <p class="new-title">Add new</p>
              </a>
            </li>
          ` : nothing}
      </ul>
    `;
  }

  render() {
    return html`
      ${this._recents ? this.renderOrgs('Recent', this._recents) : nothing}
      ${this._orgs ? this.renderOrgs('All', this._orgs, true) : nothing}
    `;
  }
}

customElements.define('da-orgs', DaOrgs);
