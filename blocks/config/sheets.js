// Sheets of the org/site config the editor reads. Key/value settings live in `data` (AEM Assets)
// or `flags` (ew.*); the others hold rows. `data` is also the name DA gives an unnamed sheet.
// Every helper below takes the sheet name explicitly.
export const SHEETS = {
  data: 'data',
  flags: 'flags',
  library: 'library',
  apps: 'apps',
  prepare: 'prepare',
  msm: 'msm',
};

// Content sheet files (library lists, placeholders) are read by the editor from their first
// sheet, whatever its name. A file that doesn't exist yet gets a `data` sheet.
export function firstSheetName(json) {
  if (json?.[':type'] === 'multi-sheet') return json[':names']?.[0] ?? SHEETS.data;
  return json?.[':sheetname'] ?? SHEETS.data;
}

export function getRows(json, sheet) {
  if (!json) return [];
  const isMulti = json[':type'] === 'multi-sheet';
  const rows = isMulti ? json[sheet]?.data : firstSheetName(json) === sheet && json.data;
  return Array.isArray(rows) ? rows : [];
}

export function getValue(json, key, sheet) {
  return getRows(json, sheet).find((row) => row.key === key)?.value ?? '';
}

const emptyData = () => ({ total: 0, limit: 0, offset: 0, data: [] });

// A config or content file with one empty sheet.
export const emptySheet = (name) => ({ ...emptyData(), ':sheetname': name, ':type': 'sheet' });

function setSheetData(sheet, rows) {
  sheet.data = rows;
  sheet.total = rows.length;
  sheet.limit = rows.length;
}

// Returns a copy that has the named sheet, plus that sheet. Existing sheets and their order
// are kept. A missing `data` sheet is added first (the editor reads AEM settings from the
// first sheet); any other missing sheet is added last so it never displaces `data`. A new file
// gets a single `data` sheet, or a multi-sheet so a named tab (translate `config`) keeps its name.
function withSheet(json, sheet) {
  if (!json && sheet === SHEETS.data) {
    const config = emptySheet(sheet);
    return { config, sheet: config };
  }
  if (!json) return withSheet({ ':names': [], ':version': 3, ':type': 'multi-sheet' }, sheet);

  let config = structuredClone(json);
  if (config[':type'] !== 'multi-sheet') {
    const { ':sheetname': name = SHEETS.data, ':type': _, ':private': priv, ...rest } = config;
    if (name === sheet) {
      config.data ??= [];
      return { config, sheet: config };
    }
    config = { [name]: rest, ':names': [name], ':version': 3, ':type': 'multi-sheet' };
    if (priv) config[':private'] = priv;
  }

  if (!config[sheet]) {
    const names = config[':names'] ?? [];
    config[sheet] = emptyData();
    config[':names'] = sheet === SHEETS.data ? [sheet, ...names] : [...names, sheet];
  }
  return { config, sheet: config[sheet] };
}

// Applies { key: value } changes to the named sheet; '' removes the key.
// Resolves to { config, changed } like the permissions mutators.
export function applyValues(json, changes, sheetName) {
  const entries = Object.entries(changes)
    .filter(([key, value]) => getValue(json, key, sheetName) !== value);
  if (entries.length === 0) return { config: json, changed: false };

  const { config, sheet } = withSheet(json, sheetName);
  const rows = entries.reduce((acc, [key, value]) => {
    const idx = acc.findIndex((row) => row.key === key);
    const next = acc.filter((row) => row.key !== key);
    // Rows before the first match never hold `key`, so `idx` is still the right slot.
    if (value !== '') next.splice(idx === -1 ? next.length : idx, 0, { ...acc[idx], key, value });
    return next;
  }, sheet.data);
  setSheetData(sheet, rows);
  return { config, changed: true };
}

// Replaces all rows of the named sheet. Resolves to { config, changed } like applyValues.
export function setRows(json, rows, sheetName) {
  if (JSON.stringify(getRows(json, sheetName)) === JSON.stringify(rows)) {
    return { config: json, changed: false };
  }
  const { config, sheet } = withSheet(json, sheetName);
  setSheetData(sheet, rows);
  return { config, changed: true };
}
