import { convertSheets, debounce, saveToDa } from '../../edit/utils/helpers.js';

const DEBOUNCE_TIME = 1000;
export const SHEET_DIRTY_EVENT = 'sheet-dirty';

export const saveSheets = async (sheets) => {
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

const debouncedSaveSheets = debounce(saveSheets, DEBOUNCE_TIME);

export function handleSave(jexcel, view) {
  const daTitle = document.querySelector('da-title');
  const isDotDaSheet = view === 'sheet' && daTitle?.details?.fullpath?.includes('/.da/');

  if (view === 'config' || isDotDaSheet) {
    document.dispatchEvent(new Event(SHEET_DIRTY_EVENT));
    return;
  }

  debouncedSaveSheets(jexcel);
}
