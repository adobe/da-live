import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import { getCommentsBridge } from '../editor-utils/comments-bridge.js';
import { canvasBus } from '../utils/canvas-bus.js';
import {
  persistToolPanelView,
  resolveInitialToolPanelView,
} from '../utils/panel.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const { PANEL_EVENT } = await import(`${getNx()}/utils/panel.js`);

await import(`${getNx()}/blocks/shared/picker/picker.js`);

// form.css so first-party views can put standard controls in the header actions zone.
const [base, style, form] = await Promise.all([
  loadStyle(new URL('../../shared/styles/base.css', import.meta.url).href),
  loadStyle(import.meta.url),
  loadStyle(`${getNx2()}/styles/form.css`),
]);

const CLOSE_ICON_SRC = '/img/icons/s2-icon-splitright-20-n.svg';
const OPEN_IN_ICON_URL = '/img/icons/s2-icon-openin-20-n.svg';

class EwToolPanel extends LitElement {
  static properties = {
    views: { attribute: false },
    activeId: { type: String },
    org: { type: String },
    site: { type: String },
    contextKey: { type: String },
    _fullsizeDialogViewId: { state: true },
  };

  _loaded = {};

  _loadedKeys = {};

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [base, style, form];
    this._bindCommentCountUpdates();
    this._onRailToggle = () => this._broadcastActiveView();
    document.addEventListener(PANEL_EVENT.OPEN, this._onRailToggle);
    document.addEventListener(PANEL_EVENT.CLOSE, this._onRailToggle);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubCommentCounts?.();
    this._unsubControllerChange?.();
    document.removeEventListener(PANEL_EVENT.OPEN, this._onRailToggle);
    document.removeEventListener(PANEL_EVENT.CLOSE, this._onRailToggle);
  }

  _broadcastActiveView() {
    const rail = this.closest('aside.panel');
    const visible = !!rail && !rail.hasAttribute('hidden');
    canvasBus.toolPanelViewState.emit(visible ? this.activeId : null);
  }

  _bindCommentCountUpdates() {
    const refresh = () => this.requestUpdate();
    const bind = (controller) => {
      this._unsubCommentCounts?.();
      if (!controller?.subscribe) return;
      this._unsubCommentCounts = controller.subscribe(({ reason }) => {
        if (reason === 'counts' || reason === 'init') refresh();
      });
    };
    bind(getCommentsBridge().controller);
    this._unsubControllerChange = canvasBus.commentsControllerState
      .subscribe((controller) => bind(controller));
  }

  get _fullsizeDialogView() {
    const id = this._fullsizeDialogViewId;
    if (!id || !this.views) return null;
    return this.views.find((v) => v.id === id) ?? null;
  }

  _pickerItemsFromViews() {
    if (!this.views?.length) return [];
    const items = [];
    let lastSection;
    for (const v of this.views) {
      if (v.section && v.section !== lastSection) {
        items.push({ section: v.section });
        lastSection = v.section;
      }
      const opensExternally = v.experience === 'window' || v.experience === 'fullsize-dialog'
        || v.experience === 'modal';
      items.push({
        value: v.id,
        label: v.getLabel?.() ?? v.label,
        ...(opensExternally && {
          action: true,
          trailingIcon: OPEN_IN_ICON_URL,
          ariaLabel: v.experience === 'window'
            ? `${v.label} (opens in new tab)`
            : `${v.label} (opens in dialog)`,
        }),
      });
    }
    return items;
  }

  _pruneLoadedViews() {
    const viewsById = new Map(this.views.map((v) => [v.id, v]));
    Object.keys(this._loaded).forEach((id) => {
      const view = viewsById.get(id);
      if (!view || (view.cacheKey !== undefined && view.cacheKey !== this._loadedKeys[id])) {
        this._loaded[id].remove();
        delete this._loaded[id];
        delete this._loadedKeys[id];
      }
    });
  }

  _clearPageBoundViews() {
    Object.keys(this._loaded).forEach((id) => {
      if (this._loadedKeys[id] !== undefined) {
        this._loaded[id].remove();
        delete this._loaded[id];
        delete this._loadedKeys[id];
      }
    });
  }

  async updated(changed) {
    if (changed.has('contextKey')) this._clearPageBoundViews();
    if (changed.has('views')) await this._onViewsChange();
    if (changed.has('activeId')) {
      if (this.activeId) persistToolPanelView(this.activeId);
      this._syncContent();
      this._syncHeaderActions();
      this._broadcastActiveView();
    }
    if (changed.has('_fullsizeDialogViewId') && this._fullsizeDialogViewId) {
      await this._mountDialog();
    }
  }

  async _onViewsChange() {
    const requestedView = this.pendingView;
    this.pendingView = undefined;

    if (!this.views?.length) {
      this._closeDialog();
      this.activeId = undefined;
      this._loaded = {};
      this._loadedKeys = {};
      this.shadowRoot.querySelector('.tool-panel-content').replaceChildren();
      return;
    }

    this._pruneLoadedViews();
    const ids = new Set(this.views.map((v) => v.id));

    if (this._fullsizeDialogViewId && !ids.has(this._fullsizeDialogViewId)) {
      this._closeDialog();
    }

    if (!this.activeId || !ids.has(this.activeId)) {
      const initial = (requestedView && ids.has(requestedView))
        ? requestedView
        : await resolveInitialToolPanelView({
          org: this.org,
          site: this.site,
          availableIds: ids,
        });
      await this.showPanel(initial ?? this.views[0].id);
    } else if (!this._loaded[this.activeId]) {
      await this.showPanel(this.activeId);
      this._syncContent();
    }
  }

  async _mountDialog() {
    await this.updateComplete;
    const dialog = this.shadowRoot.querySelector('.tool-panel-fullsize-dialog');
    const body = dialog.querySelector('.tool-panel-fullsize-dialog-body');
    const viewId = this._fullsizeDialogViewId;
    if (body.dataset.mountedFor === viewId) return;
    body.innerHTML = '';
    body.dataset.mountedFor = viewId;
    if (!dialog.open) dialog.showModal();
    const view = this.views.find((v) => v.id === viewId);
    await view.loadModal(body, () => dialog.close());
  }

  _closeDialog() {
    const dialog = this.shadowRoot.querySelector('.tool-panel-fullsize-dialog');
    if (dialog?.open) {
      dialog.close();
    } else {
      this._fullsizeDialogViewId = undefined;
    }
  }

  async showPanel(name) {
    const consumer = this.views.find((c) => c.id === name);
    if (!consumer) return;
    const { contextKey } = this;
    if (consumer.experience === 'window') {
      window.open(
        new URL(consumer.sources[0], window.location.href).href,
        '_blank',
        'noopener,noreferrer',
      );
      return;
    }
    if (consumer.experience === 'fullsize-dialog') {
      this._fullsizeDialogViewId = name;
      return;
    }
    if (consumer.experience === 'modal') {
      await consumer.openModal?.();
      return;
    }
    if (!this._loaded[name]) {
      const loaded = await consumer.load();
      const currentConsumer = this.views.find((c) => c.id === name);
      if (this.contextKey !== contextKey || currentConsumer !== consumer) {
        loaded?.remove();
        return;
      }
      this._loaded[name] = loaded;
      this._loadedKeys[name] = consumer.cacheKey;
    }
    this.activeId = name;
  }

  _syncContent() {
    const content = this.shadowRoot.querySelector('.tool-panel-content');
    Object.entries(this._loaded).forEach(([id, el]) => {
      el.hidden = id !== this.activeId;
      if (id === this.activeId && !content.contains(el)) content.append(el);
    });
  }

  _syncHeaderActions() {
    const zone = this.shadowRoot.querySelector('.tool-panel-header-actions');
    zone.textContent = '';
    const consumer = this.views.find((c) => c.id === this.activeId);
    if (!consumer?.firstParty) return;
    const actions = this._loaded[this.activeId]?.getHeaderActions?.();
    if (actions) zone.append(actions);
  }

  _renderDialogIcon(icon) {
    if (!icon) return nothing;
    if (icon.startsWith('#')) return html`<svg class="tool-panel-dialog-icon" aria-hidden="true"><use href="${icon}"></use></svg>`;
    return html`<img class="tool-panel-dialog-icon" src="${icon}" alt="">`;
  }

  _close() {
    this.dispatchEvent(
      new CustomEvent(PANEL_EVENT.CLOSE, { bubbles: true, composed: true }),
    );
  }

  _onFullsizeDialogClose() {
    this._fullsizeDialogViewId = undefined;
  }

  render() {
    const items = this._pickerItemsFromViews();
    const dialogTitle = this._fullsizeDialogView?.label ?? 'Extension';
    const dialogIcon = this._fullsizeDialogView?.icon;

    return html`
      <div class="tool-panel-header">
        <button type="button" class="tool-panel-close" aria-label="Close panel" @click=${this._close}>
          <svg aria-hidden="true" class="icon" viewBox="0 0 20 20"><use href="${CLOSE_ICON_SRC}#icon"></use></svg>
        </button>
        <nx-picker
          .items=${items}
          .value=${this.activeId}
          placement="below-start"
          @change=${(e) => this.showPanel(e.detail.value)}
        ></nx-picker>
        <div class="tool-panel-header-actions"></div>
      </div>
      <div class="tool-panel-content"></div>
      ${this._fullsizeDialogViewId ? html`
        <dialog
          class="tool-panel-fullsize-dialog"
          @close=${this._onFullsizeDialogClose}
        >
          <div class="tool-panel-fullsize-dialog-header">
            <div class="tool-panel-fullsize-dialog-title">
              ${this._renderDialogIcon(dialogIcon)}
              <p>${dialogTitle}</p>
            </div>
            <button type="button" class="tool-panel-fullsize-dialog-close" aria-label="Close"
              @click=${(e) => e.target.closest('dialog').close()}>✕</button>
          </div>
          <div class="tool-panel-fullsize-dialog-body"></div>
        </dialog>
      ` : nothing}
    `;
  }
}

customElements.define('ew-tool-panel', EwToolPanel);
