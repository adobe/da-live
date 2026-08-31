export function treeEnsureTabStop(shadowRoot) {
  const items = [...shadowRoot.querySelectorAll('[role="treeitem"]')];
  if (items.length && !items.some((el) => el.tabIndex === 0)) items[0].tabIndex = 0;
}

export function treeFocusIn(e, shadowRoot) {
  const item = e.target.closest('[role="treeitem"]');
  if (!item) return;
  shadowRoot.querySelectorAll('[role="treeitem"]').forEach((el) => {
    el.tabIndex = el === item ? 0 : -1;
  });
}

export function treeKeydown(e, shadowRoot) {
  const items = [...shadowRoot.querySelectorAll('[role="treeitem"]')];
  if (!items.length) return;
  const { activeElement } = shadowRoot;
  // Focus may be on a row's action button (e.g. copy-url) rather than the treeitem
  // itself, since those buttons are real Tab stops. Fall back to that button's own
  // row so arrow-key navigation keeps working from there.
  const rowItem = activeElement?.closest('[role="treeitem"]')
    ?? activeElement?.closest('.row-wrap')?.querySelector('[role="treeitem"]');
  const activeIdx = items.indexOf(activeElement);
  const idx = activeIdx !== -1 ? activeIdx : items.indexOf(rowItem);
  if (idx === -1) return;

  let next = idx;
  switch (e.key) {
    case 'ArrowDown': next = Math.min(idx + 1, items.length - 1); break;
    case 'ArrowUp': next = Math.max(idx - 1, 0); break;
    case 'Home': next = 0; break;
    case 'End': next = items.length - 1; break;
    default: return;
  }

  if (next !== idx) {
    e.preventDefault();
    items[idx].tabIndex = -1;
    items[next].tabIndex = 0;
    items[next].focus();
  }
}
