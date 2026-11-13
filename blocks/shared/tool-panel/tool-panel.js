import { LitElement, html, nothing, repeat } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import { TOOL_PANEL_TAG } from './tool-panel-section.js';
import DragHandler from '../drag-handler.js';
import drawDragPreview from '../drag-preview.js';
import { popupMenuStyles } from '../popup-menu/popup-menu.js';

const nx = getNx();
const [{ loadStyle }, { PANEL_EVENT }] = await Promise.all([
  import(`${nx}/utils/utils.js`),
  import(`${nx}/utils/panel.js`),
]);

const nx2 = getNx2();
// Spinner styles cover first-party header actions (e.g. refresh) mounted in this shadow root.
const [buttons, spinner, style] = await Promise.all([
  loadStyle(`${nx2}/styles/buttons.css`),
  loadStyle(`${nx2}/styles/spinner.css`),
  loadStyle(import.meta.url),
]);

const ICONS = {
  chevronDown: '/img/icons/s2-icon-chevrondown-20-n.svg',
  close: '/img/icons/s2-icon-splitright-20-n.svg',
  fullscreen: '/img/icons/s2-icon-fullscreen-20-n.svg',
  openIn: '/img/icons/s2-icon-openin-20-n.svg',
  pin: '/img/icons/s2-icon-pinon-20-n.svg',
};

const MENU_TITLE = 'Panels';
const MENU_LABEL = 'All panels';

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
    _collapsed: { state: true },
  };

  _loaded = {};

  _loadedKeys = {};

  _labelUnsubscribers = [];

  _tabDrag = new DragHandler({
    type: 'application/x-da-panel-tab',
    createPreview: (tab) => drawDragPreview(tab),
    canDrop: (id, targetId) => this._pinnedIds.includes(id) && this._pinnedIds.includes(targetId),
    onDrop: (move) => this._reorderTab(move),
    onChange: () => this.requestUpdate(),
  });

  constructor() {
    super();
    this._pinnedIds = [];
    this._collapsed = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [buttons, spinner, popupMenuStyles, style];

    if (this.hasUpdated) {
      this._bindViewLabels();
    }

    this._onRailToggle = () => this._notifyActiveView();
    document.addEventListener(PANEL_EVENT.OPEN, this._onRailToggle);
    document.addEventListener(PANEL_EVENT.CLOSE, this._onRailToggle);
    this._fitObserver = new ResizeObserver(() => this._syncFit());

    this.requestUpdate();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._tabDrag.end();
    this._fitObserver?.disconnect();
    this._observedFit = undefined;
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

  get _reorderable() {
    return this._pinnedViews.length > 1;
  }

  _setPinnedIds(ids) {
    this._pinnedIds = ids;
    this.host?.persistPinnedViews?.(ids);
  }

  async _togglePin(id) {
    const pinned = this._pinnedViews.some((view) => view.id === id);
    if (pinned && !this._reorderable) {
      return;
    }

    if (!pinned) {
      this._setPinnedIds([...this._pinnedIds, id]);
    } else {
      this._setPinnedIds(this._pinnedIds.filter((pinnedId) => pinnedId !== id));
      if (this.activeId === id) {
        await this.showPanel(this._pinnedViews[0].id);
      }
    }
    await this.updateComplete;
    this.shadowRoot.querySelector(`.tool-panel-menu-pin[data-view-id="${id}"]`)?.focus();
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

  _observeFit() {
    const views = this.shadowRoot.querySelector('.tool-panel-views');
    if (!this._fitObserver || !views || views === this._observedFit) {
      return;
    }

    this._fitObserver.disconnect();
    this._fitObserver.observe(views);
    this._fitObserver.observe(views.querySelector('.tool-panel-tabs-measure'));
    this._observedFit = views;
  }

  _syncFit() {
    const views = this.shadowRoot.querySelector('.tool-panel-views');
    const measure = views?.querySelector('.tool-panel-tabs-measure');
    if (!views?.clientWidth || !measure) {
      return;
    }

    const collapsed = measure.getBoundingClientRect().width > views.clientWidth;
    if (collapsed !== this._collapsed) {
      this._collapsed = collapsed;
    }
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
    this._observeFit();
    this._syncFit();
    if (changed.has('_collapsed')) {
      this.shadowRoot.querySelector('.tool-panel-views-menu')?.close();
    }
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
      const initial = (requestedView && ids.has(requestedView))
        ? requestedView
        : await this.host?.resolveInitialView?.({
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
    const popoutButton = this._renderPopoutButton(activeView);

    return html`
      <div class="tool-panel-header">
        ${this._renderViews(activeView)}
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

  _renderViews(activeView) {
    const pinnedViews = this._pinnedViews;
    const collapsed = this._collapsed;

    return html`
      <div class="tool-panel-views" ?data-reorderable=${this._reorderable}>
        ${!collapsed && pinnedViews.length ? this._renderTabs(pinnedViews) : nothing}
        <da-popup-menu class="tool-panel-views-menu" label=${MENU_TITLE} placement="below">
          ${collapsed ? this._renderSwitcher(activeView) : this._renderMenuButton()}
          ${this._renderMenuContent(pinnedViews)}
        </da-popup-menu>
        <div class="tool-panel-tabs-measure" aria-hidden="true">
          ${pinnedViews.map((view) => html`<span class="tool-panel-tab">${labelOf(view)}</span>`)}
          <span class="tool-panel-measure-trigger"></span>
        </div>
      </div>
    `;
  }

  _renderMenuButton() {
    return html`
      <button slot="trigger" type="button" class="popup-menu-trigger tool-panel-menu-button"
        aria-label=${MENU_LABEL} title=${MENU_LABEL}>
        ${this._renderChevron()}
      </button>
    `;
  }

  _renderSwitcher(activeView) {
    return html`
      <button slot="trigger" type="button" class="popup-menu-trigger tool-panel-switcher"
        title=${MENU_LABEL}>
        <span class="tool-panel-switcher-label">${activeView ? labelOf(activeView) : MENU_TITLE}</span>
        ${this._renderChevron()}
      </button>
    `;
  }

  _renderChevron() {
    return html`<svg aria-hidden="true" class="popup-menu-chevron" viewBox="0 0 20 20"><use href="${ICONS.chevronDown}#icon"></use></svg>`;
  }

  _renderMenuContent(pinnedViews) {
    const pinnedIds = new Set(pinnedViews.map((view) => view.id));
    const otherViews = (this.views ?? []).filter((view) => !pinnedIds.has(view.id));
    const onlyOnePinned = !this._reorderable;

    return html`
      ${this._renderMenuGroup('Pinned', pinnedViews, { pinned: true, onlyOnePinned })}
      ${pinnedViews.length && otherViews.length
    ? html`<hr class="popup-menu-separator" role="separator">`
    : nothing}
      ${this._renderMenuGroup('More panels', otherViews, { pinned: false })}
    `;
  }

  _renderMenuGroup(title, views, state) {
    if (!views.length) {
      return nothing;
    }

    return html`
      <div class="tool-panel-menu-group" role="group" aria-label=${title}>
        <div class="popup-menu-heading" aria-hidden="true">${title}</div>
        ${views.map((view) => this._renderMenuRow(view, state))}
      </div>
    `;
  }

  _renderMenuRow(view, { pinned, onlyOnePinned = false }) {
    const label = labelOf(view);
    const external = opensOutsidePanel(view);
    const opensInTab = view.experience === 'window';
    const ariaLabel = external
      ? `${label} (opens in ${opensInTab ? 'new tab' : 'dialog'})`
      : nothing;
    const pinLocked = pinned && onlyOnePinned;
    let pinTitle = pinned ? 'Unpin' : 'Pin';
    if (pinLocked) {
      pinTitle = 'The last pinned panel stays pinned';
    }

    return html`
      <div class="tool-panel-menu-row" role="none">
        <button type="button" role="menuitem" class="popup-menu-item tool-panel-menu-item"
          tabindex="-1" data-view-id=${view.id}
          aria-label=${ariaLabel}
          aria-current=${view.id === this.activeId ? 'true' : nothing}
          @click=${() => this.showPanel(view.id)}>
          <span class="popup-menu-item-label">${label}</span>
          ${external ? html`<svg aria-hidden="true" class="icon" viewBox="0 0 20 20"><use href="${opensInTab ? ICONS.openIn : ICONS.fullscreen}#icon"></use></svg>` : nothing}
        </button>
        ${canPin(view) ? html`
          <button type="button" role="menuitemcheckbox" class="tool-panel-menu-pin"
            tabindex="-1" data-view-id=${view.id} data-menu-secondary data-menu-keep-open
            aria-checked=${pinned ? 'true' : 'false'}
            aria-label="Pin ${label}"
            aria-disabled=${pinLocked ? 'true' : nothing}
            title=${pinTitle}
            @click=${() => this._togglePin(view.id)}>
            <svg aria-hidden="true" class="icon" viewBox="0 0 20 20"><use href="${ICONS.pin}#icon"></use></svg>
          </button>` : nothing}
      </div>
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

  _renderTabs(pinnedViews) {
    return html`
      <nav class="tool-panel-tabs" aria-label="Pinned panels"
        ?data-dragging=${this._tabDrag.draggedId !== undefined}>
        ${repeat(pinnedViews, (view) => view.id, (view) => this._renderTab(view))}
      </nav>
    `;
  }

  _renderTab(view) {
    const label = labelOf(view);
    return html`
      <div class="tool-panel-tab-item" data-active=${view.id === this.activeId}
        ?data-dragged=${this._tabDrag.draggedId === view.id}
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
