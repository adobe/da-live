import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import { fetchDaConfigs, getPostMessageTargetOrigin } from '../../shared/utils.js';
import { ensurePreviewProxySession, toPreviewProxyUrl } from '../../shared/preview-proxy.js';
import { getPreviewOrigin } from './editor-utils.js';
import { canvasBus } from '../utils/canvas-bus.js';
import { getCanvasBranch } from '../utils/branch.js';
import { initPreflightBridge, reportPreflightStatus } from './preflight-bridge.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
await import(`${getNx()}/blocks/shared/popover/popover.js`);

const style = await loadStyle(import.meta.url);

function resolveMenuItem(item, details) {
  const { org, site } = details || {};
  const branch = getCanvasBranch({ org, site });
  if (!branch) return { ...item, disabled: Boolean(item.path && !item.render) };
  const fallback = { org, site, branch, currentOrg: org };
  fallback.getUrl = getPreviewOrigin;
  return {
    ...item,
    path: item.path ? toPreviewProxyUrl(item.path, fallback) : item.path,
    icon: item.icon ? toPreviewProxyUrl(item.icon, fallback) : item.icon,
  };
}

function isSvgSymbol(icon) {
  if (typeof icon !== 'string' || !icon) return false;
  return icon.startsWith('#') || icon.includes('.svg#');
}

export function readSdkMode(item) {
  const raw = item?.sdk;
  const value = raw === undefined || raw === null ? '' : String(raw).trim();
  if (value === '' || value === '1') return 'legacy';
  if (value === '2') return 'sdk2';
  return 'invalid';
}

const OOTB_ACTIONS = [
  {
    title: 'Preflight',
    render: async (details) => (await import('../../edit/da-prepare/actions/preflight/preflight.js')).default(details),
    icon: '/img/icons/s2-icon-filetext-20-n.svg#icon',
  },
  {
    title: 'Schedule Publish',
    render: async (details) => (await import('../../edit/da-prepare/actions/scheduler/scheduler.js')).default(details),
    icon: '/img/icons/s2-icon-clock-pending-20-n.svg#icon',
    optional: true,
  },
  {
    title: 'Unpublish',
    render: async (details) => (await import('../../edit/da-prepare/actions/unpublish/unpublish.js')).default(details),
    icon: '/img/icons/s2-icon-publish-no-20-n.svg#icon',
  },
  {
    title: 'Send to Adobe Target',
    render: async (details) => (await import('../../edit/da-prepare/actions/target/target.js')).default(details),
    icon: '/img/icons/s2-icon-target-20-n.svg#icon',
    optional: true,
  },
];

export default class PrepareMenu extends LitElement {
  static properties = {
    details: { attribute: false },
    _menuItems: { state: true },
    _dialogItem: { state: true },
    _fullsizeDialogItem: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    initPreflightBridge();
    this._unsubs = [
      canvasBus.preflightRunRequest.subscribe(this.handlePreflightRun),
      canvasBus.preflightStatusState.subscribe(this.handlePreflightStatus),
      canvasBus.branchState.subscribe(() => { if (this.details) this.loadMenu(); }),
    ];
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.closeExtension();
    this._unsubs?.forEach((unsub) => unsub());
    this._unsubs = null;
  }

  update(props) {
    if (props.has('details')) {
      this.reset();
      this.loadMenu();
    }
    super.update();
  }

  firstUpdated() {
    import('../../shared/da-dialog/da-dialog.js');
  }

  closeExtension() {
    this._extGen = (this._extGen || 0) + 1;
    this._ext?.close();
    this._ext = undefined;
    this._extIframe = undefined;
  }

  async connectExtension(iframe) {
    this.closeExtension();
    this._extIframe = iframe;
    const gen = this._extGen;
    const { connectExtension } = await import(`${getNx2()}/utils/extension-host.js`);
    if (gen !== this._extGen) return;
    const { view, org, site, path } = this.details;
    const context = {
      view, org, site, repo: site, ref: 'main', path,
    };
    this._ext = connectExtension({ iframe, context });
  }

  syncExtension() {
    const iframe = this.shadowRoot.querySelector('iframe[data-sdk2]');
    if (!iframe) {
      if (this._extIframe) this.closeExtension();
      return;
    }
    if (iframe !== this._extIframe) this.connectExtension(iframe);
  }

  reset() {
    this.closeExtension();
    const dialog = this.shadowRoot.querySelector('.prepare-fullsize-dialog');
    if (dialog?.open) dialog.close();
    this._menuItems = undefined;
    this._dialogItem = undefined;
    this._fullsizeDialogItem = undefined;
  }

  updated(changed) {
    this.syncExtension();
    if (changed.has('_fullsizeDialogItem') && this._fullsizeDialogItem) {
      const dialog = this.shadowRoot.querySelector('.prepare-fullsize-dialog');
      if (dialog && !dialog.open) dialog.showModal();
    }
  }

  async loadMenu() {
    const { details } = this;
    if (!details) return;
    const [org, site] = await Promise.all(
      fetchDaConfigs({ org: details.org, site: details.site }),
    );
    if (this.details !== details || !this.isConnected) return;

    const ootbLookup = new Map(OOTB_ACTIONS.map((item) => [item.title, item]));

    // Priority order: ootb → org → site (later overrides earlier)
    // Optional OOTB items excluded by default, but available via lookup
    const configs = [
      OOTB_ACTIONS.filter((item) => !item.optional),
      org?.prepare?.data || [],
      site?.prepare?.data || [],
    ];

    const merged = new Map(
      configs.flatMap((items) => items.map((item) => [item.title, item])),
    );

    // For config items without path or render, fallback to OOTB if available
    this._menuItems = [...merged.values()].filter((item) => {
      if (readSdkMode(item) !== 'invalid') return true;
      // eslint-disable-next-line no-console
      console.warn(`prepare menu: hiding "${item.title}", invalid sdk value "${item.sdk}"`);
      return false;
    }).map((item) => {
      const resolved = item.path || item.render ? item : ootbLookup.get(item.title) || item;
      return resolveMenuItem(resolved, this.details);
    });
  }

  toggle(anchor) {
    const popover = this.shadowRoot.querySelector('nx-popover');
    if (!popover) return;
    if (popover.open) popover.close();
    else popover.show({ anchor, placement: 'below-end' });
  }

  _onPopoverClose() {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  async handleItemClick(item) {
    if (item.disabled) return;
    this._preflightRequestId = undefined;
    this.shadowRoot.querySelector('nx-popover').close();
    if (item.render) {
      const cmp = await item.render(this.details);
      this._dialogItem = { ...item, cmp };
      return;
    }
    const branch = getCanvasBranch(this.details);
    if (!branch) return;
    await ensurePreviewProxySession(item.path, {
      org: this.details?.org,
      site: this.details?.site,
      branch,
      currentOrg: this.details?.org,
      getUrl: getPreviewOrigin,
    });
    if (item.experience === 'fullsize-dialog') {
      this._fullsizeDialogItem = item;
      return;
    }
    this._dialogItem = item;
  }

  handlePreflightRun = async (detail) => {
    const { paths, requestId } = detail || {};
    if (!paths || paths.length !== 1 || paths[0] !== this.details?.fullpath) return;
    this.shadowRoot.querySelector('nx-popover')?.close();
    const render = (await import('../../edit/da-prepare/actions/preflight/preflight.js')).default;
    const cmp = render(this.details, requestId);
    this._preflightRequestId = requestId;
    this._dialogItem = { title: 'Preflight', cmp };
  };

  handlePreflightStatus = (detail) => {
    const { requestId, status } = detail || {};
    if (!this._preflightRequestId || requestId !== this._preflightRequestId) return;
    if (status === 'success') {
      this._dialogItem = undefined;
      this._preflightRequestId = undefined;
    }
  };

  handleCloseDialog() {
    if (this._preflightRequestId) {
      reportPreflightStatus({
        path: this.details?.fullpath,
        status: 'cancelled',
        requestId: this._preflightRequestId,
      });
    }
    this.closeExtension();
    this._dialogItem = undefined;
    this._preflightRequestId = undefined;
  }

  handleCloseFullsizeDialog({ target } = {}) {
    const dialog = target?.closest?.('.prepare-fullsize-dialog');
    if (dialog?.open) dialog.close();
    this.closeExtension();
    this._fullsizeDialogItem = undefined;
  }

  handleIframeLoad({ target }) {
    if (target.hasAttribute('data-sdk2')) return;
    const loadedSrc = target.src;
    const targetOrigin = getPostMessageTargetOrigin(loadedSrc);
    const channel = new MessageChannel();

    setTimeout(() => {
      // Lit can reuse this iframe for an SDK2 row before the timer fires.
      if (!target.contentWindow || target.hasAttribute('data-sdk2') || target.src !== loadedSrc) return;

      const { view, org, site, path } = this.details;

      const context = {
        view,
        org,
        site,
        repo: site,
        ref: new URLSearchParams(window.location.search).get('ref') || 'main',
        branch: getCanvasBranch({ org, site }),
        path,
      };
      const { token } = window.adobeIMS.getAccessToken();

      const message = { ready: true, context, token };

      target.contentWindow.postMessage(message, targetOrigin, [channel.port2]);
    }, 750);
  }

  renderDialog() {
    if (!this._dialogItem) return nothing;

    const { cmp } = this._dialogItem;

    return html`
      <da-dialog
        class="da-dialog-block-preview"
        size="auto"
        emphasis="quiet"
        title=${this._dialogItem.title}
        @close=${this.handleCloseDialog}>
        ${cmp || html`<iframe
          src=${this._dialogItem.path}
          ?data-sdk2=${readSdkMode(this._dialogItem) === 'sdk2'}
          @load=${this.handleIframeLoad}
          allow="clipboard-write *"></iframe>`}
      </da-dialog>
    `;
  }

  renderFullsizeDialog() {
    if (!this._fullsizeDialogItem) return nothing;

    return html`
      <dialog
        class="prepare-fullsize-dialog"
        aria-labelledby="prepare-fullsize-dialog-title"
        @close=${this.handleCloseFullsizeDialog}>
        <header class="prepare-fullsize-dialog-header">
          <h2 id="prepare-fullsize-dialog-title" class="prepare-fullsize-dialog-title">
            ${this.renderDialogIcon(this._fullsizeDialogItem)}
            <span>${this._fullsizeDialogItem.title}</span>
          </h2>
          <button
            class="prepare-fullsize-dialog-close"
            type="button"
            aria-label="Close"
            @click=${this.handleCloseFullsizeDialog}>&times;</button>
        </header>
        <div class="prepare-fullsize-dialog-body">
          <iframe
            src=${this._fullsizeDialogItem.path}
            title=${this._fullsizeDialogItem.title}
            ?data-sdk2=${readSdkMode(this._fullsizeDialogItem) === 'sdk2'}
            @load=${this.handleIframeLoad}
            allow="clipboard-write *"></iframe>
        </div>
      </dialog>
    `;
  }

  renderDialogIcon(item) {
    if (!item.icon) return nothing;
    if (isSvgSymbol(item.icon)) {
      return html`<svg aria-hidden="true" class="prepare-dialog-icon" viewBox="0 0 20 20"><use href="${item.icon}"/></svg>`;
    }
    return html`<img class="prepare-dialog-icon" src="${item.icon}" alt="" />`;
  }

  renderIcon(item) {
    if (!item.icon) return html`<span class="icon" aria-hidden="true"></span>`;
    if (isSvgSymbol(item.icon)) {
      return html`<svg class="icon" viewBox="0 0 20 20"><use href="${item.icon}"/></svg>`;
    }
    return html`<img class="icon" src="${item.icon}" alt="" />`;
  }

  render() {
    if (!this._menuItems) return nothing;

    return html`
      <nx-popover placement="below-end" @close=${this._onPopoverClose}>
        <div class="prepare-menu" role="menu">
          ${this._menuItems.map((item) => html`
            <button type="button" class="prepare-menu-item" role="menuitem" ?disabled=${item.disabled} @click=${() => this.handleItemClick(item)}>
              ${this.renderIcon(item)}
              <span>${item.title}</span>
            </button>
          `)}
        </div>
      </nx-popover>
      ${this.renderDialog()}
      ${this.renderFullsizeDialog()}
    `;
  }
}

customElements.define('prepare-menu', PrepareMenu);
