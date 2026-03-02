import {
  LitElement,
  html,
  until,
  createRef,
  ref,
  nothing,
} from 'da-lit';
import { DOMParser as proseDOMParser, DOMSerializer, TextSelection } from 'da-y-wrapper';
import { htmlToProse } from '../utils/helpers.js';
import { getNx, sanitizePathParts } from '../../../scripts/utils.js';
import getSheet from '../../shared/sheet.js';
import inlinesvg from '../../shared/inlinesvg.js';
import { daFetch, aemAdmin } from '../../shared/utils.js';
import searchFor from './helpers/search.js';
import { OOTB_PLUGINS, loadLibrary, getPreviewUrl, getAemUrlVars } from './helpers/helpers.js';

const sheet = await getSheet('/blocks/edit/da-library/da-library.css');
const buttons = await getSheet(`${getNx()}/styles/buttons.css`);

const ICONS = [
  '/blocks/edit/img/Smock_ExperienceAdd_18_N.svg',
  '/blocks/browse/img/Smock_ChevronRight_18_N.svg',
  '/blocks/edit/img/Smock_AddCircle_18_N.svg',
  '/blocks/edit/img/Smock_Preview_18_N.svg',
  '/blocks/edit/img/Smock_InfoOutline_18_N.svg',
];

const searchIndex = {};

class DaLibrary extends LitElement {
  static properties = {
    config: { attribute: false },
    _active: { state: true },
    _searchStr: { state: true },
    _preview: { state: true },
  };

  constructor() {
    super();
    this._searchStr = '';
    this._searchHasFocus = false;
  }

  searchInputRef = createRef();

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet, buttons];
    inlinesvg({ parent: this.shadowRoot, paths: ICONS });

    window.addEventListener('keydown', this.handleKeydown);
    this.addEventListener('blur', () => window.view?.focus());

    this.loadDetails();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.handleKeydown);
  }

  firstUpdated() {
    this.searchInputRef.value.focus();
    import('../../shared/da-dialog/da-dialog.js');
  }

  updated() {
    this.dialogCheck();
  }

  async loadDetails() {
    for (const plugin of this.config) {
      // If the plugin has items to load, await them
      if (plugin.loadItems && !plugin.items) {
        plugin.items = await plugin.loadItems;
        // Update the UI immediately
        this.requestUpdate();

        // Blocks have another level of
        // loading to get their variations
        if (plugin.name === 'blocks') {
          plugin.items = await Promise.all(plugin.items.map(async (block) => {
            const variants = await block.loadVariants;
            return { ...block, variants };
          }));
        }
      }
      this.addToSearchIndex(plugin);
    }
  }

  async addToSearchIndex(plugin) {
    const isOotb = OOTB_PLUGINS.some((name) => plugin.name === name);
    if (isOotb) {
      searchIndex[plugin.name] = plugin.items;
      return;
    }
    searchIndex.byoPlugins ??= [];
    searchIndex.byoPlugins.push(plugin);
  }

  // Remove the component completely from the DOM
  handleClose() {
    this.remove();
  }

  handleKeydown(e) {
    if (e.key === 'Escape') this.handleClose();
  }

  async handlePluginClick(plugin) {
    this._active = plugin;

    if (plugin.experience === 'aem-assets') {
      plugin.callback();
      this.handleClose();
    }

    if (plugin.experience === 'window') {
      const href = plugin.sources?.[0];
      if (!href) return;
      window.open(href, href);
    }
  }

  dialogCheck() {
    const dialogs = this.shadowRoot.querySelectorAll('dialog');
    for (const dialog of dialogs) {
      dialog.showModal();
    }
  }

  handleBack() {
    this._active = undefined;
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
    if (e.key === 'Enter') {
      e.preventDefault();
      e.target.parentElement.nextElementSibling?.querySelector('button').click();
      this.searchInputRef.value.select();
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
    if (e.key === 'Enter') {
      // Allow default and then select the input
      setTimeout(() => this.searchInputRef.value.select(), 1);
    }
  }

  handleGroupOpen(e) {
    const { target } = e;
    target.closest('li').classList.toggle('is-open');
  }

  async handleTemplateClick(item) {
    const resp = await daFetch(`${item.value}`);
    if (!resp.ok) return;
    let text = await resp.text();

    // Convert template-metadata to metadata block so it can be copied
    text = text.replace('class="template-metadata"', 'class="metadata"');

    const { dom } = htmlToProse(text);

    const newNodes = proseDOMParser.fromSchema(window.view.state.schema).parse(dom);
    window.view.dispatch(window.view.state.tr.replaceSelectionWith(newNodes));
  }

  handleItemClick(pluginName, item, insertParagraphAfter = false) {
    if (pluginName === 'templates') {
      this.handleTemplateClick(item);
      return;
    }

    const { tr } = window.view.state;
    const insertPos = tr.selection.from;

    let newTr;

    if (insertParagraphAfter) {
      const paragraph = window.view.state.schema.nodes.paragraph.create();
      newTr = tr.insert(insertPos, paragraph);
    }

    newTr = (newTr || tr).replaceSelectionWith(item.parsed);
    const finalPos = Math.min(insertPos + item.parsed.nodeSize, newTr.doc.content.size);
    const $pos = newTr.doc.resolve(finalPos);
    const sel = TextSelection.between($pos, $pos);

    window.view.dispatch(
      newTr
        .setSelection(sel)
        .scrollIntoView(),
    );

    if (finalPos === newTr.doc.content.size - 1) {
      // only scroll down if we're at the end of the document
      const { node } = window.view.domAtPos(window.view.state.selection.anchor);
      node?.scrollIntoView?.();
    }
  }

  getParts() {
    const view = 'edit';
    const [org, repo, ...path] = sanitizePathParts(window.location.hash.substring(1));
    return { view, org, repo, ref: 'main', path: `/${path.join('/')}` };
  }

  handlePreviewOpen(path, previewName) {
    const previewPath = getPreviewUrl(path);
    this._blockPreviewPath = previewPath || path;
    this._previewItemName = previewName || '';
  }

  handlePreviewClose() {
    this._blockPreviewPath = '';
    this._previewItemName = '';
  }

  async handlePluginLoad({ target }) {
    const channel = new MessageChannel();
    channel.port1.onmessage = (e) => {
      if (e.data.action === 'sendText') {
        const para = window.view.state.schema.text(e.data.details);
        window.view.dispatch(window.view.state.tr.replaceSelectionWith(para));
      }
      if (e.data.action === 'sendHTML') {
        const dom = new DOMParser().parseFromString(e.data.details, 'text/html');
        const nodes = proseDOMParser.fromSchema(window.view.state.schema).parse(dom);
        window.view.dispatch(window.view.state.tr.replaceSelectionWith(nodes));
      }
      if (e.data.action === 'setHash') {
        window.location.hash = e.data.details;
      }
      if (e.data.action === 'setHref') {
        window.location.href = e.data.details;
      }
      if (e.data.action === 'closeLibrary') {
        this.handleClose();
      }
      if (e.data.action === 'getSelection') {
        const { selection } = window.view.state;
        if (selection.empty) {
          channel.port1.postMessage({ action: 'error', details: 'No selection found' });
          return;
        }
        const slice = selection.content();
        const serializer = DOMSerializer.fromSchema(window.view.state.schema);
        const fragment = serializer.serializeFragment(slice.content);
        const div = document.createElement('div');
        div.appendChild(fragment);
        target.contentWindow.postMessage({ action: 'sendSelection', details: div.innerHTML }, '*');
      }
    };

    // Wait for iframe to be ready before sending
    setTimeout(() => {
      if (!target.contentWindow) return;

      const project = this.getParts();
      const { token } = window.adobeIMS.getAccessToken();

      const message = {
        ready: true,
        project,
        context: project,
        token,
      };

      target.contentWindow.postMessage(message, '*', [channel.port2]);
    }, 750);
  }

  renderPreviewDialog() {
    if (!this._preview) return nothing;

    const [status, error] = this._previewStatus[this._previewItemName];

    const action = {
      style: 'primary outline',
      label: 'Close',
      click: () => this.handlePreviewClose(),
    };

    return html`
      <da-dialog
        class="da-dialog-block-preview"
        size="auto"
        emphasis="quiet"
        title="${this._previewItemName} Preview"
        .action=${action}
        @close=${this.handlePreviewClose}>
        ${status === 200 ? html`<iframe
          class="da-dialog-block-preview-frame"
          src="${this._blockPreviewPath}"
          @load=${this.handlePreviewLoad}
          allow="clipboard-write *"></iframe>` : html`<div style="margin: 0 24px">${error || 'This block/template has not been previewed.'}</div>`}
      </da-dialog>
    `;
  }

  handleToolTip(e, item) {
    e.stopPropagation();
    item.showToolTip = !item.showToolTip;
    this.requestUpdate();
  }

  renderBlockItem(item, icon = false) {
    const hasDesc = item.description?.trim();
    return html`
      <li class="da-library-type-group-detail-item" tabindex="1">
        <button
          class="${icon ? 'blocks' : ''} ${item.showToolTip ? 'show-tooltip' : ''}"
          @click=${() => this.handleItemClick('blocks', item, true)}>
          <div class="da-library-item-button-title">
            <div>
              <span class="da-library-group-name">${item.name}</span>
              <span class="da-library-group-subtitle">${item.variants}</span>
            </div>
          </div>
          <div class="da-library-icons">
              ${hasDesc ? html`<svg class="icon" @click=${(e) => this.handleToolTip(e, item)}>
                <use href="#spectrum-InfoOutline"/></svg>` : nothing}
              <svg class="icon"><use href="#spectrum-ExperienceAdd"/></svg>
            </div>
          ${hasDesc ? html`<div class="da-library-item-button-tooltip">${item.description}</div>` : nothing}
        </button>
      </li>`;
  }

  async renderBlockDetail(block) {
    // Load variants if not already loaded
    if (!block.variants) {
      const variants = await block.loadVariants;
      block.variants = variants;
    }

    return html`${block.variants.map((variant) => this.renderBlockItem(variant))}`;
  }

  renderBlockGroup(group) {
    return html`
      <li class="da-library-type-group">
        <div class="da-library-type-group-title">
          <button class="da-library-type-group-expand" @click=${this.handleGroupOpen}>
             <span class="name">${group.name}</span>
          </button>
          <div class="da-library-type-group-secondary-actions">
            <button class= "preview" @click=${() => this.handlePreviewOpen(group.path, group.name)}>
              <svg class="icon preview"><use href="#spectrum-Preview"/></svg>
            </button>
              <button @click=${this.handleGroupOpen}>
                <svg class="icon"><use href="#spectrum-chevronRight"/></svg>
              </button>
            </button>
          </div>
        </div>
        <ul class="da-library-type-group-details">
          ${until(this.renderBlockDetail(group), html`<span>Loading...</span>`)}
        </ul>
      </li>`;
  }

  renderBlockGroups({ items }) {
    return html`
      <ul class="da-library-type-list">
        ${items.map((group) => this.renderBlockGroup(group))}
      </ul>`;
  }

  renderItem(pluginName, item) {
    const name = item.name || item.key || item.value;
    if (!name) return nothing;

    return html`
      <li class="da-library-type-item">
        <button class="da-library-type-item-btn ${pluginName}"
          @click=${() => this.handleItemClick(pluginName, item)}>
          <div class="da-library-type-item-detail">
            ${item.icon ? html`<img src="${item.icon}" />` : nothing}
            <span>${name}</span>
            <svg class="icon">
              <use href="#spectrum-AddCircle"/>
            </svg>
          </div>
        </button>
      </li>`;
  }

  renderItems(plugin) {
    const { items } = plugin;

    return html`
      <ul class="da-library-type-list da-library-type-list-${plugin.name}">
        ${items.map((item) => this.renderItem(plugin.name, item))}
      </ul>`;
  }

  renderSearch() {
    return searchFor(this._searchStr, searchIndex, this);
  }

  renderPlugin(plugin) {
    const isActive = this._active === plugin;
    const url = isActive ? plugin.sources?.[0] : nothing;
    const loader = isActive ? this.handlePluginLoad : nothing;

    return html`
      <div class="da-library-type-plugin">
        <iframe
          src=${url}
          @load=${loader}
          allow="clipboard-write *"></iframe>
      </div>`;
  }

  async checkPreviewStatus(items, getUrl, getKey) {
    await Promise.all(items.map(async (item) => {
      let path;
      try {
        const itemUrl = new URL(getUrl(item));
        path = itemUrl.pathname;

        // DA Admin Flavored URLs
        if (itemUrl.origin.endsWith('admin.da.live') && path.startsWith('/source')) {
          path = path.replace('/source', '');
        }

        // AEM Flavored URLs
        if (itemUrl.origin.includes('--')) {
          const [org, site] = getAemUrlVars(getUrl(item));
          path = `/${org}/${site}${itemUrl.pathname}`;
        }
      } catch {
        item.error = 'Please use a fully qualified url for your library';
      }
      await aemAdmin(path, 'status', 'GET')
        .then((response) => { item.status = response.preview.status; })
        .catch(() => { item.status = 'error'; });
    }));

    const status = items.reduce((acc, item) => {
      acc[getKey(item)] = [item.status, item.error];
      return acc;
    }, {});
    this._previewStatus = { ...this._previewStatus, ...status };
  }

  renderPluginDetail(plugin) {
    const { name } = plugin;

    // Only blocks get special treatment due to grouping
    if (name === 'blocks') return this.renderBlockGroups(plugin);

    return this.renderItems(plugin);
  }

  renderPluginDialog() {
    // Only render if active plugin is a dialog
    if (!this._active?.experience?.includes('dialog')) return nothing;
    const plugin = this._active;
    return html`
      <dialog class="da-dialog-plugin ${plugin.experience}">
        <div class="da-dialog-header">
          <div class="da-dialog-header-title">
            <img src="${plugin.icon}" />
            <p>${plugin.title || plugin.name}</p>
          </div>
          <button class="primary" @click=${this.handleBack}>Close</button>
        </div>
        ${this.renderPlugin(plugin)}
      </dialog>
    `;
  }

  renderInlinePlugins() {
    const filtered = this.config.filter((plugin) => plugin.experience === 'inline');

    return filtered.map((plugin) => {
      const isActive = this._active === plugin;

      return html`
        <div class="palette-pane ${isActive ? '' : 'forward'}" ?inert=${!isActive}>
          <div class="palette-pane-header">
            <button class="palette-back" @click=${this.handleBack}>Back</button>
            <h2>${plugin.name}</h2>
          </div>
          ${plugin.items ? this.renderPluginDetail(plugin) : html`</p>Loading...</p>`}
        </div>
      `;
    });
  }

  renderMainMenuItem(plugin) {
    return html`
      <li class="da-library-main-menu-plugin">
        <button
          class="${plugin.name}"
          style="${plugin.icon ? `background-image: url(${plugin.icon})` : ''}"
          @click=${() => this.handlePluginClick(plugin)}>
          <span class="library-type-name">${plugin.title || plugin.name}</span>
        </button>
      </li>`;
  }

  renderMainMenu() {
    return html`
      <ul class="da-library-item-list da-library-item-list-main">
        ${this.config.map((plugin) => this.renderMainMenuItem(plugin))}
      </ul>`;
  }

  render() {
    const inlineActive = this._active?.experience === 'inline';

    return html`
      <div class="palette-wrapper">
      <button class="da-library-close" @click=${this.handleClose}></button>
        <div class="palette-pane ${inlineActive ? 'backward' : ''}" ?inert=${inlineActive}>
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
        ${this.renderInlinePlugins()}
      </div>
      ${this.renderPreviewDialog()}
      ${this.renderPluginDialog()}
    `;
  }
}

customElements.define('da-library', DaLibrary);

function getElements() {
  const pane = window.view.dom?.parentElement?.querySelector('.da-palettes');
  if (!pane) return {};
  const existing = pane.querySelector('da-library');
  return { pane, existing };
}

export default async function toggleLibrary() {
  // See if there is an existing element
  const { pane, existing } = getElements();

  // Remove it from the DOM if it exists
  if (existing) {
    existing.remove();
    return;
  }

  // Create the library component if it didn't exist
  const cmp = document.createElement('da-library');

  // Assign the top level items as soon as possible
  cmp.config = await loadLibrary();

  // Attach to the DOM
  pane.append(cmp);
}

// Pre-load library data on import
loadLibrary();
