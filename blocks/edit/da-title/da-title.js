import { LitElement, html, nothing } from 'da-lit';
import {
  requestRole,
  saveToDa,
  saveToAem,
  saveDaConfig,
  saveDaVersion,
  getCdnConfig,
} from '../utils/helpers.js';
import { getFirstSheet, fetchDaConfig } from '../../shared/utils.js';
import { getExistingSchedule } from '../da-prepare/actions/scheduler/utils.js';
import inlinesvg from '../../shared/inlinesvg.js';
import getSheet from '../../shared/sheet.js';

const sheet = await getSheet('/blocks/edit/da-title/da-title.css');

const ICONS = [
  '/blocks/edit/img/Smock_Cloud_18_N.svg',
  '/blocks/edit/img/Smock_CloudDisconnected_18_N.svg',
  '/blocks/edit/img/Smock_CloudError_18_N.svg',
  '/blocks/edit/img/cloud_refresh.svg',
];

const CLOUD_ICONS = {
  connected: 'spectrum-Cloud-connected',
  disconnected: 'spectrum-Cloud-offline',
  offline: 'spectrum-Cloud-offline',
  connecting: 'cloud_refresh',
  error: 'spectrum-Cloud-error',
};

export default class DaTitle extends LitElement {
  static properties = {
    details: { attribute: false },
    permissions: { attribute: false },
    collabStatus: { attribute: false },
    collabUsers: { attribute: false },
    previewPrefix: { attribute: false },
    livePrefix: { attribute: false },
    _actionsVis: { state: true },
    _status: { state: true },
    _fixedActions: { state: true },
    _dialog: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this._actionsVis = [];
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

    import('../da-prepare/da-prepare.js');
  }

  handleError(json, action, icon) {
    console.log('handleError', json, action, icon);
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

  getCdnHref(url, action, cdn) {
    const hostname = action === 'publish' ? cdn.prod : cdn.preview;
    if (!hostname) return url.href;
    return url.href.replace(url.origin, `https://${hostname}`);
  }

  async hasSchedulePublish() {
    const { org, site } = this.details;
    const configs = await Promise.all([
      fetchDaConfig({ path: `/${org}` }),
      fetchDaConfig({ path: `/${org}/${site}` }),
    ]);
    const prepareItems = [
      ...(configs[0]?.prepare?.data || []),
      ...(configs[1]?.prepare?.data || []),
    ];
    return prepareItems.some((item) => item.title === 'Schedule Publish');
  }

  async checkScheduleConflict() {
    const { org, site, path, view } = this.details;
    if (!org || !site || !path) return true;

    let pagePath = path.replace(/\.html$/, '');
    if (view === 'sheet' && !path.endsWith('.json')) pagePath = `${path}.json`;

    try {
      const schedule = await getExistingSchedule(org, site, pagePath);
      if (!schedule?.scheduledPublish) return true;
      return this.confirmScheduledPublish(schedule);
    } catch {
      return true;
    }
  }

  async confirmScheduledPublish(schedule) {
    await import('../../shared/da-dialog/da-dialog.js');

    return new Promise((resolve) => {
      const time = new Date(schedule.scheduledPublish).toLocaleString();
      const user = schedule.userId;
      const info = user ? `${time} by ${user}` : time;

      const title = 'Page already scheduled';
      const content = html`
        <p>This page is already scheduled to publish:</p>
        <p><strong>${info}</strong></p>
        <p>Publishing now will override the scheduled publish. Continue?</p>
      `;
      const action = {
        style: 'accent',
        label: 'Publish anyway',
        click: () => { this._dialog = undefined; resolve(true); },
      };
      const close = () => { this._dialog = undefined; resolve(false); };

      this._dialog = { title, content, action, close };
    });
  }

  async handleAction(action) {
    if (action === 'publish' && await this.hasSchedulePublish()) {
      const shouldContinue = await this.checkScheduleConflict();
      if (!shouldContinue) return;
    }

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
        // eslint-disable-next-line no-console
        console.log('Saving configuration failed because:', daConfigResp.status, await daConfigResp.text());
        return;
      }
    }
    if (action === 'preview' || action === 'publish') {
      const cdn = await getCdnConfig(pathname);

      const aemPath = this.sheet ? `${pathname}.json` : pathname;
      let json = await saveToAem(aemPath, 'preview');
      if (json.error) {
        this.handleError(json, 'preview', sendBtn);
        return;
      }
      if (action === 'publish') json = await saveToAem(aemPath, 'live');
      if (json.error) {
        this.handleError(json, 'publish', sendBtn);
        return;
      }
      const { url: href } = action === 'publish' ? json.live : json.preview;
      const url = new URL(href);
      const isSnap = url.pathname.startsWith('/.snapshots');
      const toOpen = isSnap ? this.getSnapshotHref(url, action) : this.getCdnHref(url, action, cdn);
      let toOpenInAem = toOpen.replace('.hlx.', '.aem.');

      if (this.previewPrefix || this.livePrefix) {
        const { pathname: path } = new URL(toOpenInAem);
        const origin = action === 'publish' ? this.livePrefix : this.previewPrefix;
        toOpenInAem = `${origin}${path}`;
      }

      window.open(`${toOpenInAem}?nocache=${Date.now()}`, toOpenInAem);
    }
    if (this.details.view === 'edit' && action === 'publish') saveDaVersion(pathname);
    sendBtn.classList.remove('is-sending');
  }

  async handleRoleRequest() {
    this._dialog = undefined;
    await import('../../shared/da-dialog/da-dialog.js');

    const { owner: org, repo: site } = this.details;

    const title = 'Role request';

    const action = {
      style: 'accent',
      label: 'OK',
      click: async () => { this._dialog = undefined; },
      disabled: true,
    };

    let content = html`<p>Requesting ${this._status.action} permissions...</p>`;
    this._dialog = { title, content, action };

    const { message } = await requestRole(org, site, this._status.action);

    content = html`<p>${message[0]}</p><p>${message[1]}</p>`;

    const closeAction = { ...action, disabled: false };
    this._dialog = { title, content, action: closeAction };
  }

  async fetchConfig() {
    const { owner, repo } = this.details;
    const loaded = await Promise.all([
      fetchDaConfig({ path: `/${owner}` }),
      fetchDaConfig({ path: `/${owner}/${repo}` }),
    ]);
    return {
      org: getFirstSheet(loaded[0]),
      site: getFirstSheet(loaded[1]),
    };
  }

  async toggleActions() {
    // toggle off if already on
    if (this._actionsVis.length > 0) {
      this._actionsVis = [];
      return;
    }

    // toggle on for config
    if (this.details.view === 'config') {
      this._actionsVis = ['save'];
      return;
    }

    // check which actions should be allowed for the document based on config
    const config = await this.fetchConfig();
    const { fullpath } = this.details;

    const allConfigs = [...config.org, ...config.site];
    const publishButtonConfigs = allConfigs.filter((c) => c.key === 'editor.hidePublish');
    const hasMatchingPublishConfig = publishButtonConfigs.some((c) => fullpath.startsWith(c.value));

    this._actionsVis = hasMatchingPublishConfig ? ['preview'] : ['preview', 'publish'];
  }

  get _canPrepare() {
    return this.details.view === 'edit' || this.details.view === 'sheet';
  }

  get _readOnly() {
    if (!this.permissions) return false;
    return !this.permissions.some((permission) => permission === 'write');
  }

  renderActions() {
    return html`${this._actionsVis.map((action) => html`
      <button
        @click=${() => this.handleAction(action)}
        class="con-button blue da-title-action"
        aria-label="Send">
        ${action.charAt(0).toUpperCase() + action.slice(1)}
      </button>
    `)}`;
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

  renderDialog() {
    return html`
      <da-dialog
        title=${this._dialog.title}
        .message=${this._dialog.message}
        .action=${this._dialog.action}
        @close=${this._dialog.close}>
        ${this._dialog.content}
      </da-dialog>
    `;
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

  renderError() {
    return html`
      <div class="da-title-error">
        <p><strong>${this._status.message}</strong></p>
        ${this._status.details ? html`<p>${this._status.details}</p>` : nothing}
        ${this._status.status === 403 ? html`<button @click=${this.handleRoleRequest}>Request access</button>` : nothing}
      </div>`;
  }

  render() {
    return html`
      <div class="da-title-inner ${this._readOnly ? 'is-read-only' : ''}">
        <div class="da-title-name">
          <a
            href="/#${this.details.parent}"
            class="da-title-name-label">${this.details.parentName}</a>
          <h1>${this.details.name}</h1>
        </div>
        <div class="da-title-collab-actions-wrapper">
          ${this.collabStatus ? this.renderCollab() : nothing}
          ${this._canPrepare ? html`<da-prepare .details=${this.details}></da-prepare>` : nothing}
          ${this._status ? this.renderError() : nothing}
          <div class="da-title-actions ${this._fixedActions ? 'is-fixed' : ''} ${this._actionsVis.length > 0 ? 'is-open' : ''}">
            ${this.renderActions()}
            <button
              @click=${this.toggleActions}
              class="con-button blue da-title-action-send"
              aria-label="Send">
              <svg class="da-title-action-send-icon" viewBox="0 0 20 20">
                <use href="/blocks/edit/img/S2_Icon_Publish_20_N.svg#S2_Icon_Publish"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
      ${this._dialog ? this.renderDialog() : nothing}
    `;
  }
}

customElements.define('da-title', DaTitle);
