import { LitElement, html, nothing } from 'da-lit';
import { DA_ORIGIN } from '../../shared/constants.js';
import { initIms, daFetch } from '../../shared/utils.js';
import getSheet from '../../shared/sheet.js';

const sheet = await getSheet('/blocks/browse/da-orgs/da-orgs.css');

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

export default class DaOrgs extends LitElement {
  static properties = {
    _recents: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.getRecents();
  }

  getRecents() {
    const recentOrgs = JSON.parse(localStorage.getItem('da-orgs')) || [];
    if (recentOrgs.length === 0) return;
    this._recents = recentOrgs.map((org) => ({
      name: org,
      img: getRandomImg(),
    }));
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

  async handleGo(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const { org } = Object.fromEntries(formData);
    if (!org) return;

    // const imsDetails = await initIms();
    // console.log(imsDetails);

    // const opts = { method: 'HEAD' };
    // const resp = await daFetch(`${DA_ORIGIN}/list/${org}`, opts);
    // if (!resp.ok) {
    //   // Flash red for 2s
    //   this._goform.classList.toggle('has-error');
    //   setTimeout(() => { this._goform.classList.toggle('has-error'); }, 2000);

    //   return;
    // }

    // Just send them and let auth & redirect take care of itself.
    window.location = `#/${org}`;
  }

  get _goform() {
    return this.shadowRoot.querySelector('form');
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
          <div class="da-org-back">
            <button @click=${() => this.handleRemove(org)}>
              <div class="new-icon">
                <img src="/blocks/browse/da-orgs/img/Smock_VisibilityOff_18_N.svg" alt="Remove from recents list"/>
              </div>
              <p class="new-title">Remove</p>
            </button>
          </div>
          ${listType === 'recents' ? html`
            <button class="da-flip-btn" @click=${(e) => { this.handleFlip(e, org); }}></button>` : nothing}
        </div>
      </li>
    `;
  }

  renderOrgs(title, orgs) {
    const listType = title === 'organizations' ? 'orgs' : 'recents';
    return html`
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

  renderEmpty() {
    return html`
      <div class="da-no-org-well">
        <img src="/blocks/browse/da-orgs/img/org-icon-color.svg" width="80" height="60" alt=""/>
        <div class="da-no-org-text">
          <h3>You don’t have any recent organizations.</h3>
          <p>Go to your organization, play in the sandbox, or create a new one.</p>
        <div>
        <form @submit=${this.handleGo}>
          <input type="text" name="org" placeholder="organization" />
          <div class="da-form-btn-offset">
            <button aria-label="Go to organization">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26">
                <path fill="currentColor"
                  d="M23.09,13.67c.14-.35.14-.74,0-1.08-.07-.17-.18-.33-.31-.46l-6.62-6.62c-.55-.55-1.45-.55-2,0-.55.55-.55,1.45,0,2l4.21,4.21H4.61c-.78,0-1.41.63-1.41,1.42s.63,1.42,1.41,1.42h13.76l-4.21,4.21c-.55.55-.55,1.45,0,2,.28.28.64.41,1,.41s.72-.14,1-.41l6.62-6.62c.13-.13.23-.29.31-.46Z" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    `;
  }

  render() {
    return html`
      <img src="/blocks/browse/da-orgs/img/bg-gradient-org.jpg" class="da-org-bg" alt="" />
      <div class="da-org-container">
        <h2>Recents</h2>
        ${this._recents && this._recents.length > 0 ? this.renderOrgs('recent', this._recents) : this.renderEmpty()}
        <h2>Organizations</h2>
        <div class="da-org-sandbox-new">
          <a class="da-double-card da-double-card-sandbox" href="#/aemsites">
            <picture>
              <img class="da-double-card-bg" src="/blocks/browse/da-orgs/img/sandbox-bg.jpg" width="800" height="534" alt="" />
            </picture>
            <div class="da-double-card-fg">
              <img src="/blocks/browse/da-orgs/img/sandbox-icon-gray.svg" width="80" height="60" alt=""/>
              <h3>Sandbox</h3>
            </div>
          </a>
          <a class="da-double-card da-double-card-add-new" href="/start">
            <picture>
              <img class="da-double-card-bg" src="/blocks/browse/da-orgs/img/new-bg.jpg" width="800" height="546" alt="" />
            </picture>
            <div class="da-double-card-fg">
              <img src="/blocks/browse/da-orgs/img/add-new-icon-gray.svg" width="80" height="60" alt=""/>
              <h3>Add new</h3>
            </div>
          </a>
        </div>
      </div>
    `;
  }
}

customElements.define('da-orgs', DaOrgs);
