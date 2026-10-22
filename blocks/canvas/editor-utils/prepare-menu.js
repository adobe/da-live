import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { fetchDaConfigs, getPostMessageTargetOrigin } from '../../shared/utils.js';
import { ensurePreviewProxySession, toPreviewProxyUrl } from '../../shared/preview-proxy.js';
import { getPreviewOrigin } from './editor-utils.js';
import { canvasBus } from '../utils/canvas-bus.js';
import { getCanvasBranch } from '../utils/branch.js';
import { routeComparisonMessage } from '../ew-comparison/comparison.js';

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

const OOTB_ACTIONS = [
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
    this._unsubBranch = canvasBus.branchState.subscribe(() => {
      if (this.details) this.loadMenu();
    });
    this._unsubComparison = canvasBus.comparisonState.subscribe(
      ({ open }) => this.handleComparisonState(open),
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubBranch?.();
    this._unsubBranch = null;
    this._unsubComparison?.();
    this._unsubComparison = null;
    this.closePort();
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

  reset() {
    this.closePort();
    const dialog = this.shadowRoot.querySelector('.prepare-fullsize-dialog');
    if (dialog?.open) dialog.close();
    this._menuItems = undefined;
    this._dialogItem = undefined;
    this._fullsizeDialogItem = undefined;
  }

  updated(changed) {
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
    // Legacy extension model added a custom preflight in the prepare menu
    // Preflight has moved in a side panel and should not longer appear in the prepare menu
    merged.delete('Preflight');

    // For config items without path or render, fallback to OOTB if available
    this._menuItems = [...merged.values()].map((item) => {
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
    this.shadowRoot.querySelector('nx-popover').close();
    if (this._comparison === 'open') {
      this.closePort();
      this._dialogItem = undefined;
      this._fullsizeDialogItem = undefined;
      await this.updateComplete;
    }
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

  handleCloseDialog() {
    if (this._comparison === 'open') return;
    this.closePort();
    this._dialogItem = undefined;
  }

  handleCloseFullsizeDialog({ target } = {}) {
    if (this._comparison === 'open') return;
    this.closePort();
    const dialog = target?.closest?.('.prepare-fullsize-dialog');
    if (dialog?.open) dialog.close();
    this._fullsizeDialogItem = undefined;
  }

  // While a comparison the plugin asked for is shown, the modal dialog steps aside with its
  // iframe still loaded, and comes back when the comparison closes.
  handleComparisonState(open) {
    const dialog = this.shadowRoot.querySelector(this._fullsizeDialogItem ? '.prepare-fullsize-dialog' : 'da-dialog');
    if (open && this._comparison === 'requested') {
      this._comparison = 'open';
      dialog?.close();
    } else if (!open && this._comparison === 'open') {
      this._comparison = undefined;
      dialog?.showModal();
    }
  }

  closePort() {
    this._port?.close();
    this._port = undefined;
    this._comparison = undefined;
  }

  handleIframeLoad({ target }) {
    const targetOrigin = getPostMessageTargetOrigin(target.src);
    const channel = new MessageChannel();
    const { view, org, site, path } = this.details;
    this.closePort();
    this._port = channel.port1;
    channel.port1.onmessage = ({ data }) => {
      if (data?.action === 'openComparison' && !this._comparison) this._comparison = 'requested';
      routeComparisonMessage(data || {}, { context: { org, site, path }, port: channel.port1 });
    };

    setTimeout(() => {
      if (!target.contentWindow) return;

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
