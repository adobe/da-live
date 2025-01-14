import { convertSheets, saveToDa } from '../../edit/utils/helpers.js';

const DEBOUNCE_TIME = 1000;

function debounce(func, wait) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

export const saveSheets = async (sheets) => {
  const daTitle = document.querySelector('da-title');
  document.querySelector('da-sheet-panes').data = convertSheets(sheets);

  const { hash } = window.location;
  const pathname = hash.replace('#', '');
  const dasSave = await saveToDa(pathname, sheets);
  if (!dasSave.ok) {
    // eslint-disable-next-line no-console
    console.error('Error saving sheet', dasSave);
    return false;
  }
  return true;
};

export const debouncedSaveSheets = debounce(saveSheets, DEBOUNCE_TIME);
