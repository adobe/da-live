const ROW = '[role="row"]';
const CONTROL = 'button, input, a[href], [role="button"]';
const TEXT_ENTRY = 'input, textarea, [contenteditable="true"]';

export function treegridRows(root) {
  return [...root.querySelectorAll(ROW)];
}

export function rowControls(row) {
  return [...row.querySelectorAll(CONTROL)]
    .filter((el) => el.closest(ROW) === row && !el.disabled);
}

function level(row) {
  return Number(row?.getAttribute('aria-level')) || 1;
}

function parentRow(rows, index) {
  const own = level(rows[index]);
  for (let i = index - 1; i >= 0; i -= 1) {
    if (level(rows[i]) < own) return rows[i];
  }
  return undefined;
}

export function treegridEnsureTabStop(root) {
  const rows = treegridRows(root);
  if (rows.length && !rows.some((row) => row.tabIndex === 0)) rows[0].tabIndex = 0;
}

export function treegridFocusIn(e, { root }) {
  const row = e.target.closest?.(ROW);
  if (!row) return;
  treegridRows(root).forEach((el) => { el.tabIndex = el === row ? 0 : -1; });
}

function rowKeydown(e, row, rows, { toggle, activate }) {
  const index = rows.indexOf(row);
  const expanded = row.getAttribute('aria-expanded');
  let next;
  switch (e.key) {
    case 'ArrowDown': next = rows[index + 1]; break;
    case 'ArrowUp': next = rows[index - 1]; break;
    case 'Home': [next] = rows; break;
    case 'End': next = rows[rows.length - 1]; break;
    case 'ArrowRight': {
      if (expanded === 'false') {
        e.preventDefault();
        toggle(row);
        return;
      }
      const [control] = rowControls(row);
      const child = rows[index + 1];
      if (control) next = control;
      else if (expanded === 'true' && level(child) === level(row) + 1) next = child;
      break;
    }
    case 'ArrowLeft':
      if (expanded === 'true') {
        e.preventDefault();
        toggle(row);
        return;
      }
      next = parentRow(rows, index);
      break;
    case 'Enter':
    case ' ':
      e.preventDefault();
      activate(row);
      return;
    default: return;
  }
  e.preventDefault();
  next?.focus();
}

function controlKeydown(e, control, row, rows) {
  const controls = rowControls(row);
  const index = controls.indexOf(control);
  let next;
  switch (e.key) {
    case 'ArrowRight': next = controls[index + 1]; break;
    case 'ArrowLeft': next = index === 0 ? row : controls[index - 1]; break;
    case 'ArrowDown':
    case 'ArrowUp': {
      const adjacent = rows[rows.indexOf(row) + (e.key === 'ArrowDown' ? 1 : -1)];
      next = adjacent && (rowControls(adjacent)[index] ?? adjacent);
      break;
    }
    case 'Escape': next = row; break;
    default: return;
  }
  e.preventDefault();
  next?.focus();
}

export function treegridKeydown(e, {
  root,
  toggle = (row) => row.click(),
  activate = (row) => row.click(),
}) {
  const active = root.activeElement;
  if (!active || active.matches(TEXT_ENTRY)) return;
  const rows = treegridRows(root);
  if (active.matches(ROW)) {
    rowKeydown(e, active, rows, { toggle, activate });
    return;
  }
  const row = active.closest(ROW);
  if (row && active.matches(CONTROL)) controlKeydown(e, active, row, rows);
}
