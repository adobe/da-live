import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../scripts/utils.js';
import { listFolder, itemHashPath } from '../shared/daFiles.js';
import {
  contextToPathContext,
  entryTypeFromExtension,
  isFolder,
  RESOURCE_TYPE,
} from './utils.js';
import './list/list.js';
import './action-bar/action-bar.js';
import './delete/delete.js';
import { deploy, getItemPreviewUrl, renameItem } from './browse-api.js';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);
const { showToast, VARIANT_ERROR } = await import(`${getNx()}/blocks/shared/toast/toast.js`);
const { getPanelStore, openPanel } = await import(`${getNx()}/utils/panel.js`);

await import(`${getNx()}/blocks/shared/breadcrumb/breadcrumb.js`);

const styles = await loadStyle(import.meta.url);
const PANEL_ICON_SRC = '/blocks/canvas/img/s2-icon-splitleft-20-n.svg';

const documentLayoutStyles = await loadStyle(
  new URL('overrides.css', import.meta.url).href,
);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, documentLayoutStyles];

class NxBrowse extends LitElement {
  static properties = {
    _items: { state: true },
    _listError: { state: true },
    _selectedItems: { state: true },
    _pendingAction: { state: true },
    _activeAction: { state: true },
  };

  set context(value) {
    this._explicitContext = true;
    this._context = value;
    this.requestUpdate();
    if (this.isConnected) {
      this._syncList();
    }
  }

  _openPanel(position) {
    this.dispatchEvent(new CustomEvent('nx-browse-open-panel', {
      bubbles: true,
      composed: true,
      detail: { position },
    }));
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this._unsubscribeHash = hashChange.subscribe((hashState) => {
      if (!this._explicitContext) {
        this._context = hashState;
        this._syncList();
      }
    });
    if (this._explicitContext && this._context) {
      this._syncList();
    }
  }

  disconnectedCallback() {
    this._unsubscribeHash?.();
    super.disconnectedCallback();
  }

  get _pathContext() {
    return contextToPathContext(this._context);
  }

  async _syncList() {
    const ctx = this._pathContext;
    if (!ctx) {
      this._items = undefined;
      this._listError = undefined;
      this.requestUpdate();
      return;
    }

    const { fullpath } = ctx;

    const result = await listFolder(fullpath);

    if ('error' in result) {
      this._items = undefined;
      this._listError = result.error;
    } else {
      this._listError = undefined;
      this._items = result;
    }
    this.requestUpdate();
  }

  _onSelectionChange(event) {
    this._selectedItems = event.detail?.selected ?? [];
  }

  _clearSelection() {
    this.shadowRoot.querySelector('nx-browse-list')?.clearSelection();
  }

  _onSelectionAction(event) {
    const { action } = event.detail || {};
    if (!action) return;
    if (action === 'rename') {
      const { key, item } = this._selectedItems[0];
      this._activeAction = { type: 'rename', key, item };
      return;
    }
    if (action === 'delete') {
      this._activeAction = { type: 'delete', selectedRows: this._selectedItems.map(({ item }) => item) };
      return;
    }
    if (action === 'copyLink') {
      this._onCopyLink();
      return;
    }
    this._onDeploy(action);
  }

  async _onRename(event) {
    const { item, newName } = event.detail;
    this._activeAction = null;
    const { ok, error } = await renameItem(item, newName);
    if (ok) {
      this._clearSelection();
      this._syncList();
    } else {
      showToast({ text: error ?? 'Rename failed', variant: VARIANT_ERROR });
    }
  }

  _onRenameCancel() {
    this._activeAction = null;
  }

  async _onCopyLink() {
    const urls = (this._selectedItems ?? [])
      .map(({ item }) => getItemPreviewUrl(item))
      .filter(Boolean);
    if (!urls.length) return;
    try {
      await navigator.clipboard.writeText(urls.join('\n'));
      const count = urls.length;
      showToast({ text: count === 1 ? 'Link copied' : `${count} links copied` });
    } catch {
      showToast({ text: 'Could not copy to clipboard', variant: VARIANT_ERROR });
    }
  }

  async _onDeploy(action) {
    if (this._pendingAction) return;
    this._pendingAction = action;
    const { item } = this._selectedItems[0];
    const { ok, openedUrls } = await deploy(item.path, action);
    this._pendingAction = null;
    if (ok) openedUrls.forEach((url) => window.open(url, url));
  }

  _onActionComplete(event) {
    const { success } = event.detail || {};
    this._activeAction = null;
    if (success) {
      this._clearSelection();
      this._syncList();
    }
  }

  _onBrowseActivate(event) {
    const { pathKey, item, shiftKey, ctrlKey } = event.detail || {};
    if (!item) return;

    if (isFolder(item)) {
      window.location.hash = `#/${pathKey}`;
      return;
    }

    const url = new URL(window.location.href);
    const entryType = entryTypeFromExtension(item.ext);

    if (entryType === RESOURCE_TYPE.document) {
      url.pathname = '/canvas';
      url.hash = `#/${itemHashPath(item)}`;
      if (ctrlKey) {
        window.open(url.href, '_blank');
      } else if (shiftKey) {
        window.open(url.href, '_blank', 'noopener,noreferrer');
      } else {
        window.location.assign(url.href);
      }
      return;
    } else if (entryType === RESOURCE_TYPE.sheet) {
      url.pathname = '/sheet';
      url.hash = `#/${item.path.slice(1, -(item.ext.length + 1))}`;
    } else {
      url.pathname = '/media';
      url.hash = `#${item.path}`;
    }

    url.search = '';
    window.open(url.href, '_blank', 'noopener,noreferrer');
  }

  render() {
    const ctx = this._pathContext;

    const bar = html`
      <div class="browse-bar">
        <button
          type="button"
          part="toggle-before"
          class="browse-panel-toggle"
          aria-label="Open panel"
          @click=${() => this._openPanel('before')}
        ><img src="${PANEL_ICON_SRC}" aria-hidden="true"></button>
      </div>
    `;

    if (!ctx) {
      return html`
        ${bar}
        <div class="browse-hint" role="status">
          <p class="browse-hint-title">Nothing to show here yet</p>
          <p class="browse-hint-detail">
            Choose a site or folder from your workspace to see files in this list.
          </p>
        </div>
      `;
    }

    const title = (ctx.pathSegments.at(-1) ?? '').split(/[?#]/)[0];

    if (!this._listError && this._items === undefined) {
      return bar;
    }

    const header = html`
      <div class="browse-header">
        <div class="browse-title-bar">
          <h1 class="browse-title">${title}</h1>
        </div>
        <nx-breadcrumb .pathSegments=${ctx.pathSegments}></nx-breadcrumb>
        ${this._selectedItems?.length > 0 ? html`
          <nx-browse-action-bar
            .selected=${this._selectedItems}
            .isDisabled=${!!this._pendingAction}
            @nx-action-bar-clear=${this._clearSelection}
            @nx-browse-selection-action=${this._onSelectionAction}
          ></nx-browse-action-bar>
        ` : nothing}
      </div>
    `;

    if (this._listError) {
      return html`
        ${bar}
        ${header}
        <div class="browse-hint browse-hint-error" role="alert">
          <p class="browse-hint-title">Could not load this folder</p>
          <p class="browse-hint-detail">${this._listError}</p>
        </div>
      `;
    }

    const currentPathKey = ctx.pathSegments.join('/');

    return html`
      ${bar}
      ${header}
      <nx-browse-list
        .items=${this._items}
        .currentPathKey=${currentPathKey}
        .renamingKey=${this._activeAction?.type === 'rename' ? this._activeAction.key : null}
        @nx-browse-activate=${this._onBrowseActivate}
        @nx-browse-selection-change=${this._onSelectionChange}
        @nx-browse-rename=${this._onRename}
        @nx-browse-rename-cancel=${this._onRenameCancel}
      ></nx-browse-list>
      ${this._activeAction?.type === 'delete' ? html`
        <nx-inventory-delete-dialog
          .selectedRows=${this._activeAction.selectedRows}
          @nx-browse-action-complete=${this._onActionComplete}
        ></nx-inventory-delete-dialog>
      ` : nothing}
    `;
  }
}

if (!customElements.get('nx-browse')) {
  customElements.define('nx-browse', NxBrowse);
}

export default function decorate(block) {
  block.textContent = '';
  const browse = document.createElement('nx-browse');
  block.append(browse);

  const openBrowseChatPanel = () => {
    const store = getPanelStore();
    const width = store.before?.width ?? '400px';
    openPanel({
      position: 'before',
      width,
      getContent: async () => {
        await import(`${getNx()}/blocks/chat/chat.js`);
        return document.createElement('nx-chat');
      },
    });
  };

  browse.addEventListener('nx-browse-open-panel', (e) => {
    if (e.detail.position === 'before') openBrowseChatPanel();
  });

  let prevKeys = new Set();
  browse.addEventListener('nx-browse-selection-change', ({ detail }) => {
    const selected = detail?.selected ?? [];
    const nextKeys = new Set(selected.map(({ key }) => key));
    for (const key of prevKeys) {
      if (!nextKeys.has(key)) {
        document.dispatchEvent(new CustomEvent('nx-add-to-chat', { detail: { key: `browse-${key}` } }));
      }
    }
    for (const { key, item } of selected) {
      if (!prevKeys.has(key)) {
        const label = item.ext ? `${item.name}.${item.ext}` : item.name;
        document.dispatchEvent(new CustomEvent('nx-add-to-chat', {
          detail: {
            key: `browse-${key}`,
            id: key,
            label,
            blockName: label,
            innerText: `Selected repository path: ${key}`,
          },
        }));
      }
    }
    prevKeys = nextKeys;
  });

  const store = getPanelStore();
  if (store.before) openBrowseChatPanel();
}
