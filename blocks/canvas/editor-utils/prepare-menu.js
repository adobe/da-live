import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { fetchDaConfigs, getPostMessageTargetOrigin } from '../../shared/utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
await import(`${getNx()}/blocks/shared/popover/popover.js`);

const style = await loadStyle(import.meta.url);

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
    if (item.experience === 'fullsize-dialog') {
      this._fullsizeDialogItem = item;
      return;
    }
    this._dialogItem = item;
  }

  handleCloseDialog() {
    this._dialogItem = undefined;
  }

  handleCloseFullsizeDialog({ target } = {}) {
    const dialog = target?.closest?.('.prepare-fullsize-dialog');
    if (dialog?.open) dialog.close();
    this._fullsizeDialogItem = undefined;
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
            <button type="button" class="prepare-menu-item" role="menuitem" @click=${() => this.handleItemClick(item)}>
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
