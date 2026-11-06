// jspreadsheet-ce gives each grid tabindex="1" and handles keys on the whole
// document while a grid is "current", only releasing it on an outside mouse
// click. Keyboard users get pulled into the grid first and can never leave.

function activate(sheet) {
  const lib = window.jspreadsheet;
  if (lib.current !== sheet) {
    lib.current?.resetSelection?.();
    lib.current = sheet;
  }
  if (!sheet.selectedCell) sheet.updateSelectionFromCoords(0, 0, 0, 0);
}

function release(sheet) {
  const lib = window.jspreadsheet;
  if (lib.current !== sheet) return;
  sheet.resetSelection(true);
  lib.current = null;
}

export default function makeKeyboardAccessible(sheet) {
  const { el } = sheet;
  if (!el) return;

  el.setAttribute('tabindex', '0');

  // After Escape, stay inactive until the grid is focused or clicked again
  let escaped = false;

  el.addEventListener('focus', () => {
    escaped = false;
    activate(sheet);
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
    if (!escaped) activate(sheet);
  });

  // Closing the cell editor removes the focused input, dropping focus to the body
  const { oneditionend } = sheet.options;
  sheet.options.oneditionend = (...args) => {
    oneditionend?.(...args);
    setTimeout(() => {
      const { activeElement } = document;
      const lost = !activeElement || activeElement === document.body;
      if (lost && window.jspreadsheet.current === sheet) el.focus({ preventScroll: true });
    });
  };

  el.addEventListener('focusout', () => {
    // Closing the editor is handled by oneditionend above
    if (sheet.edition) return;
    setTimeout(() => {
      if (sheet.edition || el.contains(document.activeElement)) return;
      release(sheet);
    });
  });
}
