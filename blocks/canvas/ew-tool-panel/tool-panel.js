import { LitElement, html, nothing, repeat } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import { getCommentsBridge } from '../editor-utils/comments-bridge.js';
import { canvasBus } from '../utils/canvas-bus.js';
import {
  persistToolPanelView,
  persistPinnedToolPanelViews,
  readPinnedToolPanelViews,
  resolveInitialToolPanelView,
} from '../utils/panel.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const { PANEL_EVENT } = await import(`${getNx()}/utils/panel.js`);

await import(`${getNx()}/blocks/shared/picker/picker.js`);

// Spinner styles cover first-party header actions (e.g. refresh) mounted in this shadow root.
const [buttons, spinner, style] = await Promise.all([
  loadStyle(`${getNx2()}/styles/buttons.css`),
  loadStyle(`${getNx2()}/styles/spinner.css`),
  loadStyle(import.meta.url),
]);

const CLOSE_ICON_SRC = '/img/icons/s2-icon-splitright-20-n.svg';
const OPEN_IN_ICON_URL = '/img/icons/s2-icon-openin-20-n.svg';
const FULLSCREEN_ICON_SRC = '/img/icons/s2-icon-fullscreen-20-n.svg';
const CHEVRON_ICON_SRC = '/img/icons/s2-icon-chevronleft-10-n.svg';
const canPin = (view) => view && !['window', 'fullsize-dialog', 'modal'].includes(view.experience);

class EwToolPanel extends LitElement {
  static properties = {
    views: { attribute: false },
    activeId: { type: String },
    org: { type: String },
    site: { type: String },
    contextKey: { type: String },
    _fullsizeDialogViewId: { state: true },
    _pinnedIds: { state: true },
    _tabDrop: { state: true },
    _tabScroll: { state: true },
  };

  _loaded = {};

  _loadedKeys = {};

  constructor() {
    super();
    this._pinnedIds = readPinnedToolPanelViews();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [buttons, spinner, style];
    this._bindCommentCountUpdates();
    this._onRailToggle = () => this._broadcastActiveView();
    document.addEventListener(PANEL_EVENT.OPEN, this._onRailToggle);
    document.addEventListener(PANEL_EVENT.CLOSE, this._onRailToggle);
    this._tabResizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(this._tabResizeFrame);
      this._tabResizeFrame = requestAnimationFrame(() => this._syncTabOverflow());
    });
    this.requestUpdate();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._endTabDrag();
    this._tabResizeObserver?.disconnect();
    cancelAnimationFrame(this._tabResizeFrame);
    this._observedTabs = undefined;
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

  get _pinnedViews() {
    return this._pinnedIds
      .map((id) => this.views?.find((view) => view.id === id))
      .filter(canPin);
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
          trailingIcon: v.experience === 'window' ? OPEN_IN_ICON_URL : FULLSCREEN_ICON_SRC,
          ariaLabel: v.experience === 'window'
            ? `${v.label} (opens in new tab)`
            : `${v.label} (opens in dialog)`,
        }),
      });
    }
    return items;
  }

  async _onPickerChange(event) {
    const { value, selected } = event.detail;
    const view = this.views?.find((v) => v.id === value);
    if (!view) return;
    if (!canPin(view) || selected !== false) {
      await this.showPanel(value);
      return;
    }
    if (this._pinnedViews.length <= 1) {
      event.currentTarget.values = this._pinnedViews.map((v) => v.id);
      return;
    }
    this._pinnedIds = this._pinnedIds.filter((id) => id !== value);
    persistPinnedToolPanelViews(this._pinnedIds);
    if (this.activeId === value) await this.showPanel(this._pinnedViews[0].id);
  }

  async _reorderTab({ id, targetId, before }) {
    if (id === targetId || !this._pinnedIds.includes(id)
      || !this._pinnedIds.includes(targetId)) return;
    const reordered = this._pinnedIds.filter((value) => value !== id);
    reordered.splice(reordered.indexOf(targetId) + (before ? 0 : 1), 0, id);
    if (reordered.every((value, index) => value === this._pinnedIds[index])) return;
    this._pinnedIds = reordered;
    persistPinnedToolPanelViews(reordered);
    await this.updateComplete;
    [...this.shadowRoot.querySelectorAll('.tool-panel-tab')]
      .find((button) => button.dataset.viewId === id)?.focus();
  }

  _startTabDrag(event, id) {
    this._endTabDrag();
    this._tabDrag = { id, contextKey: this.contextKey };
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-da-panel-tab', id);
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    const buttonStyle = getComputedStyle(button);
    const groupStyle = getComputedStyle(button.parentElement);
    const image = document.createElement('canvas');
    const scale = window.devicePixelRatio || 1;
    image.width = Math.ceil(rect.width * scale);
    image.height = Math.ceil(rect.height * scale);
    image.className = 'tool-panel-drag-image';
    image.style.width = `${rect.width}px`;
    image.style.height = `${rect.height}px`;
    const ctx = image.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = groupStyle.backgroundColor;
    ctx.beginPath();
    ctx.roundRect(0, 0, rect.width, rect.height, parseFloat(groupStyle.borderRadius) || 0);
    ctx.fill();
    ctx.font = buttonStyle.font;
    ctx.fillStyle = buttonStyle.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(button.textContent.trim(), rect.width / 2, rect.height / 2, rect.width - 16);
    this.shadowRoot.append(image);
    this._tabDragImage = image;
    event.dataTransfer.setDragImage(image, event.clientX - rect.left, event.clientY - rect.top);
  }

  _canDropTab(targetId) {
    return this._tabDrag && this._tabDrag.contextKey === this.contextKey
      && this._pinnedIds.includes(this._tabDrag.id) && this._pinnedIds.includes(targetId)
      && this._tabDrag.id !== targetId;
  }

  _dragOverTab(event, id) {
    if (!this._canDropTab(id)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    this._tabDrop = { id, side: event.clientX < rect.left + rect.width / 2 ? 'before' : 'after' };
  }

  _dropTab(event, targetId) {
    if (!this._canDropTab(targetId)) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    this._reorderTab({
      id: this._tabDrag.id,
      targetId,
      before: event.clientX < rect.left + rect.width / 2,
    });
    this._endTabDrag();
  }

  _endTabDrag() {
    this._tabDragImage?.remove();
    this._tabDragImage = undefined;
    this._tabDrag = undefined;
    this._tabDrop = undefined;
  }

  _syncTabOverflow() {
    if (!this.isConnected) return;
    const tabs = this.shadowRoot.querySelector('.tool-panel-tabs');
    if (tabs !== this._observedTabs) {
      this._tabResizeObserver?.disconnect();
      if (tabs) this._tabResizeObserver?.observe(tabs);
      this._observedTabs = tabs;
    }
    const left = !!tabs && tabs.scrollLeft > 1;
    const right = !!tabs && tabs.scrollWidth - tabs.clientWidth - tabs.scrollLeft > 1;
    if (this._tabScroll?.left !== left || this._tabScroll?.right !== right) {
      this._tabScroll = { left, right };
    }
  }

  _scrollTabs(direction) {
    const tabs = this.shadowRoot.querySelector('.tool-panel-tabs');
    if (!tabs) return;
    const bounds = tabs.getBoundingClientRect();
    const items = [...tabs.querySelectorAll('.tool-panel-tab-item')];
    const target = direction > 0
      ? items.find((item) => item.getBoundingClientRect().right > bounds.right - 3)
      : items.reverse().find((item) => item.getBoundingClientRect().left < bounds.left + 3);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    tabs.scrollBy({
      left: direction > 0 ? rect.right - bounds.right + 4 : rect.left - bounds.left - 4,
      behavior: 'smooth',
    });
  }

  _onTabKeyDown(event, id) {
    if (!event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const visibleIds = this._pinnedIds.filter(
      (value) => canPin(this.views?.find((view) => view.id === value)),
    );
    const before = event.key === 'ArrowLeft';
    const targetId = visibleIds[visibleIds.indexOf(id) + (before ? -1 : 1)];
    event.preventDefault();
    if (targetId) this._reorderTab({ id, targetId, before });
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
    this._syncTabOverflow();
    if (changed.has('contextKey')) this._clearPageBoundViews();
    if (changed.has('views')) await this._onViewsChange();
    if (changed.has('activeId')) {
      if (this.activeId) persistToolPanelView(this.activeId);
      this._syncContent();
      this._syncHeaderActions();
      this._broadcastActiveView();
      this.shadowRoot.querySelector('.tool-panel-tab[aria-pressed="true"]')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
      await this.showPanel(initial ?? this._pinnedViews[0]?.id ?? this.views[0].id);
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

  async _openPopout() {
    const view = this.views?.find((v) => v.id === this.activeId);
    if (view?.openModal) await view.openModal();
    else if (view?.loadModal) this._fullsizeDialogViewId = view.id;
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
    const request = {};
    this._panelRequest = request;
    if (!this._pinnedIds.includes(name)) {
      this._pinnedIds = [...this._pinnedIds, name];
      persistPinnedToolPanelViews(this._pinnedIds);
    }
    if (!this._loaded[name]) {
      const loaded = await consumer.load();
      const currentConsumer = this.views.find((c) => c.id === name);
      if (this.contextKey !== contextKey || currentConsumer !== consumer
        || !this._pinnedIds.includes(name)) {
        loaded?.remove();
        return;
      }
      this._loaded[name] = loaded;
      this._loadedKeys[name] = consumer.cacheKey;
    }
    if (this._panelRequest === request) this.activeId = name;
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
    const activeView = this.views?.find((v) => v.id === this.activeId);
    const pinnedViews = this._pinnedViews;
    const tabsOverflow = this._tabScroll?.left || this._tabScroll?.right;
    const popoutButton = activeView?.openModal || activeView?.loadModal ? html`
      <button type="button" class="tool-panel-popout"
        aria-label=${`Open ${activeView.label} in dialog`}
        title=${`Open ${activeView.label} in dialog`}
        aria-haspopup="dialog" @click=${this._openPopout}>
        <svg aria-hidden="true" class="icon" viewBox="0 0 20 20"><use href="${FULLSCREEN_ICON_SRC}#icon"></use></svg>
      </button>
    ` : nothing;

    return html`
      <div class="tool-panel-header">
        ${pinnedViews.length ? html`
          <div class="tool-panel-tabs-container">
            <button type="button" class="tool-panel-tab-scroll tool-panel-tab-scroll-left"
              aria-label="Show previous tab" title="Show previous tab"
              ?hidden=${!tabsOverflow}
              ?disabled=${!this._tabScroll?.left}
              @click=${() => this._scrollTabs(-1)}>
              <svg aria-hidden="true" viewBox="0 0 10 10"><use href="${CHEVRON_ICON_SRC}#icon"></use></svg>
            </button>
            <nav class="tool-panel-tabs" aria-label="Pinned panels"
              ?data-overflow-left=${this._tabScroll?.left}
              ?data-overflow-right=${this._tabScroll?.right}
              @scroll=${this._syncTabOverflow}>
              ${repeat(pinnedViews, (view) => view.id, (view) => html`
                <div class="tool-panel-tab-item" data-active=${view.id === this.activeId}
                  data-drop-side=${this._tabDrop?.id === view.id ? this._tabDrop.side : ''}
                  @dragover=${(event) => this._dragOverTab(event, view.id)}
                  @dragleave=${() => { this._tabDrop = undefined; }}
                  @drop=${(event) => this._dropTab(event, view.id)}>
                  <button type="button" class="tool-panel-tab" data-view-id=${view.id}
                    draggable="true"
                    title=${view.getLabel?.() ?? view.label}
                    aria-pressed=${view.id === this.activeId}
                    aria-description="Drag to reorder, or use Alt+Left Arrow or Alt+Right Arrow."
                    @dragstart=${(event) => this._startTabDrag(event, view.id)}
                    @dragend=${this._endTabDrag}
                    @keydown=${(event) => this._onTabKeyDown(event, view.id)}
                    @click=${() => this.showPanel(view.id)}>${view.getLabel?.() ?? view.label}</button>
                </div>
              `)}
            </nav>
            <button type="button" class="tool-panel-tab-scroll"
              aria-label="Show next tab" title="Show next tab"
              ?hidden=${!tabsOverflow}
              ?disabled=${!this._tabScroll?.right}
              @click=${() => this._scrollTabs(1)}>
              <svg aria-hidden="true" viewBox="0 0 10 10"><use href="${CHEVRON_ICON_SRC}#icon"></use></svg>
            </button>
          </div>
        ` : nothing}
        ${tabsOverflow
    ? html`<span class="tool-panel-divider tool-panel-tabs-divider" aria-hidden="true"></span>`
    : nothing}
        <div class="tool-panel-selector">
          <nx-picker
            .items=${items}
            multiple
            .values=${pinnedViews.map((view) => view.id)}
            .labelOverride=${'Panels'}
            placeholder="Panels"
            placement="below-end"
            @change=${this._onPickerChange}
          ></nx-picker>
        </div>
        <span class="tool-panel-divider" aria-hidden="true"></span>
        ${popoutButton}
        <button type="button" class="tool-panel-close" aria-label="Close panel" @click=${this._close}>
          <svg aria-hidden="true" class="icon" viewBox="0 0 20 20"><use href="${CLOSE_ICON_SRC}#icon"></use></svg>
        </button>
      </div>
      <div class="tool-panel-toolbar" ?hidden=${!activeView}>
        <div class="tool-panel-header-actions"></div>
        ${popoutButton}
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
