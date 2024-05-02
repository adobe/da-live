import { LitElement, html, nothing } from '../../../deps/lit/lit-core.min.js';
import { saveToDa, saveToAem, saveDaConfig } from '../utils/helpers.js';
import inlinesvg from '../../shared/inlinesvg.js';
import getSheet from '../../shared/sheet.js';

const sheet = await getSheet('/blocks/edit/da-title/da-title.css');

const ICONS = [
  '/blocks/edit/img/Smock_Cloud_18_N.svg',
  '/blocks/edit/img/Smock_CloudDisconnected_18_N.svg',
  '/blocks/edit/img/Smock_CloudError_18_N.svg',
];

const CLOUD_ICONS = {
  connected: 'spectrum-Cloud-connected',
  offline: 'spectrum-Cloud-offline',
  connecting: 'spectrum-Cloud-error',
  error: 'spectrum-Cloud-error',
};

export default class DaTitle extends LitElement {
  static properties = {
    details: { attribute: false },
    collabStatus: { attribute: false },
    collabUsers: { attribute: false },
    _actionsVis: {},
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this._actionsVis = false;
    inlinesvg({ parent: this.shadowRoot, paths: ICONS });
  }

  async saveVersion(pathname) {
    const edit = this.parentNode.querySelector('da-content').shadowRoot.querySelector('da-editor');
    if (!edit) {
      // eslint-disable-next-line no-console
      console.log('Not able to obtain document path');
      return;
    }
    // TODO there must be a better way to obtain path
    const url = new URL(edit._path);
    const pathName = url.pathname;
    if (!pathName.startsWith('/source/')) {
      // Unexpected document URL
      // eslint-disable-next-line no-console
      console.log('Unexpected document URL', this.path);
      return;
    }

    const versionURL = `${url.origin}/versionsource/${pathName.slice(8)}`;

    const res = await fetch(versionURL, { method: 'POST' });
    if (res.status !== 201) {
      // eslint-disable-next-line no-console
      console.log('Unable to create version', res.status);
    }
  }

  async handleAction(action) {
    this.toggleActions();
    const sendBtn = this.shadowRoot.querySelector('.da-title-action-send-icon');
    sendBtn.classList.add('is-sending');

    const { hash } = window.location;
    const pathname = hash.replace('#', '');
    // Only save to DA if it is a sheet or config
    if (this.details.view === 'sheet') {
      const dasSave = await saveToDa(pathname, this.sheet);
      if (!dasSave.ok) return;
    }
    if (this.details.view === 'config') {
      const daConfigResp = await saveDaConfig(pathname, this.sheet);
      if (!daConfigResp.ok) return;
    }
    if (action === 'preview' || action === 'publish') {
      const aemPath = this.sheet ? `${pathname}.json` : pathname;
      let json = await saveToAem(aemPath, 'preview');
      if (action === 'publish') json = await saveToAem(aemPath, 'live');
      const { url } = action === 'publish' ? json.live : json.preview;
      window.open(url, '_blank');

      this.saveVersion(pathname);
    }
    sendBtn.classList.remove('is-sending');
  }

  toggleActions() {
    this._actionsVis = !this._actionsVis;
  }

  renderSave() {
    return html`
    <button
      @click=${this.handleAction}
      class="con-button blue da-title-action"
      aria-label="Send">
      Save
    </button>`;
  }

  renderAemActions() {
    return html`
      <button
        @click=${() => this.handleAction('preview')}
        class="con-button blue da-title-action"
        aria-label="Send">
        Preview
      </button>
      <button
        @click=${() => this.handleAction('publish')}
        class="con-button blue da-title-action"
        aria-label="Send">
        Publish
      </button>`;
  }

  popover({ target }) {
    // If toggling off, simply remove;
    if (target.classList.contains('collab-popup')) {
      target.classList.remove('collab-popup');
      return;
    }
    // Find all open popups and close them
    const openPopups = this.shadowRoot.querySelectorAll('.collab-popup');
    openPopups.forEach((pop) => { pop.classList.remove('collab-popup'); });
    target.classList.add('collab-popup');
  }

  renderCollabUsers() {
    return html`${this.collabUsers.map((user) => {
      const initials = user.split(' ').map((name) => name.toString().substring(0, 1));
      return html`<div class="collab-icon collab-icon-user" data-popup-content="${user}" @click=${this.popover}>${initials.join('')}</div>`;
    })}`;
  }

  renderCollab() {
    return html`
      <div class="collab-status">
        ${this.collabUsers ? this.renderCollabUsers() : nothing}
        <div class="collab-icon collab-status-cloud collab-status-${this.collabStatus}" data-popup-content="${this.collabStatus}" @click=${this.popover}>
         <svg class="icon"><use href="#${CLOUD_ICONS[this.collabStatus]}"/></svg>
        </div>
      </div>`;
  }

  render() {
    return html`
      <div class="da-title-inner">
        <div class="da-title-name">
          <a
            href="/#${this.details.parent}"
            target="${this.details.parent.replaceAll('/', '-')}"
            class="da-title-name-label">${this.details.parentName}</a>
          <h1>${this.details.name}</h1>
        </div>
        <div class="da-title-collab-actions-wrapper">
          ${this.collabStatus ? this.renderCollab() : nothing}
          <div class="da-title-actions${this._actionsVis ? ' is-open' : ''}">
            ${this.details.view === 'config' ? this.renderSave() : this.renderAemActions()}
            <button
              @click=${this.toggleActions}
              class="con-button blue da-title-action-send"
              aria-label="Send">
              <span class="da-title-action-send-icon"></span>
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('da-title', DaTitle);
