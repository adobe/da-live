import { LitElement, html, nothing } from 'da-lit';
import { fetchDaConfigs } from '../../shared/utils.js';
import getSheet from '../../shared/sheet.js';

const sheet = await getSheet(import.meta.url.replace('js', 'css'));

const OOTB_ACTIONS = [
  {
    title: 'Preflight',
    render: async (details) => (await import('./actions/preflight/preflight.js')).default(details),
    icon: '/blocks/edit/img/S2_Icon_FileFold_20_N.svg#S2_Icon_FileFold',
  },
  {
    title: 'Schedule Publish',
    render: async (details) => (await import('./actions/scheduler/scheduler.js')).default(details),
    icon: '/blocks/edit/img/S2_Icon_ClockPending_20_N.svg#S2_Icon_ClockPending',
    optional: true,
  },
  {
    title: 'Unpublish',
    render: async (details) => (await import('./actions/unpublish/unpublish.js')).default(details),
    icon: '/blocks/edit/img/S2_Icon_PublishNo_20_N.svg#S2_Icon_PublishNo',
  },
  {
    title: 'Send to Adobe Target',
    render: async (details) => (await import('./actions/target/target.js')).default(details),
    icon: '/blocks/edit/img/S2_Icon_Target_20_N.svg#S2_Icon_Target',
    optional: true,
  },
];

export default class DaPrepare extends LitElement {
  static properties = {
    details: { attribute: false },
    _showMenu: { state: true },
    _menuItems: { state: true },
    _dialogItem: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('pointerdown', this.handleOutsideClick);
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
    this._showMenu = undefined;
    this._menuItems = undefined;
    this._dialogItem = undefined;
  }

  async loadMenu() {
    const { fullpath } = this.details;
    const loading = fetchDaConfigs({ path: fullpath });
    const [org, site] = await Promise.all(loading);

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

    // const preflight = this._menuItems.find((item) => item.title === 'Preflight');
    // this.handleItemClick(preflight);
  }

  handleOutsideClick = (e) => {
    if (e.composedPath().includes(this)) return;
    document.removeEventListener('pointerdown', this.handleOutsideClick);
    this._showMenu = false;
  };

  handleToggle() {
    this._showMenu = !this._showMenu;
    if (this._showMenu) {
      document.addEventListener('pointerdown', this.handleOutsideClick);
    } else {
      document.removeEventListener('pointerdown', this.handleOutsideClick);
    }
  }

  async handleItemClick(item) {
    if (item.render) {
      const cmp = await item.render(this.details);
      this._dialogItem = { ...item, cmp };
      return;
    }
    this._dialogItem = item;
  }

  handleCloseDialog() {
    this._dialogItem = undefined;
  }

  handleIframeLoad({ target }) {
    const channel = new MessageChannel();

    setTimeout(() => {
      if (!target.contentWindow) return;

      const { view, org, site, path } = this.details;

      const context = { view, org, site, ref: 'main', path };
      const { token } = window.adobeIMS.getAccessToken();

      const message = { ready: true, context, token };

      target.contentWindow.postMessage(message, '*', [channel.port2]);
    }, 750);
  }

  renderDialog() {
    if (!this._dialogItem) return nothing;

    // OOTB will have a rendered component
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

  renderPrepareMenu() {
    if (!this._showMenu) return nothing;
    return html`
      <div class="prepare-menu">
        <ul class=""prepare-menu-list">
          ${this._menuItems.map((item) => html`
            <li class="prepare-menu-item prepare-${item.title.toLowerCase().replaceAll(' ', '-')}">
              <button @click=${() => this.handleItemClick(item)}>
                <svg class="icon" viewBox="0 0 20 20"><use href="${item.icon}"/></svg>
                <span>${item.title}</span>
              </button>
            </li>
          `)}
        </ul>
      </div>
    `;
  }

  render() {
    if (!this._menuItems) return nothing;

    return html`
      <div class="prepare-wrapper">
        <button class="da-prepare-toggle" @click=${this.handleToggle}>
          <svg class="icon">
            <use href="/blocks/edit/img/S2_Icon_FileFold_20_N.svg#S2_Icon_FileFold"/>
          </svg>
        </button>
        ${this.renderPrepareMenu()}
      </div>
      ${this.renderDialog()}
    `;
  }
}

customElements.define('da-prepare', DaPrepare);
