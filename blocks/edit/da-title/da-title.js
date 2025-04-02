import { LitElement, html, nothing } from 'da-lit';
import { saveToDa, saveToAem, saveDaConfig, saveDaVersion } from '../utils/helpers.js';
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
    permissions: { attribute: false },
    collabStatus: { attribute: false },
    collabUsers: { attribute: false },
    _actionsVis: {},
    _status: { state: true },
    _fixedActions: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this._actionsVis = false;
    inlinesvg({ parent: this.shadowRoot, paths: ICONS });
    if (this.details.view === 'sheet') {
      this.collabStatus = window.navigator.onLine
        ? 'connected'
        : 'offline';

      window.addEventListener('online', () => { this.collabStatus = 'connected'; });
      window.addEventListener('offline', () => { this.collabStatus = 'offline'; });
    }
  }

  firstUpdated() {
    const observer = new IntersectionObserver((entries) => {
      this._fixedActions = !entries[0].isIntersecting;
    });

    const element = this.shadowRoot.querySelector('h1');
    if (element) observer.observe(element);
  }

  handleError(json, action, icon) {
    this._status = { ...json.error, action };
    icon.classList.remove('is-sending');
    icon.parentElement.classList.add('is-error');
  }

  getSnapshotHref(url, action) {
    const tldRepl = action === 'publish' ? 'aem.live' : 'aem.page';
    const pathParts = url.pathname.slice(1).toLowerCase().split('/');
    const snapName = pathParts.splice(0, 2)[1];
    const origin = url.origin
      .replace('https://', `https://${snapName}--`)
      .replace(tldRepl, 'aem.reviews');
    return `${origin}/${pathParts.join('/')}`;
  }

  async handleAction(action) {
    this.toggleActions();
    this._status = null;
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
      if (!daConfigResp.ok) {
        console.log('Saving configuration failed because:', daConfigResp.status, await daConfigResp.text());
        return;
      }
    }
    if (action === 'preview' || action === 'publish') {
      const aemPath = this.sheet ? `${pathname}.json` : pathname;
      let json = await saveToAem(aemPath, 'preview');
      if (json.error) {
        this.handleError(json, action, sendBtn);
        return;
      }
      if (action === 'publish') json = await saveToAem(aemPath, 'live');
      if (json.error) {
        this.handleError(json, action, sendBtn);
        return;
      }
      const { url: href } = action === 'publish' ? json.live : json.preview;
      const url = new URL(href);
      const isSnap = url.pathname.startsWith('/.snapshots');
      const toOpen = isSnap ? this.getSnapshotHref(url, action) : href;
      window.open(`${toOpen}?nocache=${Date.now()}`, toOpen);
    }
    if (this.details.view === 'edit' && action === 'publish') saveDaVersion(pathname);
    sendBtn.classList.remove('is-sending');
  }

  toggleActions() {
    this._actionsVis = !this._actionsVis;
  }

  get _readOnly() {
    if (!this.permissions) return false;
    return !this.permissions.some((permission) => permission === 'write');
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
      <div class="da-title-inner ${this._readOnly ? 'is-read-only' : ''}">
        <div class="da-title-name">
          <a
            href="/#${this.details.parent}"
            target="${this.details.parent.replaceAll('/', '-')}"
            class="da-title-name-label">${this.details.parentName}</a>
          <h1>${this.details.name}</h1>
        </div>
        <div class="da-title-collab-actions-wrapper">
          ${this.collabStatus ? this.renderCollab() : nothing}
          ${this._status ? html`<p class="da-title-error-details">${this._status.message} ${this._status.action}.</p>` : nothing}
          <div class="da-title-actions ${this._fixedActions ? 'is-fixed' : ''} ${this._actionsVis ? 'is-open' : ''}">
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
