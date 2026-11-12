import { LitElement, html, nothing, repeat } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import { TOOL_PANEL_TAG } from './tool-panel-section.js';
import DragHandler from '../drag-handler.js';
import drawDragPreview from '../drag-preview.js';

const nx = getNx();
const [{ loadStyle }, { PANEL_EVENT }] = await Promise.all([
  import(`${nx}/utils/utils.js`),
  import(`${nx}/utils/panel.js`),
  import(`${nx}/blocks/shared/picker/picker.js`),
]);

const nx2 = getNx2();
// Spinner styles cover first-party header actions (e.g. refresh) mounted in this shadow root.
const [buttons, spinner, style] = await Promise.all([
  loadStyle(`${nx2}/styles/buttons.css`),
  loadStyle(`${nx2}/styles/spinner.css`),
  loadStyle(import.meta.url),
]);

const ICONS = {
  chevron: '/img/icons/s2-icon-chevronleft-10-n.svg',
  close: '/img/icons/s2-icon-splitright-20-n.svg',
  fullscreen: '/img/icons/s2-icon-fullscreen-20-n.svg',
  openIn: '/img/icons/s2-icon-openin-20-n.svg',
};

/**
 * View `experience` values that open outside the panel, so they can't be pinned
 * as tabs. Views with any other value, or none, render inline.
 * - `window` opens the view's first `sources` URL in a new browser tab.
 * - `fullsize-dialog` mounts the view in the panel's full size dialog.
 * - `modal` calls the view's own `openModal()`.
 */
const EXTERNAL_EXPERIENCES = new Set(['window', 'fullsize-dialog', 'modal']);

const opensOutsidePanel = (view) => EXTERNAL_EXPERIENCES.has(view.experience);

const canPin = (view) => !!view && !opensOutsidePanel(view);

const labelOf = (view) => view.getLabel?.() ?? view.label;

class DaToolPanel extends LitElement {
  static properties = {
    views: { attribute: false },
    activeId: { type: String },
    org: { type: String },
    site: { type: String },
    contextKey: { type: String },
    host: { attribute: false },
    _fullsizeDialogViewId: { state: true },
    _pinnedIds: { state: true },
    _tabOverflow: { state: true },
  };

  _loaded = {};

  _loadedKeys = {};

  _labelUnsubscribers = [];

  _tabDrag = new DragHandler({
    type: 'application/x-da-panel-tab',
    createPreview: (tab) => drawDragPreview(tab, tab.parentElement),
    canDrop: (id, targetId) => this._pinnedIds.includes(id) && this._pinnedIds.includes(targetId),
    onDrop: (move) => this._reorderTab(move),
    onChange: () => this.requestUpdate(),
  });

  constructor() {
    super();
    this._pinnedIds = [];
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [buttons, spinner, style];

    if (this.hasUpdated) {
      this._bindViewLabels();
    }

    this._onRailToggle = () => this._notifyActiveView();
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
    this._tabDrag.end();
    this._tabResizeObserver?.disconnect();
    cancelAnimationFrame(this._tabResizeFrame);
    this._observedTabs = undefined;
    this._unbindViewLabels();
    document.removeEventListener(PANEL_EVENT.OPEN, this._onRailToggle);
    document.removeEventListener(PANEL_EVENT.CLOSE, this._onRailToggle);
  }

  _notifyActiveView() {
    const rail = this.closest('aside.panel');
    const visible = !!rail && !rail.hasAttribute('hidden');
    this.host?.onActiveViewChange?.(visible ? this.activeId : null);
  }

  _bindViewLabels() {
    this._unbindViewLabels();
    if (!this.isConnected) {
      return;
    }

    const refresh = () => this.requestUpdate();
    this._labelUnsubscribers = (this.views ?? [])
      .map((view) => view.subscribeLabel?.(refresh))
      .filter((unsubscribe) => typeof unsubscribe === 'function');
  }

  _unbindViewLabels() {
    this._labelUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this._labelUnsubscribers = [];
  }

  _viewById(id) {
    return this.views?.find((view) => view.id === id);
  }

  get _fullsizeDialogView() {
    return this._viewById(this._fullsizeDialogViewId) ?? null;
  }

  get _pinnedViews() {
    return this._pinnedIds
      .map((id) => this._viewById(id))
      .filter(canPin);
  }

  _setPinnedIds(ids) {
    this._pinnedIds = ids;
    this.host?.persistPinnedViews?.(ids);
  }

  _pickerItemsFromViews() {
    const items = [];
    let lastSection;
    for (const view of this.views ?? []) {
      if (view.section && view.section !== lastSection) {
        items.push({ section: view.section });
        lastSection = view.section;
      }
      items.push(this._pickerItem(view));
    }
    return items;
  }

  _pickerItem(view) {
    const item = { value: view.id, label: labelOf(view) };
    if (!opensOutsidePanel(view)) {
      return item;
    }

    const opensInTab = view.experience === 'window';
    return {
      ...item,
      action: true,
      trailingIcon: opensInTab ? ICONS.openIn : ICONS.fullscreen,
      ariaLabel: `${view.label} (opens in ${opensInTab ? 'new tab' : 'dialog'})`,
    };
  }

  async _onPickerChange(event) {
    const { value, selected } = event.detail;
    const view = this._viewById(value);
    if (!view) {
      return;
    }

    if (!canPin(view) || selected !== false) {
      await this.showPanel(value);
      return;
    }

    if (this._pinnedViews.length <= 1) {
      event.currentTarget.values = this._pinnedViews.map((pinned) => pinned.id);
      return;
    }

    this._setPinnedIds(this._pinnedIds.filter((id) => id !== value));
    if (this.activeId === value) {
      await this.showPanel(this._pinnedViews[0].id);
    }
  }

  async _reorderTab({ id, targetId, before }) {
    if (id === targetId || !this._pinnedIds.includes(id)
      || !this._pinnedIds.includes(targetId)) {
      return;
    }

    const reordered = this._pinnedIds.filter((value) => value !== id);
    reordered.splice(reordered.indexOf(targetId) + (before ? 0 : 1), 0, id);
    if (reordered.every((value, index) => value === this._pinnedIds[index])) {
      return;
    }

    this._setPinnedIds(reordered);
    await this.updateComplete;
    [...this.shadowRoot.querySelectorAll('.tool-panel-tab')]
      .find((button) => button.dataset.viewId === id)?.focus();
  }

  _syncTabOverflow() {
    if (!this.isConnected) {
      return;
    }

    const tabs = this.shadowRoot.querySelector('.tool-panel-tabs');
    if (tabs !== this._observedTabs) {
      this._tabResizeObserver?.disconnect();
      if (tabs) {
        this._tabResizeObserver?.observe(tabs);
      }
      this._observedTabs = tabs;
    }
    const left = !!tabs && tabs.scrollLeft > 1;
    const right = !!tabs && tabs.scrollWidth - tabs.clientWidth - tabs.scrollLeft > 1;
    if (this._tabOverflow?.left !== left || this._tabOverflow?.right !== right) {
      this._tabOverflow = { left, right };
    }
  }

  _scrollTabs(direction) {
    const tabs = this.shadowRoot.querySelector('.tool-panel-tabs');
    if (!tabs) {
      return;
    }

    const bounds = tabs.getBoundingClientRect();
    const items = [...tabs.querySelectorAll('.tool-panel-tab-item')];
    const target = direction > 0
      ? items.find((item) => item.getBoundingClientRect().right > bounds.right - 3)
      : items.reverse().find((item) => item.getBoundingClientRect().left < bounds.left + 3);
    if (!target) {
      return;
    }

    const rect = target.getBoundingClientRect();
    tabs.scrollBy({
      left: direction > 0 ? rect.right - bounds.right + 4 : rect.left - bounds.left - 4,
      behavior: 'smooth',
    });
  }

  _onTabKeyDown(event, id) {
    if (!event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      return;
    }

    const visibleIds = this._pinnedViews.map((pinned) => pinned.id);
    const before = event.key === 'ArrowLeft';
    const targetId = visibleIds[visibleIds.indexOf(id) + (before ? -1 : 1)];
    event.preventDefault();
    if (targetId) {
      this._reorderTab({ id, targetId, before });
    }
  }

  _pruneLoadedViews() {
    const viewsById = new Map(this.views.map((view) => [view.id, view]));
    Object.keys(this._loaded).forEach((id) => {
      if (this._isOutdated(id, viewsById.get(id))) {
        this._dropLoadedView(id);
      }
    });
  }

  _dropLoadedView(id) {
    this._loaded[id].remove();
    delete this._loaded[id];
    delete this._loadedKeys[id];
  }

  _isOutdated(id, view) {
    if (!view) {
      return true;
    }

    return view.cacheKey !== undefined && view.cacheKey !== this._loadedKeys[id];
  }

  _clearPageBoundViews() {
    Object.keys(this._loaded).forEach((id) => {
      if (this._loadedKeys[id] !== undefined) {
        this._dropLoadedView(id);
      }
    });
  }

  willUpdate(changed) {
    if (changed.has('host')) {
      this._pinnedIds = this.host?.readPinnedViews?.() ?? [];
    }
  }

  async updated(changed) {
    this._syncTabOverflow();
    if (changed.has('contextKey')) {
      this._tabDrag.end();
      this._clearPageBoundViews();
    }
    if (changed.has('views')) {
      this._bindViewLabels();
      await this._onViewsChange();
    }
    if (changed.has('activeId')) {
      this._onActiveIdChange();
    }
    if (changed.has('_fullsizeDialogViewId') && this._fullsizeDialogViewId) {
      await this._mountDialog();
    }
  }

  _onActiveIdChange() {
    if (this.activeId) {
      this.host?.persistView?.(this.activeId);
    }
    this._syncContent();
    this._syncHeaderActions();
    this._notifyActiveView();
    this.shadowRoot.querySelector('.tool-panel-tab[aria-pressed="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  async _onViewsChange() {
    const requestedView = this.pendingView;
    this.pendingView = undefined;

    if (!this.views?.length) {
      this._resetViews();
      return;
    }

    this._pruneLoadedViews();
    const ids = new Set(this.views.map((view) => view.id));
    if (this._fullsizeDialogViewId && !ids.has(this._fullsizeDialogViewId)) {
      this._closeDialog();
    }

    if (!this.activeId || !ids.has(this.activeId)) {
      const request = this._panelRequest;
      const initial = (requestedView && ids.has(requestedView))
        ? requestedView
        : await this.host?.resolveInitialView?.({
          org: this.org,
          site: this.site,
          availableIds: ids,
        });
      if (this._panelRequest !== request) return;
      await this.showPanel(initial ?? this._pinnedViews[0]?.id ?? this.views[0].id);
    } else if (!this._loaded[this.activeId]) {
      await this.showPanel(this.activeId);
      this._syncContent();
    }
  }

  _resetViews() {
    this._closeDialog();
    this.activeId = undefined;
    this._loaded = {};
    this._loadedKeys = {};
    this.shadowRoot.querySelector('.tool-panel-content').replaceChildren();
  }

  async setContext(context, viewId, options) {
    const modal = !!options?.modal;
    const loading = this._loadContext(context ?? {}, modal ? undefined : viewId);
    const load = this._contextLoad;
    const replaced = await loading;
    await this.updateComplete;
    if (this._contextLoad !== load) {
      return;
    }

    if (viewId && (!replaced || modal) && this.views?.some((view) => view.id === viewId)) {
      await this.showPanel(viewId, { modal });
    }
  }

  async _loadContext({ org, site }, viewId) {
    const key = org && site ? `${org}/${site}` : '';
    if (key === this.contextKey) {
      await this._contextLoad?.promise;
      return false;
    }

    // Claim the key before awaiting, so a newer context wins the race.
    this.contextKey = key;
    const load = {};
    this._contextLoad = load;
    load.promise = this._applyContext(load, key, { org, site }, viewId);
    try {
      await load.promise;
    } catch (error) {
      if (this._contextLoad === load) {
        this._contextLoad = undefined;
        this.contextKey = undefined;
      }
      throw error;
    }
    return this._contextLoad === load;
  }

  async _applyContext(load, key, { org, site }, viewId) {
    if (!key) {
      Object.assign(this, { org: undefined, site: undefined, views: [] });
      return;
    }

    const views = await this.host.getViews({ org, site });
    if (this._contextLoad !== load) {
      return;
    }

    if (viewId) {
      this.pendingView = viewId;
    }
    Object.assign(this, { org, site, views });
  }

  async _mountDialog() {
    await this.updateComplete;
    const dialog = this.shadowRoot.querySelector('.tool-panel-fullsize-dialog');
    const body = dialog.querySelector('.tool-panel-fullsize-dialog-body');
    const viewId = this._fullsizeDialogViewId;
    if (body.dataset.mountedFor === viewId) {
      return;
    }

    body.replaceChildren();
    body.dataset.mountedFor = viewId;
    if (!dialog.open) {
      dialog.showModal();
    }

    const view = this._viewById(viewId);
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
    const view = this._viewById(this.activeId);
    if (view?.openModal) {
      await view.openModal();
    } else if (view?.loadModal) {
      this._fullsizeDialogViewId = view.id;
    }
  }

  async showPanel(name, { modal = false } = {}) {
    const view = this._viewById(name);
    if (!view) {
      return;
    }

    if (modal && view.loadModal) {
      this._fullsizeDialogViewId = name;
      return;
    }

    if (opensOutsidePanel(view)) {
      await this._openExternally(view);
      return;
    }

    const request = {};
    this._panelRequest = request;
    if (!this._pinnedIds.includes(name)) {
      this._setPinnedIds([...this._pinnedIds, name]);
    }
    if (!this._loaded[name]) {
      const { contextKey } = this;
      const element = await view.load();
      if (this._isStale(view, contextKey)) {
        element?.remove();
        return;
      }

      this._loaded[name] = element;
      this._loadedKeys[name] = view.cacheKey;
    }
    if (this._panelRequest === request) {
      this.activeId = name;
    }
  }

  async _openExternally(view) {
    if (view.experience === 'window') {
      const url = new URL(view.sources[0], window.location.href).href;
      window.open(url, '_blank', 'noopener,noreferrer');
    } else if (view.experience === 'fullsize-dialog') {
      this._fullsizeDialogViewId = view.id;
    } else {
      await view.openModal?.();
    }
  }

  _isStale(view, contextKey) {
    return this.contextKey !== contextKey
      || this._viewById(view.id) !== view
      || !this._pinnedIds.includes(view.id);
  }

  _syncContent() {
    const content = this.shadowRoot.querySelector('.tool-panel-content');
    Object.entries(this._loaded).forEach(([id, element]) => {
      const isActive = id === this.activeId;
      element.hidden = !isActive;
      if (isActive && !content.contains(element)) {
        content.append(element);
      }
    });
  }

  _syncHeaderActions() {
    const zone = this.shadowRoot.querySelector('.tool-panel-header-actions');
    zone.textContent = '';
    const view = this._viewById(this.activeId);
    if (!view?.firstParty) {
      return;
    }

    const actions = this._loaded[this.activeId]?.getHeaderActions?.();
    if (actions) {
      zone.append(actions);
    }
  }

  _renderDialogIcon(icon) {
    if (!icon) {
      return nothing;
    }

    if (icon.startsWith('#')) {
      return html`<svg class="tool-panel-dialog-icon" aria-hidden="true"><use href="${icon}"></use></svg>`;
    }

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
    const activeView = this._viewById(this.activeId);
    const pinnedViews = this._pinnedViews;
    const tabsOverflow = this._tabOverflow?.left || this._tabOverflow?.right;
    const popoutButton = this._renderPopoutButton(activeView);

    return html`
      <div class="tool-panel-header">
        ${pinnedViews.length ? this._renderTabs(pinnedViews, tabsOverflow) : nothing}
        ${tabsOverflow
    ? html`<span class="tool-panel-divider tool-panel-tabs-divider" aria-hidden="true"></span>`
    : nothing}
        <div class="tool-panel-selector">
          <nx-picker
            .items=${this._pickerItemsFromViews()}
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
          <svg aria-hidden="true" class="icon" viewBox="0 0 20 20"><use href="${ICONS.close}#icon"></use></svg>
        </button>
      </div>
      <div class="tool-panel-toolbar" ?hidden=${!activeView}>
        <div class="tool-panel-header-actions"></div>
        ${popoutButton}
      </div>
      <div class="tool-panel-content"></div>
      ${this._fullsizeDialogViewId ? this._renderFullsizeDialog() : nothing}
    `;
  }

  _renderPopoutButton(activeView) {
    if (!activeView?.openModal && !activeView?.loadModal) {
      return nothing;
    }

    const label = `Open ${activeView.label} in dialog`;
    return html`
      <button type="button" class="tool-panel-popout"
        aria-label=${label}
        title=${label}
        aria-haspopup="dialog" @click=${this._openPopout}>
        <svg aria-hidden="true" class="icon" viewBox="0 0 20 20"><use href="${ICONS.fullscreen}#icon"></use></svg>
      </button>
    `;
  }

  _renderTabs(pinnedViews, tabsOverflow) {
    return html`
      <div class="tool-panel-tabs-container">
        <button type="button" class="tool-panel-tab-scroll tool-panel-tab-scroll-left"
          aria-label="Show previous tab" title="Show previous tab"
          ?hidden=${!tabsOverflow}
          ?disabled=${!this._tabOverflow?.left}
          @click=${() => this._scrollTabs(-1)}>
          <svg aria-hidden="true" viewBox="0 0 10 10"><use href="${ICONS.chevron}#icon"></use></svg>
        </button>
        <nav class="tool-panel-tabs" aria-label="Pinned panels"
          ?data-overflow-left=${this._tabOverflow?.left}
          ?data-overflow-right=${this._tabOverflow?.right}
          @scroll=${this._syncTabOverflow}>
          ${repeat(pinnedViews, (view) => view.id, (view) => this._renderTab(view))}
        </nav>
        <button type="button" class="tool-panel-tab-scroll"
          aria-label="Show next tab" title="Show next tab"
          ?hidden=${!tabsOverflow}
          ?disabled=${!this._tabOverflow?.right}
          @click=${() => this._scrollTabs(1)}>
          <svg aria-hidden="true" viewBox="0 0 10 10"><use href="${ICONS.chevron}#icon"></use></svg>
        </button>
      </div>
    `;
  }

  _renderTab(view) {
    const label = labelOf(view);
    return html`
      <div class="tool-panel-tab-item" data-active=${view.id === this.activeId}
        data-drop-side=${this._tabDrag.dropSide(view.id)}
        @dragover=${(event) => this._tabDrag.over(event, view.id)}
        @dragleave=${() => this._tabDrag.leave()}
        @drop=${(event) => this._tabDrag.drop(event, view.id)}>
        <button type="button" class="tool-panel-tab" data-view-id=${view.id}
          draggable="true"
          title=${label}
          aria-pressed=${view.id === this.activeId}
          aria-description="Drag to reorder, or use Alt+Left Arrow or Alt+Right Arrow."
          @dragstart=${(event) => this._tabDrag.start(event, view.id)}
          @dragend=${() => this._tabDrag.end()}
          @keydown=${(event) => this._onTabKeyDown(event, view.id)}
          @click=${() => this.showPanel(view.id)}>${label}</button>
      </div>
    `;
  }

  _renderFullsizeDialog() {
    const view = this._fullsizeDialogView;
    return html`
      <dialog class="tool-panel-fullsize-dialog" @close=${this._onFullsizeDialogClose}>
        <div class="tool-panel-fullsize-dialog-header">
          <div class="tool-panel-fullsize-dialog-title">
            ${this._renderDialogIcon(view?.icon)}
            <p>${view?.label ?? 'Extension'}</p>
          </div>
          <button type="button" class="tool-panel-fullsize-dialog-close" aria-label="Close"
            @click=${this._closeDialog}>✕</button>
        </div>
        <div class="tool-panel-fullsize-dialog-body"></div>
      </dialog>
    `;
  }
}

customElements.define(TOOL_PANEL_TAG, DaToolPanel);
