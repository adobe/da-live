import { LitElement, html, nothing, repeat } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import { TOOL_PANEL_TAG } from './tool-panel-section.js';
import DragHandler from '../drag-handler.js';
import drawDragPreview from '../drag-preview.js';
import { canPin, labelOf, opensOutsidePanel } from './tool-panel-view.js';
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
const DRAG_HINT = 'Drag tabs to reorder';

/**
 * The `da-tool-panel` element. It shows one of a host's views at a time, with
 * the pinned views as tabs and a menu to pin, unpin and open views. When the
 * tabs don't fit, they collapse into one switcher button that opens the same
 * menu.
 *
 * Hosts don't create it directly. `createToolPanelSection` creates it with the
 * host's `host` delegate and calls `setContext` whenever the panel opens. See
 * that function for the delegate contract.
 *
 * A view needs an `id` and a `label`. Inline views provide `load`, which
 * returns the element to show. Views with a `window`, `fullsize-dialog` or
 * `modal` experience open outside the rail instead. A view whose label changes
 * provides `subscribeLabel(onChange)`, which returns its unsubscribe.
 */
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

  /** Each inline view's loaded element, by view id. Reused when switching back. */
  _loaded = {};

  /** The `cacheKey` each element was loaded with, by view id. A new key reloads it. */
  _loadedKeys = {};

  /** Unsubscribes from the views' dynamic labels. */
  _labelUnsubscribers = [];

  /** Reorders the pinned tabs by drag and drop. */
  _tabDrag = new DragHandler({
    type: 'application/x-da-panel-tab',
    createPreview: (tab) => drawDragPreview(tab),
    canDrop: (id, targetId) => this._pinnedIds.includes(id) && this._pinnedIds.includes(targetId),
    onDrop: (move) => this._reorderTab(move),
    onChange: () => this.requestUpdate(),
  });

  /**
   * Starts with no pinned views until the host provides them.
   */
  constructor() {
    super();
    this._pinnedIds = [];
    this._collapsed = false;
  }

  /**
   * Adopts the styles, rebinds dynamic labels after a reconnect and starts
   * listening for the rail opening and closing and for the header resizing.
   */
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

  /**
   * Ends any tab drag and drops the label subscriptions, the rail listeners
   * and the header resize observer.
   */
  disconnectedCallback() {
    super.disconnectedCallback();
    this._tabDrag.end();
    this._fitObserver?.disconnect();
    this._observedFit = undefined;
    this._unbindViewLabels();
    document.removeEventListener(PANEL_EVENT.OPEN, this._onRailToggle);
    document.removeEventListener(PANEL_EVENT.CLOSE, this._onRailToggle);
  }

  /**
   * Tells the host which view is visible, or null while the rail is hidden.
   */
  _notifyActiveView() {
    const rail = this.closest('aside.panel');
    const visible = !!rail && !rail.hasAttribute('hidden');
    this.host?.onActiveViewChange?.(visible ? this.activeId : null);
  }

  /**
   * Re-renders the tabs and menu whenever a view's dynamic label changes. A view
   * opts in with `subscribeLabel(onChange)`, which returns its unsubscribe.
   */
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

  /**
   * Drops every dynamic label subscription.
   */
  _unbindViewLabels() {
    this._labelUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this._labelUnsubscribers = [];
  }

  /**
   * Finds a view by its id.
   *
   * @param {string} id - The view id.
   * @returns {object | undefined} The view, if the panel has it.
   */
  _viewById(id) {
    return this.views?.find((view) => view.id === id);
  }

  /**
   * The view open in the full size dialog.
   *
   * @returns {object | null} The view, or null when the dialog is closed.
   */
  get _fullsizeDialogView() {
    return this._viewById(this._fullsizeDialogViewId) ?? null;
  }

  /**
   * The pinned views that are available and can be pinned, in tab order.
   *
   * @returns {Array<object>} The views shown as tabs.
   */
  get _pinnedViews() {
    return this._pinnedIds
      .map((id) => this._viewById(id))
      .filter(canPin);
  }

  /**
   * Whether enough views are pinned for the tabs to reorder by drag.
   *
   * @returns {boolean} True when two or more views are pinned.
   */
  get _reorderable() {
    return this._pinnedViews.length > 1;
  }

  /**
   * Replaces the pinned view ids and lets the host remember them.
   *
   * @param {Array<string>} ids - The pinned view ids, in tab order.
   */
  _setPinnedIds(ids) {
    this._pinnedIds = ids;
    this.host?.persistPinnedViews?.(ids);
  }

  /**
   * Pins or unpins a view from the menu without switching to it. Unpinning
   * the active view shows the first pinned view instead. The last pinned view
   * stays pinned.
   *
   * @param {string} id - The view id.
   * @returns {Promise<void>}
   */
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

  /**
   * Moves a pinned tab before or after another one and keeps its focus.
   *
   * @param {object} move
   * @param {string} move.id - The tab to move.
   * @param {string} move.targetId - The tab to move next to.
   * @param {boolean} move.before - Whether to move it before the target.
   * @returns {Promise<void>}
   */
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

  /**
   * Starts observing the header area and the hidden tab measurer once they
   * render, so a resize or a font load can switch between tabs and switcher.
   */
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

  /**
   * Shows the tabs while every pinned tab and the menu button fit, and the
   * switcher otherwise. The measurer always lays out every tab and the header
   * area always takes the free space, so neither width depends on the mode
   * and switching can't loop.
   */
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

  /**
   * Moves a tab one place with Alt+Left Arrow or Alt+Right Arrow.
   *
   * @param {KeyboardEvent} event - The keydown event.
   * @param {string} id - The focused tab's view id.
   */
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

  /**
   * Drops loaded elements whose view is gone or whose cache key changed.
   */
  _pruneLoadedViews() {
    const viewsById = new Map(this.views.map((view) => [view.id, view]));
    Object.keys(this._loaded).forEach((id) => {
      if (this._isOutdated(id, viewsById.get(id))) {
        this._dropLoadedView(id);
      }
    });
  }

  /**
   * Removes a loaded element and forgets its cache key.
   *
   * @param {string} id - The id the element was loaded for.
   */
  _dropLoadedView(id) {
    this._loaded[id].remove();
    delete this._loaded[id];
    delete this._loadedKeys[id];
  }

  /**
   * Tells whether a loaded element no longer matches its view, because the
   * view is gone or its cache key changed.
   *
   * @param {string} id - The id the element was loaded for.
   * @param {object} [view] - The current view with that id, if any.
   * @returns {boolean} Whether the element should be dropped.
   */
  _isOutdated(id, view) {
    if (!view) {
      return true;
    }

    return view.cacheKey !== undefined && view.cacheKey !== this._loadedKeys[id];
  }

  /**
   * Drops every loaded element that belongs to the previous org and site.
   */
  _clearPageBoundViews() {
    Object.keys(this._loaded).forEach((id) => {
      if (this._loadedKeys[id] !== undefined) {
        this._dropLoadedView(id);
      }
    });
  }

  /**
   * Reads the host's pinned views whenever the host changes.
   *
   * @param {Map<string, unknown>} changed - The changed properties.
   */
  willUpdate(changed) {
    if (changed.has('host')) {
      this._pinnedIds = this.host?.readPinnedViews?.() ?? [];
    }
  }

  /**
   * Reacts to a changed context, views list, active view or dialog view.
   *
   * @param {Map<string, unknown>} changed - The changed properties.
   * @returns {Promise<void>}
   */
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

  /**
   * Persists the new active view, shows its element, header actions and tab
   * and tells the host.
   */
  _onActiveIdChange() {
    if (this.activeId) {
      this.host?.persistView?.(this.activeId);
    }
    this._syncContent();
    this._syncHeaderActions();
    this._notifyActiveView();
  }

  /**
   * Reconciles loaded elements and the active view with a new views list.
   * A pending view wins, then the host's initial view, then the first pinned
   * view, then the first view.
   */
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

  /**
   * Closes the dialog and drops the active view and every loaded element.
   */
  _resetViews() {
    this._closeDialog();
    this.activeId = undefined;
    this._loaded = {};
    this._loadedKeys = {};
    this.shadowRoot.querySelector('.tool-panel-content').replaceChildren();
  }

  /**
   * Points the panel at an org and site, then shows a view. A newer context
   * wins over one whose views are still loading.
   *
   * @param {object} [context] - The org and site.
   * @param {string} [viewId] - The view to show.
   * @returns {Promise<void>}
   */
  async setContext(context, viewId) {
    const replaced = await this._loadContext(context ?? {}, viewId);
    await this.updateComplete;
    if (viewId && !replaced && this.views?.some((view) => view.id === viewId)) {
      await this.showPanel(viewId);
    }
  }

  /**
   * Loads the host's views when the context changed.
   *
   * @param {object} context - The org and site.
   * @param {string} [viewId] - The view to show once the views are set.
   * @returns {Promise<boolean>} Whether the views were replaced.
   */
  async _loadContext({ org, site }, viewId) {
    const key = org && site ? `${org}/${site}` : '';
    if (key === this.contextKey) {
      return false;
    }

    // Claim the key before awaiting, so a newer context wins the race.
    this.contextKey = key;
    if (!key) {
      Object.assign(this, { org: undefined, site: undefined, views: [] });
      return true;
    }

    const views = await this.host.getViews({ org, site });
    if (this.contextKey !== key) {
      return false;
    }

    if (viewId) {
      this.pendingView = viewId;
    }
    Object.assign(this, { org, site, views });
    return true;
  }

  /**
   * Mounts the full size dialog view once the dialog has rendered. Does
   * nothing when that view is already mounted.
   *
   * @returns {Promise<void>}
   */
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

  /**
   * Closes the full size dialog, or forgets its view when it never opened.
   */
  _closeDialog() {
    const dialog = this.shadowRoot.querySelector('.tool-panel-fullsize-dialog');
    if (dialog?.open) {
      dialog.close();
    } else {
      this._fullsizeDialogViewId = undefined;
    }
  }

  /**
   * Pops the active view out into its modal or full size dialog.
   *
   * @returns {Promise<void>}
   */
  async _openPopout() {
    const view = this._viewById(this.activeId);
    if (view?.openModal) {
      await view.openModal();
    } else if (view?.loadModal) {
      this._fullsizeDialogViewId = view.id;
    }
  }

  /**
   * Opens a view. Inline views get pinned, load once and become active. The
   * most recent request wins. Window, dialog and modal views open outside
   * the panel and leave the active view alone.
   *
   * @param {string} name - The view id.
   * @returns {Promise<void>}
   */
  async showPanel(name) {
    const view = this._viewById(name);
    if (!view) {
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

  /**
   * Opens a window, full size dialog or modal view outside the panel.
   *
   * @param {object} view - The view.
   * @returns {Promise<void>}
   */
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

  /**
   * Tells whether a view's freshly loaded element is outdated because the
   * context changed, the view was replaced or it was unpinned while loading.
   *
   * @param {object} view - The view that was loading.
   * @param {string} contextKey - The context key when loading started.
   * @returns {boolean} Whether the element should be dropped.
   */
  _isStale(view, contextKey) {
    return this.contextKey !== contextKey
      || this._viewById(view.id) !== view
      || !this._pinnedIds.includes(view.id);
  }

  /**
   * Shows the active view's element and hides the other loaded ones.
   */
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

  /**
   * Mounts the active first party view's header actions, if any.
   */
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

  /**
   * Renders the full size dialog icon.
   *
   * @param {string} [icon] - A URL or an `#id` sprite reference.
   * @returns {unknown} The icon template, or nothing without an icon.
   */
  _renderDialogIcon(icon) {
    if (!icon) {
      return nothing;
    }

    if (icon.startsWith('#')) {
      return html`<svg class="tool-panel-dialog-icon" aria-hidden="true"><use href="${icon}"></use></svg>`;
    }

    return html`<img class="tool-panel-dialog-icon" src="${icon}" alt="">`;
  }

  /**
   * Asks the surrounding nx panel to close.
   */
  _close() {
    this.dispatchEvent(
      new CustomEvent(PANEL_EVENT.CLOSE, { bubbles: true, composed: true }),
    );
  }

  /**
   * Forgets the full size dialog view once the dialog closes.
   */
  _onFullsizeDialogClose() {
    this._fullsizeDialogViewId = undefined;
  }

  /**
   * Renders the header with the pinned tabs or the switcher, the views menu
   * and the panel buttons, the toolbar, the content area and the full size
   * dialog while a dialog view is open.
   *
   * @returns {unknown} The panel template.
   */
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

  /**
   * Renders the header area that switches views. It shows the pinned tabs
   * and a menu button while they fit, and one switcher button otherwise. A
   * hidden measurer lays out every tab to decide which one shows.
   *
   * @param {object} [activeView] - The active view.
   * @returns {unknown} The views area template.
   */
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

  /**
   * Renders the icon only button that opens the views menu next to the tabs.
   *
   * @returns {unknown} The button template.
   */
  _renderMenuButton() {
    return html`
      <button slot="trigger" type="button" class="popup-menu-trigger tool-panel-menu-button"
        aria-label=${MENU_LABEL} title=${MENU_LABEL}>
        ${this._renderChevron()}
      </button>
    `;
  }

  /**
   * Renders the button that replaces the tabs when they don't fit. It names
   * the active view and opens the views menu.
   *
   * @param {object} [activeView] - The active view.
   * @returns {unknown} The button template.
   */
  _renderSwitcher(activeView) {
    return html`
      <button slot="trigger" type="button" class="popup-menu-trigger tool-panel-switcher"
        title=${MENU_LABEL}>
        <span class="tool-panel-switcher-label">${activeView ? labelOf(activeView) : MENU_TITLE}</span>
        ${this._renderChevron()}
      </button>
    `;
  }

  /**
   * Renders the chevron that a views menu trigger turns while open.
   *
   * @returns {unknown} The chevron template.
   */
  _renderChevron() {
    return html`<svg aria-hidden="true" class="popup-menu-chevron" viewBox="0 0 20 20"><use href="${ICONS.chevronDown}#icon"></use></svg>`;
  }

  /**
   * Renders the views menu with a section for the pinned views, in tab
   * order, and a section for the rest. The pinned section tells that the
   * tabs drag to reorder while they show.
   *
   * @param {Array<object>} pinnedViews - The views shown as tabs.
   * @returns {unknown} The menu content template.
   */
  _renderMenuContent(pinnedViews) {
    const pinnedIds = new Set(pinnedViews.map((view) => view.id));
    const otherViews = (this.views ?? []).filter((view) => !pinnedIds.has(view.id));
    const onlyOnePinned = !this._reorderable;
    const hint = !this._collapsed && this._reorderable ? DRAG_HINT : '';

    return html`
      ${this._renderMenuGroup('Pinned', pinnedViews, { pinned: true, onlyOnePinned }, hint)}
      ${pinnedViews.length && otherViews.length
    ? html`<hr class="popup-menu-separator" role="separator">`
    : nothing}
      ${this._renderMenuGroup('More panels', otherViews, { pinned: false })}
    `;
  }

  /**
   * Renders one titled section of the views menu, or nothing when it has no
   * views.
   *
   * @param {string} title - The section heading.
   * @param {Array<object>} views - The views in the section.
   * @param {object} state - The pin state shared by the section's rows.
   * @param {string} [hint] - A quiet note under the heading.
   * @returns {unknown} The section template.
   */
  _renderMenuGroup(title, views, state, hint = '') {
    if (!views.length) {
      return nothing;
    }

    return html`
      <div class="tool-panel-menu-group" role="group" aria-label=${title}>
        <div class="popup-menu-heading" aria-hidden="true">${title}</div>
        ${hint ? html`<div class="tool-panel-menu-hint" aria-hidden="true">${hint}</div>` : nothing}
        ${views.map((view) => this._renderMenuRow(view, state))}
      </div>
    `;
  }

  /**
   * Renders one menu row. The row opens its view, and its pin toggle pins or
   * unpins the view without switching. Views that open outside the panel get
   * an "opens in" icon instead of a pin toggle.
   *
   * @param {object} view - The view.
   * @param {object} state
   * @param {boolean} state.pinned - Whether the view is pinned.
   * @param {boolean} [state.onlyOnePinned] - Whether it is the only pinned view.
   * @returns {unknown} The row template.
   */
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

  /**
   * Renders the button that pops the active view out into a dialog.
   *
   * @param {object} [activeView] - The active view.
   * @returns {unknown} The button template, or nothing when the view can't pop out.
   */
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

  /**
   * Renders the pinned tabs.
   *
   * @param {Array<object>} pinnedViews - The views shown as tabs.
   * @returns {unknown} The tabs template.
   */
  _renderTabs(pinnedViews) {
    return html`
      <nav class="tool-panel-tabs" aria-label="Pinned panels"
        ?data-dragging=${this._tabDrag.draggedId !== undefined}>
        ${repeat(pinnedViews, (view) => view.id, (view) => this._renderTab(view))}
      </nav>
    `;
  }

  /**
   * Renders one draggable pinned tab.
   *
   * @param {object} view - The pinned view.
   * @returns {unknown} The tab template.
   */
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

  /**
   * Renders the full size dialog shell. `_mountDialog` fills its body.
   *
   * @returns {unknown} The dialog template.
   */
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
