import { LitElement, html, nothing } from 'da-lit';
import {
  requestRole,
  saveToDa,
  saveToAem,
  saveDaConfig,
  saveDaVersion,
  getAemHrefs,
} from '../utils/helpers.js';
import { delay, fetchDaConfigs, getFirstSheet } from '../../shared/utils.js';
import inlinesvg from '../../shared/inlinesvg.js';
import getSheet from '../../shared/sheet.js';

const sheet = await getSheet('/blocks/edit/da-title/da-title.css');

const SK_EXT_ID = 'igkmdomcgoebiipaifhmpfjhbjccggml';
const LAZY_DELAY = 1500;
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
    disabledText: { attribute: false },
    _lazyMods: { state: true },
    _configs: { state: true },
    _actions: { state: true },
    _status: { state: true },
    _isSending: { state: true },
    _dialog: { state: true },
  };

  constructor() {
    super();
    this._actions = {};
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    inlinesvg({ parent: this.shadowRoot, paths: ICONS });
    this._actionsVis = [];
    if (this.details.view === 'sheet') {
      this.collabStatus = window.navigator.onLine
        ? 'connected'
        : 'offline';

      window.addEventListener('online', () => { this.collabStatus = 'connected'; });
      window.addEventListener('offline', () => { this.collabStatus = 'offline'; });
    }
  }

  update(changed) {
    super.update(changed);
    if (changed.has('details') && this.details) {
      this.setup();
      this.delayedSetup();
    }
  }

  firstUpdated() {
    const observer = new IntersectionObserver((entries) => {
      this._actions.fixed = !entries[0].isIntersecting;
      this.requestUpdate();
    });

    const element = this.shadowRoot.querySelector('h1');
    if (element) observer.observe(element);
  }

  reset() {
    this._scheduled = undefined;
    this._configs = undefined;
  }

  setup() {
    this.reset();
    this._actions = { available: this.getAvailableActions() };
    // Lazily filter the actions down
    this.filterActions();
  }

  getAvailableActions() {
    const { view, path, fullpath } = this.details;

    // Config only gets save
    if (view === 'config') return ['save'];

    // DA app configs only get save
    if (fullpath.includes('/.da/') && view === 'sheet') return ['save'];

    const availableActions = [];

    if (view === 'sheet') {
      availableActions.push('save');
    }

    if (path) {
      availableActions.push('preview', 'publish');
    }

    return availableActions;
  }

  async filterActions() {
    const { org, site, fullpath } = this.details;
    const configs = await Promise.all(fetchDaConfigs({ org, site }));
    const configTab = configs.flatMap((config) => getFirstSheet(config) || []);

    // Check which actions should be allowed for the document based on config
    const publishConfigs = configTab.filter((c) => c.key === 'editor.hidePublish');
    const hidePublish = publishConfigs.some((c) => fullpath.startsWith(c.value));
    if (!hidePublish) return;

    this._actions.available = this._actions.available.filter((action) => action !== 'publish');
    this.requestUpdate();
  }

  // Run setup after a short delay.
  async delayedSetup() {
    await delay(LAZY_DELAY);

    // Only set lazy modules if they do not exist
    this._lazyMods ??= new Map([
      ['da-prepare', import('../da-prepare/da-prepare.js')],
      ['da-dialog', import('../../shared/da-dialog/da-dialog.js')],
      ['da-schedule', import('../da-prepare/actions/scheduler/utils.js')],
    ]);

    const { org, site, path, fullpath } = this.details;

    // Only a valid path gets AEM-bound features
    if (path) {
      this._aemHrefs = await getAemHrefs({ path: fullpath });
      this._scheduled = await this.getSchedule(org, site, path);
    }
  }

  async getSchedule(org, site, path) {
    const { getExistingSchedule } = await this._lazyMods.get('da-schedule');
    return getExistingSchedule(org, site, path);
  }

  toggleActions() {
    this._actions.open = !this._actions.open;
    this.requestUpdate();
  }

  handleSuccess(action) {
    const opts = { detail: { action }, composed: true, bubbles: true };
    const event = new CustomEvent('success', opts);
    this.dispatchEvent(event);
  }

  handleError(json, action) {
    this._status = { ...json.error, action };
    this._isSending = false;
  }

  async setScheduledDialog(schedule) {
    // Ensure dialog is loaded
    await this._lazyMods['da-dialog'];

    return new Promise((resolve) => {
      const time = new Date(schedule.scheduledPublish).toLocaleString();
      const user = schedule.userId;
      const info = user ? `${time} by ${user}` : time;

      const title = 'Scheduled content';
      const content = html`
        <p>This content is already scheduled to publish:</p>
        <p><strong>${info}</strong></p>
        <p>Publishing now will override the scheduled publish. Continue?</p>
      `;
      const action = {
        style: 'accent',
        label: 'Publish anyway',
        click: () => {
          this._dialog = undefined;
          resolve(true);
        },
      };
      const close = () => {
        this._dialog = undefined;
        resolve(false);
      };

      this._dialog = { title, content, action, close };
    });
  }

  /**
   * Attempt to have Sidekick bust the author's cache
   * @param {String} toOpen the href to open
   * @returns {Promise<void>}
   */
  async sidekickCacheBust(toOpen) {
    if (!window.chrome) return;
    try {
      const opts = { action: 'bustCache', host: new URL(toOpen).hostname };
      const extId = window.localStorage.getItem('aem-sidekick-id') || SK_EXT_ID;

      // Tell AEM Sidekick to bust cache
      await window.chrome.runtime.sendMessage(extId, opts);
    } catch {
      // Gracefully die
    }
  }

  async handleAction(action) {
    this._status = null;
    this._isSending = true;
    this._actions.open = false;

    const { org, site, view, fullpath, path } = this.details;

    const aemPath = `/${org}/${site}${path}`;

    // Bail before writing if the remote drifted under us — protects against
    // last-write-wins. Drift triggers the stale-content dialog via onStale.
    if (view === 'sheet' || view === 'config') {
      const { staleCheck } = await import('../../sheet/utils/utils.js');
      if (await staleCheck.checkForDrift()) {
        this._isSending = false;
        return;
      }
    }

    // Only save to DA if it is a sheet or config
    if (view === 'sheet') {
      const sheetPath = fullpath.replace('.json', '');
      const dasSave = await saveToDa(sheetPath, this.sheet);
      if (!dasSave.ok) return;
    }
    if (view === 'config') {
      const daConfigResp = await saveDaConfig(fullpath, this.sheet);
      if (!daConfigResp.ok) {
        // eslint-disable-next-line no-console
        console.log('Saving configuration failed because:', daConfigResp.status, await daConfigResp.text());
        return;
      }
    }
    if (view === 'sheet' || view === 'config') {
      // Tell anything listening save was successful
      this.handleSuccess('save');
    }

    // AEM Actions
    if (action === 'preview' || action === 'publish') {
      let json = await saveToAem(aemPath, 'preview');
      if (json.error) {
        this.handleError(json, 'preview');
        return;
      }

      // Anything related to publish
      if (action === 'publish') {
        // If lazy setup has not finished, check the schedule manually
        this._scheduled ??= await this.getSchedule(org, site, path);
        if (this._scheduled?.scheduled) {
          const shouldContinue = await this.setScheduledDialog(this._scheduled);
          if (!shouldContinue) {
            this._isSending = false;
            return;
          }
        }
        // Publish to AEM
        json = await saveToAem(aemPath, 'live');
      }

      // Handle all AEM errors
      if (json.error) {
        this.handleError(json, 'publish');
        return;
      }

      // Format the AEM response
      const { url: href } = action === 'publish' ? json.live : json.preview;
      const url = new URL(href);

      let aemTier = url.pathname.startsWith('/.snapshots') ? 'review' : action;
      aemTier = action === 'publish' ? 'prod' : 'preview';
      let toOpen = `${this._aemHrefs[aemTier].origin}${json.webPath}`;

      // Allow BYO editors to pick their own origin
      if (this.previewPrefix || this.livePrefix) {
        const { pathname: byoPath } = new URL(toOpen);
        const origin = action === 'publish' ? this.livePrefix : this.previewPrefix;
        toOpen = `${origin}${byoPath}`;
      }
      // Attempt a Sidekick cache bust
      await this.sidekickCacheBust(toOpen);

      window.open(toOpen, toOpen);
    }

    if (view === 'edit' || view === 'sheet' || view === 'form') {
      if (action === 'publish') saveDaVersion(fullpath, 'Published');
      else if (action === 'preview') saveDaVersion(fullpath, 'Previewed');
    }
    this._isSending = false;
  }

  async handleRoleRequest() {
    // Ensure dialog is loaded
    await this._lazyMods['da-dialog'];

    this._dialog = undefined;

    const { org, site } = this.details;

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

  get _canPrepare() {
    return !!this.details.path;
  }

  get _readOnly() {
    if (!this.permissions) return false;
    return !this.permissions.some((permission) => permission === 'write');
  }

  renderActions() {
    if (!this._actions?.available) return nothing;

    return html`${this._actions.available?.map((action) => html`
      <button
        @click=${() => this.handleAction(action)}
        class="con-button blue da-title-action"
        aria-label="Send"
        data-popup-content=${this.disabledText ?? nothing}
        ?disabled=${this.disabledText}>
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
          <div class="da-title-actions ${this._actions.available?.length === 1 && !this._isSending ? 'has-one-action' : ''} ${this._actions.open ? 'is-open' : ''} ${this._actions.fixed ? 'is-fixed' : ''}">
            ${this.renderActions()}
            <button @click=${this.toggleActions} class="con-button blue da-title-action-send ${this._status ? 'is-error' : ''}" aria-label="Send">
              <svg class="da-title-action-send-icon ${this._isSending ? 'is-sending' : ''}" viewBox="0 0 20 20">
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
