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

class DaPopupMenu extends LitElement {
  static properties = {
    label: { type: String },
    placement: { type: String },
  };

  _isMenuOpen = false;

  constructor() {
    super();
    this.placement = 'below';
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.addEventListener('click', this._onClick);
    this.addEventListener('keydown', this._onKeyDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('click', this._onClick);
    this.removeEventListener('keydown', this._onKeyDown);
    this._isMenuOpen = false;
    this._syncTrigger();
  }

  get open() {
    return this._isMenuOpen;
  }

  get trigger() {
    return this.querySelector(':scope > [slot="trigger"]');
  }

  get _popover() {
    return this.shadowRoot?.querySelector('nx-popover') ?? null;
  }

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

  close() {
    this._popover?.close();
    if (this._isMenuOpen) {
      this._onPopoverClose();
    }
  }

  async toggle() {
    if (this._isMenuOpen) {
      this.close();
      return;
    }

    await this.show();
  }

  _syncTrigger() {
    const { trigger } = this;
    if (!trigger) {
      return;
    }

    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', String(this._isMenuOpen));
  }

  _items() {
    const { trigger } = this;
    return [...this.querySelectorAll(ITEM_SELECTOR)]
      .filter((item) => !item.matches(SECONDARY_SELECTOR) && !trigger?.contains(item));
  }

  _primaryOf(item) {
    if (!item.matches(SECONDARY_SELECTOR)) {
      return item;
    }

    return item.parentElement?.querySelector(`${ITEM_SELECTOR}:not(${SECONDARY_SELECTOR})`) ?? null;
  }

  _hasFocus(element) {
    return this.getRootNode().activeElement === element;
  }

  _focusItem(item) {
    if (!item) {
      return;
    }

    item.focus();
    if (!this._hasFocus(item)) {
      requestAnimationFrame(() => item.focus());
    }
  }

  _focusInitialItem() {
    const items = this._items();
    const marked = items.find((item) => item.getAttribute('aria-current') === 'true'
      || item.getAttribute('aria-checked') === 'true');
    this._focusItem(marked ?? items[0]);
  }

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

  _onKeyDown = (event) => {
    if (this.trigger?.contains(event.target)) {
      this._onTriggerKeyDown(event);
      return;
    }

    if (this._isMenuOpen) {
      this._onMenuKeyDown(event);
    }
  };

  _onTriggerKeyDown(event) {
    if (!OPEN_KEYS.includes(event.key)) {
      return;
    }

    event.preventDefault();
    this.show();
  }

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

  updated() {
    this._syncTrigger();
  }

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
