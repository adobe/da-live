import { DOMParser as proseDOMParser } from 'da-y-wrapper';
import { LitElement, html, until } from '../../../deps/lit/lit-all.min.js';
import { getBlocks, getBlockVariants } from './helpers/index.js';
import getSheet from '../../shared/sheet.js';
import inlinesvg from '../../shared/inlinesvg.js';
import { getItems, getLibraryList } from './helpers/helpers.js';
import { aem2prose } from '../utils/helpers.js';
import { daFetch } from '../../shared/utils.js';

const sheet = await getSheet('/blocks/edit/da-library/da-library.css');

const ICONS = [
  '/blocks/edit/img/Smock_ExperienceAdd_18_N.svg',
  '/blocks/browse/img/Smock_ChevronRight_18_N.svg',
  '/blocks/edit/img/Smock_AddCircle_18_N.svg',
];

let accessToken;

class DaLibrary extends LitElement {
  static properties = {
    _libraryList: { state: true },
    _libraryDetails: { state: true },
    _isSearching: { state: true },
  };

  constructor() {
    super();
    this._libraryList = [];
    this._libraryDetails = {};
  }

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    inlinesvg({ parent: this.shadowRoot, paths: ICONS });
    this._libraryList = await getLibraryList();
  }

  handleLibSwitch(e) {
    const { target } = e;
    const type = target.classList[0];
    target.closest('.palette-pane').classList.add('backward');
    const toShow = this.shadowRoot.querySelector(`[data-library-type="${type}"]`);
    this._title = toShow.dataset.libraryName;
    toShow.classList.remove('forward');
  }

  handleBack(e) {
    const { target } = e;
    target.closest('.palette-pane').classList.add('forward');
    const wrapper = target.closest('.palette-wrapper');
    const previous = wrapper.querySelector('.backward');
    previous.classList.remove('backward');
  }

  handleSearch({ target }) {
    this._isSearching = !!target.value;
  }

  handleGroupOpen(e) {
    const { target } = e;
    target.closest('li').classList.toggle('is-open');
  }

  handleItemClick(item) {
    const { tr } = window.view.state;
    window.view.dispatch(tr.replaceSelectionWith(item.parsed).scrollIntoView());
  }

  async handleTemplateClick(item) {
    const resp = await daFetch(`${item.value}`);
    if (!resp.ok) return;
    const text = await resp.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const proseDom = aem2prose(doc);
    const flattedDom = document.createElement('div');
    flattedDom.append(...proseDom);
    const newNodes = proseDOMParser.fromSchema(window.view.state.schema).parse(flattedDom);
    window.view.dispatch(window.view.state.tr.replaceSelectionWith(newNodes));
  }

  getParts() {
    const view = 'edit';
    const [org, repo, ...path] = window.location.hash.replace('#/', '').split('/');
    return { view, org, repo, ref: 'main', path: `/${path.join('/')}` };
  }

  async handlePluginLoad({ target }) {
    const channel = new MessageChannel();
    channel.port1.onmessage = (e) => {
      if (e.data) {
        const para = window.view.state.schema.text(e.data);
        window.view.dispatch(window.view.state.tr.replaceSelectionWith(para));
      }
    };

    if (!accessToken) {
      const { initIms } = await import('../../shared/utils.js');
      ({ accessToken } = await initIms());
    }

    setTimeout(() => {
      const project = this.getParts();

      const message = {
        ready: true,
        project,
        context: project,
      };
      if (accessToken) message.token = accessToken;
      target.contentWindow.postMessage(message, '*', [channel.port2]);
    }, 750);
  }

  async renderGroupDetail(path) {
    const items = await getBlockVariants(path);
    return html`
      ${items.map((item) => html`
        <li class="da-library-type-group-detail-item">
          <button @click=${() => this.handleItemClick(item)}>
            <div>
              <span class="da-library-group-name">${item.name}</span>
              <span class="da-library-group-subtitle">${item.variants}</span>
            </div>
            <svg class="icon"><use href="#spectrum-ExperienceAdd"/></svg>
          </button>
        </li>
      `)}`;
  }

  renderGroups(groups) {
    return html`
      <ul class="da-library-type-list">
        ${groups.map((group) => html`
          <li class="da-library-type-group">
            <button class="da-library-type-group-title" @click=${this.handleGroupOpen}>
              <span class="name">${group.name}</span>
              <svg class="icon"><use href="#spectrum-chevronRight"/></svg>
            </button>
            <ul class="da-library-type-group-details">
              ${until(this.renderGroupDetail(group.path), html`<span>Loading...</span>`)}
            </ul>
          </li>
        `)}
      </ul>`;
  }

  async renderIcon(url) {
    const [icon] = await inlinesvg({ paths: [url] });
    icon.classList.add('icon-preview');
    return icon;
  }

  renderAssets(items) {
    return html`
      <ul class="da-library-type-list-assets">
      ${items.map((item) => html`
        <li class="da-library-asset-item">
          <button class="da-library-type-asset-btn"
            @click=${() => this.handleItemClick(item)}>
            <img src="${item.path}" />
            <svg class="icon"><use href="#spectrum-AddCircle"/></svg>
          </button>
        </li>`)}
      </ul>
    `;
  }

  renderTemplates(items, listName) {
    return html`
      <ul class="da-library-type-list da-library-type-list-${listName}">
      ${items.map((item) => html`
        <li class="da-library-type-item">
          <button class="da-library-type-item-btn"
            @click=${() => this.handleTemplateClick(item)}>
            <div class="da-library-type-item-detail">
              <span>${item.key}</span>
              <svg class="icon">
                <use href="#spectrum-AddCircle"/>
              </svg>
            </div>
          </button>
        </li>`)}
      </ul>`;
  }

  renderItems(items, listName) {
    return html`
      <ul class="da-library-type-list da-library-type-list-${listName}">
      ${items.map((item) => {
    const name = item.value || item.name || item.key;
    if (!name) return null;
    return html`
        <li class="da-library-type-item">
          <button class="da-library-type-item-btn"
            @click=${() => this.handleItemClick(item)}>
            <div class="da-library-type-item-detail">
              ${item.icon ? until(this.renderIcon(item.icon)) : ''}
              <span>${name}</span>
              <svg class="icon">
                <use href="#spectrum-AddCircle"/>
              </svg>
            </div>
          </button>
        </li>`;
  })}
      </ul>`;
  }

  renderPlugin(url) {
    return html`
      <div class="da-library-type-plugin">
        <iframe
          src="${url}"
          @load=${this.handlePluginLoad}
          allow="clipboard-write *"
          scrolling="no"></iframe>
      </div>`;
  }

  async renderLibrary({ name, sources, url, format }) {
    // Only plugins have a URL
    if (url) {
      return this.renderPlugin(url);
    }

    if (name === 'blocks') {
      const blocks = await getBlocks(sources);
      return this.renderGroups(blocks);
    }

    const items = await getItems(sources, name, format);
    if (items.length > 0) {
      if (name === 'templates') return this.renderTemplates(items, name);
      if (name === 'media') return this.renderAssets(items);
      return this.renderItems(items, name);
    }
    return html`${name}`;
  }

  render() {
    return html`
      <div class="palette-wrapper">
        <div class="palette-pane">
          <div class="palette-pane-header">
            <h2>Library</h2>
          </div>
          <div class="da-library-search">
            <input class="da-library-search-input" name="search" type="text" @input=${this.handleSearch} placeholder="Search everything" />
            ${this._isSearching ? html`<button class="da-library-search-close">Close</button>` : html``}
          </div>
          ${this._isSearching ? html`This feature doesn't exist... yet.` : html`
            <ul class="da-library-item-list da-library-item-list-main">
              ${this._libraryList.map((library) => html`
                <li>
                  <button class="${library.name} ${library.url ? 'is-plugin' : ''}" @click=${this.handleLibSwitch}>
                    <span class="library-type-name">${library.name}</span>
                  </button>
                </li>
              `)}
            </ul>
          `}
        </div>
        ${this._libraryList.map((library) => html`
          <div class="palette-pane forward" data-library-type="${library.name}">
            <div class="palette-pane-header">
              <button class="palette-back" @click=${this.handleBack}>Back</button>
              <h2>${library.name}</h2>
            </div>
            ${until(this.renderLibrary(library), html`<span>Loading...</span>`)}
          </div>
        `)}
      </div>
    `;
  }
}

customElements.define('da-library', DaLibrary);

const CLOSE_DROPDOWNS_EVENT = 'pm-close-dropdowns';

export default function open() {
  const palettePane = window.view.dom.nextElementSibling;
  const existingPalette = palettePane.querySelector('da-library');
  if (existingPalette) {
    existingPalette.remove();
    return;
  }
  // close any other dropdowns
  window.dispatchEvent(new CustomEvent(CLOSE_DROPDOWNS_EVENT));

  const palette = document.createElement('da-library');
  palettePane.append(palette);

  const closePaletteListener = () => {
    palette.remove();
    window.removeEventListener(CLOSE_DROPDOWNS_EVENT, closePaletteListener);
  };
  window.addEventListener(CLOSE_DROPDOWNS_EVENT, closePaletteListener);
}
