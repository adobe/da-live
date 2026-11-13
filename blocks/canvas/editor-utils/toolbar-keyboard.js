/**
 * Keyboard support shared by the floating canvas toolbars (WAI-ARIA toolbar pattern):
 * one Tab stop per toolbar, Left/Right/Home/End move between its controls.
 */

const ITEM_SELECTOR = 'button:not([hidden]):not(:disabled), nx-picker';

/** The toolbar's focusable controls, in visual order. */
export function toolbarItems(root) {
  return [...(root?.querySelectorAll(ITEM_SELECTOR) ?? [])];
}

/** The control that owns `node`: the control itself, or the `nx-menu` wrapping a trigger
 * (focus inside a menu's popover retargets to the menu host). */
function itemFor(items, node) {
  if (!node) return null;
  return items.find((el) => el === node || node.contains?.(el)) ?? null;
}

/** Leave exactly one control in the Tab order: `current` if it is still a control,
 * else the first one. Returns the control left tabbable. */
export function syncRovingTabindex(root, current) {
  const items = toolbarItems(root);
  const active = itemFor(items, current) ?? items[0] ?? null;
  items.forEach((el) => {
    if (el !== active) {
      el.setAttribute('tabindex', '-1');
    } else if (el.localName === 'nx-picker') {
      // Its own trigger button is the Tab stop; a tabindex on the host would add a second.
      el.removeAttribute('tabindex');
    } else {
      el.setAttribute('tabindex', '0');
    }
  });
  return active;
}

/** Focus the first control. Returns false when the toolbar has none. */
export function focusFirstItem(root) {
  const first = syncRovingTabindex(root, null);
  first?.focus();
  return Boolean(first);
}

/** A picker or menu that closes with focus on one of its options (Escape, or an option
 * chosen from the keyboard) would drop focus on <body>; hand it back to the control
 * that opened it. `e` is the popup's bubbling `close` event. */
export function returnFocusFromPopup(e, root) {
  const popup = e.target;
  if (!popup?.shadowRoot?.activeElement) return;
  itemFor(toolbarItems(root), popup)?.focus();
}

const NAV_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End']);

/** Arrow/Home/End navigation between controls. Returns true when handled. */
export function handleToolbarNavKey(e, root) {
  if (!NAV_KEYS.has(e.key) || e.defaultPrevented) return false;
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false;
  const items = toolbarItems(root);
  const current = itemFor(items, root.getRootNode().activeElement);
  const i = items.indexOf(current);
  if (i < 0) return false;
  const last = items.length - 1;
  const next = {
    ArrowRight: i === last ? 0 : i + 1,
    ArrowLeft: i === 0 ? last : i - 1,
    Home: 0,
    End: last,
  }[e.key];
  e.preventDefault();
  syncRovingTabindex(root, items[next]);
  items[next].focus();
  return true;
}
