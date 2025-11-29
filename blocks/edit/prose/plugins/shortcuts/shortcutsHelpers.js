// Detect if we're on Mac
export const isMac = typeof navigator !== 'undefined' && (
  /Mac/.test(navigator.platform)
  || /Mac/.test(navigator.userAgentData?.platform)
  || navigator.platform === 'MacIntel'
);
export const modSymbol = isMac ? '⌘' : 'Ctrl';
export const altSymbol = isMac ? '⌥' : 'Alt';
export const shiftSymbol = '⇧';

// Centralized keyboard shortcuts mapping
export const SHORTCUTS = {
  // Text formatting
  BOLD: 'Mod-B',
  ITALIC: 'Mod-I',
  UNDERLINE: 'Mod-U',
  LINK: 'Mod-K',

  // Block types
  PARAGRAPH: 'Mod-Alt-0',
  H1: 'Mod-Alt-1',
  H2: 'Mod-Alt-2',
  H3: 'Mod-Alt-3',
  H4: 'Mod-Alt-4',
  H5: 'Mod-Alt-5',
  H6: 'Mod-Alt-6',

  // History
  UNDO: 'Mod-Z',
  REDO: 'Mod-Shift-Z',

  // Other
  LIBRARY: 'Mod-Shift-L',
};

/**
 * Formats a keyboard shortcut for display
 * @param {string} shortcut - Shortcut in format 'Mod-Alt-1'
 * @returns {string} Formatted shortcut like '⌘⌥1'
 */
export function formatShortcut(shortcut) {
  if (!shortcut) return '';

  return shortcut
    .replace(/Mod/g, modSymbol)
    .replace(/Alt/g, altSymbol)
    .replace(/Shift/g, shiftSymbol)
    .replace(/-/g, '');
}
