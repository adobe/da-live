import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { fetchDaConfigs, getPostMessageTargetOrigin } from '../../shared/utils.js';
import { canvasBus } from '../utils/canvas-bus.js';
import { initPreflightBridge } from './preflight-bridge.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const { PANEL_EVENT } = await import(`${getNx()}/utils/panel.js`);
await import(`${getNx()}/blocks/shared/popover/popover.js`);

const style = await loadStyle(import.meta.url);

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
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    initPreflightBridge();
    this._unsubs = [
      canvasBus.preflightRunRequest.subscribe(this.handlePreflightRun),
    ];
  }

  disconnectedCallback() {
    super.disconnectedCallback();
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

  reset() {
    this._menuItems = undefined;
    this._dialogItem = undefined;
  }

  async loadMenu() {
    const [org, site] = await Promise.all(
      fetchDaConfigs({ org: this.details.org, site: this.details.site }),
    );

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
    this._menuItems = [...merged.values()].map(
      (item) => (item.path || item.render ? item : ootbLookup.get(item.title) || item),
    );
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
    this.shadowRoot.querySelector('nx-popover').close();
    if (item.render) {
      const cmp = await item.render(this.details);
      this._dialogItem = { ...item, cmp };
      return;
    }
    this._dialogItem = item;
  }

  // The Preflight panel lives in canvas's tools rail, not this menu - reveal/activate it
  // instead of opening a dialog. ew-preflight.js does the actual run + status report.
  handlePreflightRun = (detail) => {
    const { paths } = detail || {};
    if (!paths || paths.length !== 1 || paths[0] !== this.details?.fullpath) return;
    this.shadowRoot.querySelector('nx-popover')?.close();
    document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, { detail: { section: 'tools', id: 'preflight' } }));
  };

  handleCloseDialog() {
    this._dialogItem = undefined;
  }

  handleIframeLoad({ target }) {
    const targetOrigin = getPostMessageTargetOrigin(target.src);
    const channel = new MessageChannel();

    setTimeout(() => {
      if (!target.contentWindow) return;

      const { view, org, site, path } = this.details;

      const context = { view, org, site, ref: 'main', path };
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

  renderIcon(item) {
    if (item.icon?.includes('.svg')) {
      return html`<svg class="icon" viewBox="0 0 20 20"><use href="${item.icon}"/></svg>`;
    }
    return html`<img class="icon" src="${item.icon}" />`;
  }

  render() {
    if (!this._menuItems) return nothing;

    return html`
      <nx-popover placement="below-end" @close=${this._onPopoverClose}>
        <div class="prepare-menu" role="menu">
          ${this._menuItems.map((item) => html`
            <button type="button" class="prepare-menu-item" role="menuitem" @click=${() => this.handleItemClick(item)}>
              ${this.renderIcon(item)}
              <span>${item.title}</span>
            </button>
          `)}
        </div>
      </nx-popover>
      ${this.renderDialog()}
    `;
  }
}

customElements.define('prepare-menu', PrepareMenu);
