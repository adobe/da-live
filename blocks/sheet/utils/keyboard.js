// jspreadsheet-ce gives each grid tabindex="1" and handles keys on the whole
// document while a grid is "current", only releasing it on an outside mouse
// click. Keyboard users get pulled into the grid first and can never leave.
//
// It also renders a plain table and keeps focus on its container, so screen
// readers can't reach the cells or tell which one is active. The table is
// exposed as a grid instead, and the active cell holds the focus (roving tabindex).

const isCell = (sheet, node) => node?.tagName === 'TD' && node.parentNode?.parentNode === sheet.tbody && node.hasAttribute('data-x');

function getActiveCell(sheet) {
  if (!sheet.selectedCell) return null;
  const [x, y] = sheet.selectedCell;
  return sheet.records[y]?.[x] ?? null;
}

function getFirstCell(sheet) {
  return sheet.records[0]?.[0] ?? null;
}

function activate(sheet, cell) {
  const lib = window.jspreadsheet;
  if (lib.current !== sheet) {
    lib.current?.resetSelection?.();
    lib.current = sheet;
  }
  if (sheet.selectedCell) return;
  const x = Number(cell?.getAttribute('data-x') ?? 0);
  const y = Number(cell?.getAttribute('data-y') ?? 0);
  sheet.updateSelectionFromCoords(x, y, x, y);
}

function release(sheet) {
  const lib = window.jspreadsheet;
  if (lib.current !== sheet) return;
  sheet.resetSelection(true);
  lib.current = null;
}

function getLabel(sheet) {
  return sheet.name || sheet.options.sheetName || 'Sheet';
}

function applyGridSemantics(sheet) {
  const { table, thead, tbody } = sheet;
  table.setAttribute('role', 'grid');
  table.setAttribute('aria-label', getLabel(sheet));
  const { editable, columns = [] } = sheet.options;
  if (editable === false || (columns.length && columns.every((col) => col.readOnly))) {
    table.setAttribute('aria-readonly', 'true');
  } else {
    table.removeAttribute('aria-readonly');
  }
  thead.querySelectorAll(':scope > tr > td').forEach((td) => td.setAttribute('role', 'columnheader'));
  tbody.querySelectorAll(':scope > tr > td.jexcel_row').forEach((td) => td.setAttribute('role', 'rowheader'));
}

function getCellName(sheet, x, y) {
  const column = sheet.headers[x]?.textContent || x + 1;
  const row = sheet.rows[y]?.children[0]?.textContent || Number(y) + 1;
  return `Column ${column}, row ${row}`;
}

function chain(sheet, event, handler) {
  const original = sheet.options[event];
  sheet.options[event] = (...args) => {
    const result = original?.(...args);
    handler(...args);
    return result;
  };
}

export default function makeKeyboardAccessible(sheet) {
  const { el } = sheet;
  if (!el) return;

  // After Escape, stay inactive until the grid is focused or clicked again
  let escaped = false;
  let rovingCell = null;

  const setRovingCell = (cell, moveFocus) => {
    if (!cell) return;
    cell.setAttribute('tabindex', '0');
    if (moveFocus && document.activeElement !== cell) cell.focus();
    if (rovingCell && rovingCell !== cell) rovingCell.removeAttribute('tabindex');
    rovingCell = cell;
  };

  const syncRovingCell = () => {
    const cell = getActiveCell(sheet);
    if (cell) {
      const moveFocus = !sheet.edition && el.contains(document.activeElement);
      setRovingCell(cell, moveFocus);
    } else if (!rovingCell?.isConnected) {
      setRovingCell(getFirstCell(sheet));
    }
    // Keep the container focusable so clicks on headers don't drop focus, but out of the
    // tab order while a cell can take the focus
    el.setAttribute('tabindex', rovingCell?.isConnected ? '-1' : '0');
  };

  applyGridSemantics(sheet);
  syncRovingCell();

  // Rows and columns can be inserted, deleted or moved at any time
  new MutationObserver((mutations) => {
    const structural = mutations.some(({ addedNodes, removedNodes }) => (
      [...addedNodes, ...removedNodes].some((node) => node.tagName === 'TR' || node.tagName === 'TD')
    ));
    if (!structural) return;
    applyGridSemantics(sheet);
    syncRovingCell();
  }).observe(sheet.table, { childList: true, subtree: true });

  chain(sheet, 'onselection', syncRovingCell);

  // Name the cell editor, otherwise only the value is announced
  chain(sheet, 'oncreateeditor', (_el, cell, x, y, editor) => {
    editor?.setAttribute?.('aria-label', getCellName(sheet, x, y));
  });

  // Copying selects a hidden textarea, which takes the focus from the cell
  chain(sheet, 'oncopy', () => {
    if (document.activeElement === sheet.textarea) rovingCell?.focus();
  });

  el.addEventListener('focusin', (e) => {
    if (e.target === el) {
      // A click on a header or empty space focuses the container: hand focus to the cell
      (getActiveCell(sheet) ?? rovingCell)?.focus();
      return;
    }
    if (!isCell(sheet, e.target)) return;
    escaped = false;
    sheet.table.setAttribute('aria-label', getLabel(sheet));
    activate(sheet, e.target);
  });

  el.addEventListener('pointerdown', () => { escaped = false; });

  el.addEventListener('keydown', (e) => {
    if (sheet.edition) return;
    if (e.key === 'Tab') {
      // Let the browser move focus out instead of jumping to the next cell
      e.stopPropagation();
      return;
    }
    if (e.key === 'Escape') {
      e.stopPropagation();
      escaped = true;
      release(sheet);
      return;
    }
    if (!escaped) activate(sheet, isCell(sheet, e.target) ? e.target : rovingCell);
  });

  // Closing the cell editor removes the focused input, dropping focus to the body
  chain(sheet, 'oneditionend', () => {
    setTimeout(() => {
      const { activeElement } = document;
      const lost = !activeElement || activeElement === document.body;
      if (lost && window.jspreadsheet.current === sheet) {
        (getActiveCell(sheet) ?? rovingCell)?.focus({ preventScroll: true });
      }
    });
  });

  el.addEventListener('focusout', () => {
    // Closing the editor is handled by oneditionend above
    if (sheet.edition) return;
    setTimeout(() => {
      if (sheet.edition || el.contains(document.activeElement)) return;
      release(sheet);
    });
  });
}
