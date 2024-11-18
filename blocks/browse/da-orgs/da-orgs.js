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
  { name: 'da-sites', created: '2024-03-13T17:43:13.390Z', img: MOCK_IMGS[1] },
];

export default class DaOrgs extends LitElement {
  static properties = {
    details: { attribute: false },
    _recents: { state: true },
    _orgs: { state: true },
    _full: { state: true },
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
    this._orgs.push(...data.reduce((acc, org) => {
      this.updateRecentOrg(org);
      const exists = this._orgs.some((mock) => mock.name === org.name);
      if (!exists) {
        org.img = getRandomImg();
        acc.push(org);
      }
      return acc;
    }, []));
  }

  handleShowAll(e) {
    e.preventDefault();
    this._full = !this._full;
  }

  handleRemove(org) {
    // Get the index of the org to remove
    const idx = this._recents.findIndex((recent) => recent.name === org.name);
    // Remove it from UI
    this._recents.splice(idx, 1);
    this.requestUpdate();
    // Get the localstorage orgs
    const localOrgs = JSON.parse(localStorage.getItem('da-orgs')) || [];
    // Remove it from the local store
    localOrgs.splice(idx, 1);
    localStorage.setItem('da-orgs', JSON.stringify(localOrgs));
  }

  handleFlip(e, org) {
    e.preventDefault();
    e.stopPropagation();
    org.flipped = !org.flipped;
    this.requestUpdate();
  }

  updateRecentOrg(org) {
    if (!this._recents) return;
    const found = this._recents.find((recent) => recent.name === org.name);
    if (found) found.created = org.created;
    this.requestUpdate();
  }

  formatDate(string) {
    const date = new Date(string);
    const localeDate = date.toLocaleString();
    return localeDate.split(', ');
  }

  get _visibleOrgs() {
    return this._full ? this._orgs : this._orgs.slice(0, 2);
  }

  renderOrg(org, listType) {
    return html`
      <li class="da-org-outer">
        <div class="da-org ${org.flipped ? 'is-flipped' : ''}">
          <a href="#/${org.name}" class="da-org-front">
            <div class="image-container">
              <img src="${org.img}" loading="lazy" alt="" />
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
          <button class="da-org-back" @click=${() => this.handleRemove(org)}>
            <div class="new-icon">
              <img src="/blocks/browse/da-orgs/img/Smock_VisibilityOff_18_N.svg" alt="Remove from recents list"/>
            </div>
            <p class="new-title">Remove</p>
          </button>
          ${listType === 'recents' ? html`
            <button class="da-flip-btn" @click=${(e) => { this.handleFlip(e, org); }}></button>` : nothing}
        </div>
      </li>
    `;
  }

  renderOrgs(title, orgs) {
    const listType = title === 'organizations' ? 'orgs' : 'recents';
    return html`
      <h1>${title}</h1>
      <ul class="da-orgs-list">
        ${orgs.map((org) => this.renderOrg(org, listType))}
        ${listType === 'orgs' ? html`
          ${!this._full ? html`
            <li>
              <a class="da-org show-all" @click=${this.handleShowAll}>
                <div class="new-icon">
                  <img src="/blocks/browse/img/Smock_More_18_N.svg" alt="See all organizations"/>
                </div>
                <p class="new-title">See more</p>
              </a>
            </li>` : nothing}
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
      <img src="/blocks/browse/da-orgs/img/bg-gradient-org.jpg" class="da-org-bg" />
      <div class="da-org-container">
        ${this._recents && this._recents.length > 0 ? this.renderOrgs('recent', this._recents) : nothing}
        ${this._visibleOrgs ? this.renderOrgs('organizations', this._visibleOrgs, true) : nothing}
      </div>
    `;
  }
}

customElements.define('da-orgs', DaOrgs);
