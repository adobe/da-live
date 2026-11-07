import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

const nx = getNx();
const { loadStyle } = await import(`${nx}/utils/utils.js`);
await import(`${nx}/blocks/shared/popover/popover.js`);

const [style, contentStyle] = await Promise.all([
  loadStyle(import.meta.url),
  loadStyle(new URL('./popup-menu-content.css', import.meta.url).href),
]);

/**
 * The trigger and menu item styles. The trigger and the items live in the
 * host's own tree, so a host adopts this sheet next to its own styles.
 */
export const popupMenuStyles = contentStyle;

const ITEM_SELECTOR = '[role^="menuitem"]';
const SECONDARY_SELECTOR = '[data-menu-secondary]';
const KEEP_OPEN_SELECTOR = '[data-menu-keep-open]';
const OPEN_KEYS = ['ArrowDown', 'ArrowUp'];
const MOVE_KEYS = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

/**
 * The `da-popup-menu` element. A button that opens a menu of choices. Unlike
 * `nx-picker`, it tells its button and screen readers whether the menu is
 * open and supports the usual menu keys.
 *
 * Put the button in `slot="trigger"` and the items, with a `menuitem`,
 * `menuitemradio` or `menuitemcheckbox` role, as the other children. Mark an
 * item `data-menu-keep-open` to keep the menu open after a click, or
 * `data-menu-secondary` for a second action in the same row.
 */
class DaPopupMenu extends LitElement {
  static properties = {
    label: { type: String },
    placement: { type: String },
  };

  _isMenuOpen = false;

  /**
   * Opens below the trigger's start edge by default.
   */
  constructor() {
    super();
    this.placement = 'below';
  }

  /**
   * Adopts the styles and starts handling clicks and keys.
   */
  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.addEventListener('click', this._onClick);
    this.addEventListener('keydown', this._onKeyDown);
  }

  /**
   * Stops handling clicks and keys and forgets the open state, because the
   * popover leaves the top layer with this element.
   */
  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('click', this._onClick);
    this.removeEventListener('keydown', this._onKeyDown);
    this._isMenuOpen = false;
    this._syncTrigger();
  }

  /**
   * Whether the menu is open.
   *
   * @returns {boolean} True while the menu shows.
   */
  get open() {
    return this._isMenuOpen;
  }

  /**
   * The child button that opens the menu.
   *
   * @returns {HTMLElement | null} The trigger, if there is one.
   */
  get trigger() {
    return this.querySelector(':scope > [slot="trigger"]');
  }

  /**
   * The popover that shows the menu content.
   *
   * @returns {HTMLElement | null} The popover, once rendered.
   */
  get _popover() {
    return this.shadowRoot?.querySelector('nx-popover') ?? null;
  }

  /**
   * Opens the menu and focuses its current, checked or first item.
   *
   * @returns {Promise<void>}
   */
  async show() {
    if (this._isMenuOpen) {
      this._focusInitialItem();
      return;
    }

    await this.updateComplete;
    this._isMenuOpen = true;
    this._syncTrigger();
    this._popover.show({ anchor: this.trigger, placement: this.placement });
    await this._popover.updateComplete;
    this._focusInitialItem();
  }

  /**
   * Closes the menu. Focus goes back to the trigger when it was in the menu.
   */
  close() {
    this._popover?.close();
    if (this._isMenuOpen) {
      this._onPopoverClose();
    }
  }

  /**
   * Opens the menu when it is closed, otherwise closes it.
   *
   * @returns {Promise<void>}
   */
  async toggle() {
    if (this._isMenuOpen) {
      this.close();
      return;
    }

    await this.show();
  }

  /**
   * Marks the trigger as a menu button and mirrors the open state on it.
   */
  _syncTrigger() {
    const { trigger } = this;
    if (!trigger) {
      return;
    }

    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', String(this._isMenuOpen));
  }

  /**
   * Lists the menu items that Arrow Up and Arrow Down move between.
   *
   * @returns {Array<HTMLElement>} The primary items, in document order.
   */
  _items() {
    const { trigger } = this;
    return [...this.querySelectorAll(ITEM_SELECTOR)]
      .filter((item) => !item.matches(SECONDARY_SELECTOR) && !trigger?.contains(item));
  }

  /**
   * Finds the primary item of the row an item belongs to.
   *
   * @param {HTMLElement} item - A primary or secondary item.
   * @returns {HTMLElement | null} The row's primary item.
   */
  _primaryOf(item) {
    if (!item.matches(SECONDARY_SELECTOR)) {
      return item;
    }

    return item.parentElement?.querySelector(`${ITEM_SELECTOR}:not(${SECONDARY_SELECTOR})`) ?? null;
  }

  /**
   * Tells whether an element in the host's tree has focus.
   *
   * @param {Element} element - The element to check.
   * @returns {boolean} Whether it is the focused element.
   */
  _hasFocus(element) {
    return this.getRootNode().activeElement === element;
  }

  /**
   * Focuses an item. The popover hides itself until it has positioned, so a
   * failed first attempt tries again on the next frame.
   *
   * @param {HTMLElement} [item] - The item to focus.
   */
  _focusItem(item) {
    if (!item) {
      return;
    }

    item.focus();
    if (!this._hasFocus(item)) {
      requestAnimationFrame(() => item.focus());
    }
  }

  /**
   * Focuses the current item, else the checked item, else the first item.
   */
  _focusInitialItem() {
    const items = this._items();
    const marked = items.find((item) => item.getAttribute('aria-current') === 'true'
      || item.getAttribute('aria-checked') === 'true');
    this._focusItem(marked ?? items[0]);
  }

  /**
   * Resets the open state once the popover closes, for example on Escape or
   * a click outside, and keeps the event inside this element.
   *
   * @param {Event} [event] - The popover's close event.
   */
  _onPopoverClose(event) {
    event?.stopPropagation();
    if (!this._isMenuOpen) {
      return;
    }

    const { trigger } = this;
    const active = this.getRootNode().activeElement;
    const focusWasInMenu = !!active && this.contains(active) && !trigger?.contains(active);
    this._isMenuOpen = false;
    this._syncTrigger();
    if (focusWasInMenu) {
      trigger?.focus();
    }
  }

  /**
   * Toggles the menu from its trigger and closes it once an item is picked.
   *
   * @param {MouseEvent} event - The click event.
   */
  _onClick = (event) => {
    if (this.trigger?.contains(event.target)) {
      this.toggle();
      return;
    }

    const item = event.target.closest?.(ITEM_SELECTOR);
    if (!item || item.matches(KEEP_OPEN_SELECTOR) || item.getAttribute('aria-disabled') === 'true') {
      return;
    }

    this.close();
  };

  /**
   * Routes a key press to the trigger or the menu handling.
   *
   * @param {KeyboardEvent} event - The keydown event.
   */
  _onKeyDown = (event) => {
    if (this.trigger?.contains(event.target)) {
      this._onTriggerKeyDown(event);
      return;
    }

    if (this._isMenuOpen) {
      this._onMenuKeyDown(event);
    }
  };

  /**
   * Opens the menu with Arrow Down or Arrow Up on the trigger.
   *
   * @param {KeyboardEvent} event - The keydown event.
   */
  _onTriggerKeyDown(event) {
    if (!OPEN_KEYS.includes(event.key)) {
      return;
    }

    event.preventDefault();
    this.show();
  }

  /**
   * Moves focus between items and closes the menu on Escape or Tab.
   *
   * @param {KeyboardEvent} event - The keydown event.
   */
  _onMenuKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }

    if (event.key === 'Tab') {
      this.close();
      return;
    }

    const item = event.target.closest?.(ITEM_SELECTOR);
    if (!item) {
      return;
    }

    if (MOVE_KEYS.includes(event.key)) {
      event.preventDefault();
      this._focusItem(this._nextItem(event.key, this._primaryOf(item)));
      return;
    }

    if (event.key === 'ArrowRight' && !item.matches(SECONDARY_SELECTOR)) {
      event.preventDefault();
      this._focusItem(item.parentElement?.querySelector(SECONDARY_SELECTOR));
      return;
    }

    if (event.key === 'ArrowLeft' && item.matches(SECONDARY_SELECTOR)) {
      event.preventDefault();
      this._focusItem(this._primaryOf(item));
    }
  }

  /**
   * Finds the item a navigation key moves to. Arrow keys wrap around.
   *
   * @param {string} key - Arrow Down, Arrow Up, Home or End.
   * @param {HTMLElement | null} item - The primary item that has focus.
   * @returns {HTMLElement | undefined} The item to focus.
   */
  _nextItem(key, item) {
    const items = this._items();
    if (key === 'Home') {
      return items[0];
    }

    if (key === 'End') {
      return items.at(-1);
    }

    const step = key === 'ArrowDown' ? 1 : -1;
    return items[(items.indexOf(item) + step + items.length) % items.length];
  }

  /**
   * Keeps the trigger's state attributes after each render.
   */
  updated() {
    this._syncTrigger();
  }

  /**
   * Renders the trigger slot and the popover with the menu content.
   *
   * @returns {unknown} The menu template.
   */
  render() {
    return html`
      <slot name="trigger" @slotchange=${this._syncTrigger}></slot>
      <nx-popover role="menu" aria-label=${this.label ?? nothing}
        placement=${this.placement}
        @close=${this._onPopoverClose}>
        <slot></slot>
      </nx-popover>
    `;
  }
}

if (!customElements.get('da-popup-menu')) {
  customElements.define('da-popup-menu', DaPopupMenu);
}
