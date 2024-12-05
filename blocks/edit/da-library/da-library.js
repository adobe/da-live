/* eslint-disable indent */
import { DOMParser as proseDOMParser } from 'da-y-wrapper';
import {
  LitElement,
  html,
  render,
  until,
  createRef,
  ref,
} from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { getBlocks, getBlockVariants } from './helpers/index.js';
import getSheet from '../../shared/sheet.js';
import inlinesvg from '../../shared/inlinesvg.js';
import { aem2prose } from '../utils/helpers.js';
import { daFetch } from '../../shared/utils.js';
import searchFor from './helpers/search.js';
import { delay, getItems, getLibraryList } from './helpers/helpers.js';

const sheet = await getSheet('/blocks/edit/da-library/da-library.css');
const buttons = await getSheet(`${getNx()}/styles/buttons.css`);

const ICONS = [
  '/blocks/edit/img/Smock_ExperienceAdd_18_N.svg',
  '/blocks/browse/img/Smock_ChevronRight_18_N.svg',
  '/blocks/edit/img/Smock_AddCircle_18_N.svg',
];

let accessToken;

function closeLibrary() {
  const palletePane = window.view.dom.nextElementSibling;
  const existingPalette = palletePane.querySelector('da-library');
  if (existingPalette) {
    existingPalette.remove();
    return true;
  }
  return false;
}

// Cache fetched library data
const libraryListPromise = delay(500).then(() => getLibraryList());
const data = {
  blockDetailItems: new Map(),
  blocks: null,
  templateItems: null,
};

class DaLibrary extends LitElement {
  static properties = {
    _libraryList: { state: true },
    _libraryDetails: { state: true },
    _searchStr: { state: true },
  };

  constructor() {
    super();
    this._libraryList = [];
    this._libraryDetails = {};
    this._searchStr = '';
    this._searchHasFocus = false;
  }

  searchInputRef = createRef();

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet, buttons];
    inlinesvg({ parent: this.shadowRoot, paths: ICONS });
    this._libraryList = await libraryListPromise;
    window.addEventListener('keydown', this.handleKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.handleKeydown);
  }

  handleKeydown(e) {
    if (e.key === 'Escape') closeLibrary();
  }

  handleModalClose() {
    this.shadowRoot.querySelector('.da-dialog-plugin').close();
    closeLibrary();
  }

  async handleLibSwitch(e, library) {
    if (library.experience === 'dialog') {
      let dialog = this.shadowRoot.querySelector('.da-dialog-plugin');
      if (dialog) dialog.remove();

      dialog = html`
        <dialog class="da-dialog-plugin">
          <div class="da-dialog-header">
            <div class="da-dialog-header-title">
              <img src="${library.icon}" />
              <p>${library.name}</p>
            </div>
            <button class="primary" @click=${this.handleModalClose}>Close</button>
          </div>
          ${this.renderPlugin(library.url, true)}
        </dialog>
      `;

      render(dialog, this.shadowRoot);

      this.shadowRoot.querySelector('.da-dialog-plugin').showModal();

      return;
    }
    const { target } = e;
    const type = target.dataset.libraryName;
    target.closest('.palette-pane').classList.add('backward');
    const toShow = this.shadowRoot.querySelector(`[data-library-type="${type}"]`);
    toShow.classList.remove('forward');
    const pluginIframe = toShow.querySelector('iframe');
    if (!pluginIframe) return;
    pluginIframe.src = pluginIframe.dataset.src;
  }

  handleBack(e) {
    const { target } = e;
    target.closest('.palette-pane').classList.add('forward');
    const wrapper = target.closest('.palette-wrapper');
    const previous = wrapper.querySelector('.backward');
    previous.classList.remove('backward');
  }

  handleCloseSearch() {
    this._searchStr = '';
    this.searchInputRef.value.value = '';
  }

  handleSearch({ target }) {
    this._searchStr = target.value;
  }

  handleSearchInputKeydown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.target.parentElement.nextElementSibling?.querySelector('button').focus();
    }
  }

  handleSearchKeydown(e) {
    const parentEl = e.target.parentElement;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      parentEl.nextElementSibling?.querySelector('button').focus();
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevButton = parentEl.previousElementSibling?.querySelector('button');
      if (prevButton) {
        prevButton.focus();
      } else {
        this.searchInputRef.value.focus();
      }
    }
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
      if (e.data.action === 'sendText') {
        const para = window.view.state.schema.text(e.data.details);
        window.view.dispatch(window.view.state.tr.replaceSelectionWith(para));
      }
      if (e.data.action === 'closeLibrary') {
        closeLibrary();
      }
    };

    if (!accessToken) {
      const { initIms } = await import('../../shared/utils.js');
      ({ accessToken } = (await initIms()) || {});
    }

    setTimeout(() => {
      const project = this.getParts();

      const message = {
        ready: true,
        project,
        context: project,
      };
      if (accessToken) message.token = accessToken.token;
      target.contentWindow.postMessage(message, '*', [channel.port2]);
    }, 750);
  }

  renderBlockItem(item, icon = false) {
    return html`
      <li class="da-library-type-group-detail-item" tabindex="1">
        <button class="${icon ? 'blocks' : ''}" @click=${() => this.handleItemClick(item)}>
          <div>
            <span class="da-library-group-name">${item.name}</span>
            <span class="da-library-group-subtitle">${item.variants}</span>
          </div>
          <svg class="icon"><use href="#spectrum-ExperienceAdd"/></svg>
        </button>
      </li>`;
  }

  async renderBlockDetail(path) {
    if (!data.blockDetailItems.has(path)) {
      data.blockDetailItems.set(path, await getBlockVariants(path));
    }
    const items = data.blockDetailItems.get(path);
    return html`${items.map((item) => this.renderBlockItem(item))}`;
  }

  renderBlockGroup(group) {
    return html`
      <li class="da-library-type-group">
        <button class="da-library-type-group-title" @click=${this.handleGroupOpen}>
          <span class="name">${group.name}</span>
          <svg class="icon"><use href="#spectrum-chevronRight"/></svg>
        </button>
        <ul class="da-library-type-group-details">
          ${until(this.renderBlockDetail(group.path), html`<span>Loading...</span>`)}
        </ul>
      </li>`;
  }

  renderBlockGroups(groups) {
    return html`
      <ul class="da-library-type-list">
        ${groups.map((group) => this.renderBlockGroup(group))}
      </ul>`;
  }

  async renderIcon(url) {
    const [icon] = await inlinesvg({ paths: [url] });
    icon.classList.add('icon-preview');
    return icon;
  }

  renderAssetItem(item) {
    return html`
      <li class="da-library-asset-item">
        <button class="da-library-type-asset-btn"
          @click=${() => this.handleItemClick(item)}>
          <img src="${item.path}" />
          <svg class="icon"><use href="#spectrum-AddCircle"/></svg>
        </button>
      </li>`;
  }

  renderAssets(items) {
    return html`
      <ul class="da-library-type-list-assets">
      ${items.map((item) => this.renderAssetItem(item))}
      </ul>
    `;
  }

  renderTemplateItem(item, icon = false) {
    return html`
      <li class="da-library-type-item">
        <button class="da-library-type-item-btn ${icon ? 'templates' : ''}"
          @click=${() => this.handleTemplateClick(item)}>
          <div class="da-library-type-item-detail">
            <span>${item.key}</span>
            <svg class="icon">
              <use href="#spectrum-AddCircle"/>
            </svg>
          </div>
        </button>
      </li>`;
  }

  renderTemplates(items, listName) {
    return html`
      <ul class="da-library-type-list da-library-type-list-${listName}">
      ${items.map((item) => this.renderTemplateItem(item))}
      </ul>`;
  }

  renderItems(items, listName, iconType = '') {
    return html`
      <ul class="da-library-type-list da-library-type-list-${listName}">
        ${items.map((item) => {
          const name = item.value || item.name || item.key;
          if (!name) return null;
          return html`
            <li class="da-library-type-item">
              <button class="da-library-type-item-btn ${iconType}"
                @click=${() => this.handleItemClick(item)}>
                <div class="da-library-type-item-detail">
                  ${item.icon && !item.url ? until(this.renderIcon(item.icon)) : ''}
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

  renderSearch() {
    return searchFor(this._searchStr, data, this);
  }

  renderPlugin(url, preload) {
    return html`
      <div class="da-library-type-plugin">
        <iframe
          data-src="${preload ? null : url}"
          src="${preload ? url : null}"
          @load=${this.handlePluginLoad}
          allow="clipboard-write *"></iframe>
      </div>`;
  }

  async renderLibrary({ name, sources, url, format }) {
    // Only plugins have a URL
    if (url) {
      return this.renderPlugin(url);
    }

    if (name === 'blocks') {
      if (!data.blocks) {
        data.blocks = await getBlocks(sources);
      }
      return this.renderBlockGroups(data.blocks);
    }

    if (name === 'templates') {
      if (!data.templateItems) {
        data.templateItems = await getItems(sources, name, format);
      }
      if (data.templateItems.length) {
        return this.renderTemplates(data.templateItems, name);
      }
      return html`No templates found.`;
    }

    if (!data[name]) {
      data[name] = await getItems(sources, name, format);
    }
    if (data[name].length) {
      return this.renderItems(data[name], name);
    }

    return html`${name}`;
  }

  renderMainMenu() {
    return html`
      <ul class="da-library-item-list da-library-item-list-main">
        ${this._libraryList.map(
          (library) => html`
          <li>
            <button
              data-library-name="${library.name}"
              class="${library.name} ${library.url ? 'is-plugin' : ''}"
              style="${library.icon ? `background-image: url(${library.icon})` : ''}"
              @click=${(e) => this.handleLibSwitch(e, library)}>
              <span class="library-type-name">${library.name}</span>
            </button>
          </li>`,
        )}
      </ul>`;
  }

  render() {
    return html`
      <div class="palette-wrapper">
      <button class="da-library-close" @click=${closeLibrary}></button>
        <div class="palette-pane">
          <div class="palette-pane-header">
            ${this._searchStr && html`<button class="palette-back" @click=${this.handleCloseSearch}>Back</button>`}
            <h2>Library</h2>
          </div>
          <div class="da-library-search">
            <input
              ${ref(this.searchInputRef)}
              class="da-library-search-input"
              id="search"
              name="search"
              type="text"
              @input=${this.handleSearch}
              @keydown=${this.handleSearchInputKeydown}
              placeholder="Search everything" />
          </div>
          ${this._searchStr ? this.renderSearch() : this.renderMainMenu()}
        </div>
        ${this._libraryList.map(
          (library) => html`
          <div class="palette-pane forward" data-library-type="${library.name}">
            <div class="palette-pane-header">
              <button class="palette-back" @click=${this.handleBack}>Back</button>
              <h2>${library.name}</h2>
            </div>
            ${until(this.renderLibrary(library), html`<span>Loading...</span>`)}
          </div>
        `,
        )}
      </div>
    `;
  }

  renderPluginItem(plugin, icon = false) {
    return html`
      <li class="da-library-type-group-detail-item">
        <button class="${icon ? 'plugins' : ''}" @click=${(e) => this.handleLibSwitch(e, plugin)}>
          <div>
            <span class="da-library-group-name">${plugin.name}</span>
          </div>
        </button>
      </li>`;
  }
}

customElements.define('da-library', DaLibrary);

const CLOSE_DROPDOWNS_EVENT = 'pm-close-dropdowns';

export default function toggleLibrary() {
  const libraryWasOpen = closeLibrary();
  if (libraryWasOpen) return;

  // close any other dropdowns
  window.dispatchEvent(new CustomEvent(CLOSE_DROPDOWNS_EVENT));

  const palette = document.createElement('da-library');
  const palletePane = window.view.dom.nextElementSibling;
  palletePane.append(palette);

  const closePaletteListener = () => {
    palette.remove();
    window.removeEventListener(CLOSE_DROPDOWNS_EVENT, closePaletteListener);
  };
  window.addEventListener(CLOSE_DROPDOWNS_EVENT, closePaletteListener);
}
