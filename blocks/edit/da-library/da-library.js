import { LitElement, html, nothing } from 'da-lit';
import { DOMParser as proseDOMParser, DOMSerializer, Slice, TextSelection } from 'da-y-wrapper';
import { htmlToProse } from '../utils/helpers.js';
import { getNx, sanitizePathParts } from '../../../scripts/utils.js';
import getSheet from '../../shared/sheet.js';
import inlinesvg from '../../shared/inlinesvg.js';
import { daFetch } from '../../shared/utils.js';
import searchFor from './helpers/search.js';
import { OOTB_PLUGINS, loadLibrary, getItemDetails, getPreviewStatus } from './helpers/helpers.js';

const sheet = await getSheet('/blocks/edit/da-library/da-library.css');
const buttons = await getSheet(`${getNx()}/styles/buttons.css`);

const ICONS = [
  '/blocks/edit/img/S2_Icon_ExperienceAdd_20_N.svg',
  '/blocks/edit/img/S2_Icon_ExperiencePreview_20_N.svg',
  '/blocks/edit/img/S2_Icon_ChevronRight_20_N.svg',
  '/blocks/edit/img/S2_Icon_Search_20_N.svg',
  '/blocks/edit/img/S2_Icon_InfoCircle_20_N.svg',
  '/blocks/edit/img/S2_Icon_Plugin_20_N.svg',
  '/blocks/edit/img/S2_Icon_Table_20_N.svg',
  '/blocks/edit/img/S2_Icon_Template_20_N.svg',
  '/blocks/edit/img/S2_Icon_CallCenter_20_N.svg',
  '/blocks/edit/img/S2_Icon_Image_20_N.svg',
  '/blocks/edit/img/S2_Icon_Placeholder_20_N.svg',
];

const searchIndex = {};

class DaLibrary extends LitElement {
  static properties = {
    config: { attribute: false },
    _active: { state: true },
    _preview: { state: true },
    _searchStr: { state: true },
    _searchResults: { state: true },
  };

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
    // Return if plugin is already in the index
    if (searchIndex[plugin.name]) return;

    // Return if it's already in BYO
    const foundByo = searchIndex.byoPlugins?.some((byo) => byo.name === plugin.name);
    if (foundByo) return;

    // Add a top level out of the box plugin
    const isOotb = OOTB_PLUGINS.some((name) => plugin.name === name);
    if (isOotb) {
      // Add the default plugin icon, but allow an item to override it
      searchIndex[plugin.name] = plugin.items.map((item) => ({
        icon: plugin.icon,
        ...item,
      }));
      return;
    }

    // Add to byo plugins
    searchIndex.byoPlugins ??= [];
    searchIndex.byoPlugins.push(plugin);
  }

  handleClose() {
    this.remove();
  }

  handleKeydown = (e) => {
    if (e.key === 'Escape') this.handleClose();
  };

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
    this._searchStr = undefined;
    this._searchResults = undefined;
  }

  handleSearch({ target }) {
    this._searchStr = target.value;
    this._searchResults = searchFor(target.value, searchIndex, this);
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
        this.shadowRoot.querySelector('#search').focus();
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

    window.view.dispatch(
      newTr
        .setSelection(TextSelection.create(newTr.doc, finalPos))
        .scrollIntoView(),
    );

    if (finalPos === newTr.doc.content.size - 1) {
      // only scroll down if we're at the end of the document
      const { node } = window.view.domAtPos(window.view.state.selection.anchor);
      node?.scrollIntoView?.();
    }
  }

  async handleOpenPreview(item) {
    const { org, site, pathname } = getItemDetails(item);
    this._preview = {
      name: item.name || item.key,
      url: `https://main--${site}--${org}.aem.page${pathname}`,
    };

    // Lazily get the preview status
    this._preview.ok = await getPreviewStatus({ org, site, pathname });
    this.requestUpdate();
  }

  handlePreviewClose() {
    delete this._preview;
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
        const parsed = proseDOMParser.fromSchema(window.view.state.schema).parse(dom.body);
        const slice = new Slice(parsed.content, 0, 0);
        const { from, to } = window.view.state.selection;
        window.view.dispatch(window.view.state.tr.replaceRange(from, to, slice));
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

    const { pathname, hash } = window.location;
    const view = pathname.slice(1);
    const [org, repo, ...path] = sanitizePathParts(hash.slice(1));

    // Wait for iframe to be ready before sending
    setTimeout(() => {
      if (!target.contentWindow) return;

      const project = { view, org, repo, ref: 'main', path: `/${path.join('/')}` };

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

  handleToolTip(item) {
    item.showToolTip = !item.showToolTip;
    this.requestUpdate();
  }

  renderIcon(icon = '#S2_Icon_Plugin', cls = '') {
    if (icon.startsWith('#')) {
      return html`<svg class="icon ${cls}"><use href=${icon}></use></svg>`;
    }
    return html`<img class="icon" src="${icon}" />`;
  }

  renderPreviewDialog() {
    if (!this._preview) return nothing;

    const handleClose = () => { this._preview = undefined; };

    const { ok } = this._preview;

    // Hide the iframe while determining if previewed
    const hideIframe = ok === undefined || ok === false ? 'hide-iframe' : '';

    // Only display an error if the status is known
    const error = ok === false
      ? `It appears ${this._preview.name} has not been previewed.`
      : undefined;

    return html`
      <dialog class="da-plugin-dialog">
        <div class="da-dialog-header">
          <div class="da-dialog-header-title">
            <p>${this._preview.name} preview</p>
          </div>
          <sl-button class="primary outline" @click=${handleClose}>Close</sl-button>
        </div>
        <div class="da-library-type-plugin">
        ${error ? html`<div class="iframe-overlay"><p>${error}</p></div>` : nothing}
        <iframe
          class="${hideIframe}"
          src=${this._preview.url}
          allow="clipboard-write *"></iframe>
        </div>
      </dialog>
    `;
  }

  renderBlockItem(item) {
    const hasDesc = item.description?.trim();
    return html`
      <li class="library-plugin-detail-item" tabindex="1">
        <div class="library-plugin-detail-item-header">
          ${item.icon ? this.renderIcon(item.icon, 'item-type') : nothing}
          <button class="library-plugin-detail-item-title" @click=${() => this.handleItemClick('blocks', item, true)}>
            <p class="da-library-group-name">${item.name}</p>
            <p class="da-library-group-subtitle">${item.variants}</p>
          </button>
          <div class="library-plugin-detail-item-actions">
            ${hasDesc ? html`
              <button
                class="tooltip"
                @click=${() => this.handleToolTip(item)}>
                <svg class="icon"><use href="#S2_Icon_InfoCircle"/></svg>
              </button>` : nothing}
              <button class="add" @click=${() => this.handleItemClick('blocks', item, true)}>
                <svg class="icon"><use href="#S2_Icon_Experience_Add"/></svg>
              </button>
          </div>
        </div>
        ${hasDesc ? html`<div class="da-library-item-description ${item.showToolTip ? 'is-visible' : ''}">${item.description}</div>` : nothing}
      </li>`;
  }

  renderBlockDetail(block) {
    return html`${block.variants?.map((variant) => this.renderBlockItem(variant))}`;
  }

  renderBlockGroups({ items }) {
    return html`
      <ul class="library-plugin-list library-plugin-list-group">
        ${items.map((group) => html`
          <li class="library-plugin-list-item">
            <div class="library-plugin-list-item-header">
              <button class="item-title" @click=${this.handleGroupOpen}>
                  <span class="name">${group.name}</span>
              </button>
              <div class="library-plugin-list-item-actions">
                <button class="preview" @click=${() => this.handleOpenPreview(group)}>
                  <svg class="icon preview"><use href="#S2_Icon_ExperiencePreview"/></svg>
                </button>
                <button  class="expand" @click=${this.handleGroupOpen}>
                  <svg class="icon"><use href="#S2_Icon_ChevronRight"/></svg>
                </button>
                </div>
              </div>
            </div>
            <ul class="library-plugin-list-item-details">
              ${this.renderBlockDetail(group)}
            </ul>
          </li>`)}
      </ul>`;
  }

  renderItem(item) {
    const name = item.title || item.name || item.key || item.value;
    if (!name) return nothing;

    const previewBtn = item.type === 'templates'
      ? html`
        <button class="preview" @click=${() => this.handleOpenPreview(item)}>
          <svg class="icon preview"><use href="#S2_Icon_ExperiencePreview"/></svg>
        </button>`
      : nothing;

    const clickHandler = () => {
      if (item.experience) {
        this.handlePluginClick(item);
        return;
      }
      this.handleItemClick(item.type, item);
    };

    // Non-plugins (no experience) get an add button
    const addBtn = !item.experience ? html`
      <button class="add" @click=${clickHandler}>
        <svg class="icon"><use href="#S2_Icon_Experience_Add"/></svg>
      </button>` : nothing;

    return html`
      <li class="library-plugin-detail-item" tabindex="1">
        <div class="library-plugin-detail-item-header">
          ${item.icon ? this.renderIcon(item.icon, 'item-type') : nothing}
          <button class="library-plugin-detail-item-title" @click=${clickHandler}>
            <p class="da-library-group-name">${name}</p>
          </button>
          <div class="library-plugin-detail-item-actions">
            ${previewBtn}
            ${addBtn}
          </div>
        </div>
      </li>`;
  }

  renderItems(plugin) {
    const { items } = plugin;

    return html`
      <ul class="library-plugin-list">
        ${items.map((item) => this.renderItem({ type: plugin.name, ...item }))}
      </ul>`;
  }

  renderSearch() {
    if (!this._searchResults?.length) return html`<p>No results</p>`;

    return html`
      <ul class="library-plugin-list library-search-results" @keydown=${this.handleSearchKeydown}>
        ${this._searchResults.map((item) => {
          const { type } = item;
          if (type === 'blocks') return this.renderBlockItem(item);
          return this.renderItem(item);
        })}
      </ul>`;
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

  renderPluginDetail(plugin) {
    // Blocks get special treatment due to grouping
    if (plugin.name === 'blocks') return this.renderBlockGroups(plugin);

    // Most OOTB plugins use the default renderItems
    if (OOTB_PLUGINS.some((name) => plugin.name === name)) {
      return this.renderItems(plugin);
    }

    // This is a BYO plugin
    return this.renderPlugin(plugin);
  }

  renderPluginDialog() {
    // Only render if active plugin is a dialog
    if (!this._active?.experience?.includes('dialog')) return nothing;

    const plugin = this._active;
    return html`
      <dialog class="da-plugin-dialog experience-${plugin.experience}">
        <div class="da-dialog-header">
          <div class="da-dialog-header-title">
            ${this.renderIcon(plugin.icon)}
            <p>${plugin.title || plugin.name}</p>
          </div>
          <sl-button class="primary outline" @click=${this.handleBack}>Close</sl-button>
        </div>
        ${this.renderPlugin(plugin)}
      </dialog>
    `;
  }

  renderInlinePlugins() {
    const filtered = this.config.filter((plugin) => plugin.experience === 'inline');

    return filtered.map((plugin) => {
      const isActive = this._active === plugin;

      const isByo = !OOTB_PLUGINS.find((ootb) => plugin.name === ootb);

      // If there are items, or it doesn't have items to load (byo plugin), it's ready
      const isReady = plugin.items || !plugin.loadItems;

      return html`
        <div class="library-pane library-pane-inline ${isByo ? 'plugin-type-byo' : ''} ${isActive ? '' : 'forward'}" ?inert=${!isActive}>
          <div class="pane-header">
            <button class="pane-back" @click=${this.handleBack}>Back</button>
            <p class="pane-title">${plugin.title || plugin.name}</p>
          </div>
          ${isReady ? this.renderPluginDetail(plugin) : html`</p>Loading...</p>`}
        </div>
      `;
    });
  }

  renderMainMenuItem(plugin) {
    return html`
      <li class="library-main-menu-item">
        <button class="library-main-menu-btn" @click=${() => this.handlePluginClick(plugin)}>
          ${this.renderIcon(plugin.icon)}
          <span class="plugin-title">${plugin.title || plugin.name}</span>
        </button>
      </li>`;
  }

  renderMainMenu() {
    return html`
      <ul class="library-main-menu-list">
        ${this.config.map((plugin) => this.renderMainMenuItem(plugin))}
      </ul>`;
  }

  renderSearchInput() {
    return html`
      <div class="library-search">
        <div class="icon-container">
          ${this.renderIcon('#S2_Icon_Search')}
        </div>
        <input
          id="search"
          name="search"
          type="text"
          aria-label="Search library"
          .value=${this._searchStr || ''}
          @input=${this.handleSearch}
          @keydown=${this.handleSearchInputKeydown}
          placeholder="Search everything" />
      </div>`;
  }

  render() {
    const inlineActive = this._active?.experience === 'inline';

    return html`
      <button id="library-close" @click=${this.handleClose}></button>
      <div class="library-pane main-menu-pane ${inlineActive ? 'backward' : ''}" ?inert=${inlineActive}>
        <div class="pane-header">
          ${this._searchStr
            ? html`<button class="pane-back" @click=${this.handleCloseSearch}>Back</button>`
            : nothing}
          <p class="pane-title">Library</p>
        </div>
        ${this.renderSearchInput()}
        ${this._searchStr ? this.renderSearch() : this.renderMainMenu()}
      </div>
      ${this.renderInlinePlugins()}
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
