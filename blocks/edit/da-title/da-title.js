import { LitElement, html, nothing } from 'da-lit';
import {
  requestRole,
  saveToDa,
  saveToAem,
  saveDaConfig,
  saveDaVersion,
  getCdnConfig,
} from '../utils/helpers.js';
import { DA_ORIGIN } from '../../shared/constants.js';
import { daFetch } from '../../shared/utils.js';
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
    _dialog: { state: true },
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

  getCdnHref(url, action, cdn) {
    const hostname = action === 'publish' ? cdn.prod : cdn.preview;
    if (!hostname) return url.href;
    return url.href.replace(url.origin, `https://${hostname}`);
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
        // eslint-disable-next-line no-console
        console.log('Saving configuration failed because:', daConfigResp.status, await daConfigResp.text());
        return;
      }
    }
    if (action === 'preview' || action === 'publish') {
      const cdn = await getCdnConfig(pathname);
      const aemPath = this.sheet ? `${pathname}.json` : pathname;

      if (action === 'publish') {
        // Fire preview immediately
        saveToAem(aemPath, 'preview').catch((error) => {
          // eslint-disable-next-line no-console
          console.log('Preview failed during publish:', error);
        });

        // Check if preflight dialog is configured in DA config
        const [org, repo] = pathname.slice(1).toLowerCase().split('/');
        const configResp = await daFetch(`${DA_ORIGIN}/config/${org}/${repo}/`);
        const daConfig = configResp.ok ? await configResp.json() : {};
        const publishActions = daConfig.data?.data?.find((item) => item.key === 'publish.actions');
        const showPreflight = publishActions?.value === 'preflight';

        if (showPreflight) {
          this._publishState = { pathname, aemPath, cdn, sendBtn };
          await this.publishAction({
            title: 'Ready to Publish?',
            content: html`
              <p>This will publish your changes and make them live.</p>
              <p>Click <strong>Publish</strong> to continue, or close this dialog to cancel.</p>
            `,
            actions: [{
              style: 'accent',
              label: 'Publish',
              click: async () => {
                this._dialog = undefined;
                this.requestUpdate();
                await this.continuePublish();
              },
            }],
            onClose: () => {
              if (this._publishState?.sendBtn) {
                this._publishState.sendBtn.classList.remove('is-sending');
              }
              this._publishState = undefined;
            },
          });
          return;
        }

        // No preflight configured, publish immediately
        this._publishState = { pathname, aemPath, cdn, sendBtn };
        await this.continuePublish();
        return;
      }

      let json = await saveToAem(aemPath, 'preview');
      if (json.error) {
        this.handleError(json, 'preview', sendBtn);
        return;
      }
      const { url: href } = json.preview;
      const url = new URL(href);
      const isSnap = url.pathname.startsWith('/.snapshots');
      const toOpen = isSnap ? this.getSnapshotHref(url, 'preview') : this.getCdnHref(url, 'preview', cdn);
      const toOpenInAem = toOpen.replace('.hlx.', '.aem.');
      window.open(`${toOpenInAem}?nocache=${Date.now()}`, toOpenInAem);
    }
    sendBtn.classList.remove('is-sending');
  }

  /**
   * Handles an action with customizable presentation (dialog, notification, etc).
   * @param {Object} config - Action configuration
   * @param {string} config.title - Action title
   * @param {TemplateResult} config.content - Action content (HTML template)
   * @param {Array} config.actions - Array of action objects (0 to many)
   *   Each action: { style: string, label: string, click: function }
   * @param {Function} config.onClose - Optional callback when action closes
   * @returns {Promise<void>}
   */
  async publishAction({ title, content, actions = [], onClose }) {
    await import('../../shared/da-dialog/da-dialog.js');

    const close = () => {
      this._dialog = undefined;
      if (onClose) onClose();
    };

    // Use first action for now; can be extended to support multiple actions
    const action = actions.length > 0 ? actions[0] : undefined;

    this._dialog = { title, content, action, close };
    this.requestUpdate();
  }

  async continuePublish() {
    if (!this._publishState) return;
    const { pathname, aemPath, cdn, sendBtn } = this._publishState;
    const json = await saveToAem(aemPath, 'live');
    if (json.error) {
      this.handleError(json, 'publish', sendBtn);
      this._publishState = undefined;
      return;
    }
    const { url: href } = json.live;
    const url = new URL(href);
    const isSnap = url.pathname.startsWith('/.snapshots');
    const toOpen = isSnap ? this.getSnapshotHref(url, 'publish') : this.getCdnHref(url, 'publish', cdn);
    const toOpenInAem = toOpen.replace('.hlx.', '.aem.');
    window.open(`${toOpenInAem}?nocache=${Date.now()}`, toOpenInAem);
    if (this.details.view === 'edit') saveDaVersion(pathname);
    sendBtn.classList.remove('is-sending');
    this._publishState = undefined;
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
          ${this._status ? this.renderError() : nothing}
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
      ${this._dialog ? this.renderDialog() : nothing}
    `;
  }
}

customElements.define('da-title', DaTitle);
