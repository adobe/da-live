import { convertSheets, saveToDa } from '../../edit/utils/helpers.js';
import { getNx2Api } from '../../../scripts/utils.js';

const DEBOUNCE_TIME = 1000;
const POLL_INTERVAL = 30000;

class StaleCheck {
  constructor() {
    this._intervalId = null;
    this._doc = null;
    this._lastJsonString = null;
    this._hasLocalEdits = false;
    this._saveBlocked = false;
    this._onStale = null;
  }

  // `details` is the pathDetails object ({ org, site, path, view }).
  start({ details, onStale }) {
    if (this._intervalId) clearInterval(this._intervalId);
    this._doc = details;
    this._onStale = onStale;
    this._intervalId = setInterval(() => this.checkForDrift(), POLL_INTERVAL);
  }

  stop() {
    if (this._intervalId) clearInterval(this._intervalId);
    this._intervalId = null;
    this._doc = null;
    this._lastJsonString = null;
    this._hasLocalEdits = false;
    this._saveBlocked = false;
    this._onStale = null;
  }

  markSynced(json) {
    this._lastJsonString = JSON.stringify(json);
    this._hasLocalEdits = false;
    // Clear the post-Cancel block: a fresh sync (load or save) is the recovery path.
    this._saveBlocked = false;
  }

  markEdited() {
    this._hasLocalEdits = true;
  }

  blockSaves() {
    this._saveBlocked = true;
  }

  get isBlocked() {
    return this._saveBlocked;
  }

  // Returns true if drift was detected (caller should not write).
  // Skips while blocked so a stale dialog doesn't keep re-firing on subsequent edits/polls.
  async checkForDrift() {
    if (this._saveBlocked) return true;
    try {
      const { config, source } = await getNx2Api();
      const { org, site, path, view } = this._doc;

      const resp = view === 'config'
        ? await config.get({ org, site })
        : await source.get({ org, site, path });
      if (!resp.ok) return false;
      const json = await resp.json();
      const text = JSON.stringify(json);
      if (text === this._lastJsonString) return false;
      this._onStale({ json, dirty: this._hasLocalEdits });
      return true;
    } catch {
      // swallow transient errors; retry next tick
      return false;
    }
  }
}

export const staleCheck = new StaleCheck();

export const saveSheets = async (sheets) => {
  const convertedJson = convertSheets(sheets);
  document.querySelector('da-sheet-panes').data = convertedJson;

  // Bail before writing if the remote moved out from under us — protects against
  // last-write-wins between concurrent editors. Drift triggers the onStale flow.
  if (await staleCheck.checkForDrift()) return false;

  const { hash } = window.location;
  const pathname = hash.replace('#', '');
  const dasSave = await saveToDa(pathname, sheets);
  if (!dasSave.ok) {
    // eslint-disable-next-line no-console
    console.error('Error saving sheet', dasSave);
    return false;
  }
  staleCheck.markSynced(convertedJson);
  return true;
};

// A debounced saveSheets wrapper we can also flush and await. Kept module-local
// so preview/publish can drain a pending or in-flight background save before
// issuing their own write — otherwise the two writes can race last-write-wins.
let pendingTimer = null;
let pendingSheets = null;
let inflightSave = null;

function runSave(sheets) {
  const promise = saveSheets(sheets);
  inflightSave = promise;
  promise.finally(() => {
    if (inflightSave === promise) inflightSave = null;
  });
  return promise;
}

function scheduleSave(sheets) {
  pendingSheets = sheets;
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    const next = pendingSheets;
    pendingSheets = null;
    if (next) runSave(next);
  }, DEBOUNCE_TIME);
}

export async function flushPendingSave() {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
    const next = pendingSheets;
    pendingSheets = null;
    if (next) runSave(next);
  }
  if (inflightSave) {
    try { await inflightSave; } catch { /* swallowed — caller re-issues its own save */ }
  }
}

export async function restoreVersion(daTitle, daSheet, versionData) {
  const initSheet = (await import('./index.js')).default;
  daTitle.sheet = await initSheet(daSheet, versionData);
  return saveSheets(daSheet.jexcel);
}

export function handleSave(jexcel, view) {
  // markEdited must precede the config bail so config edits still mark dirty for stale-detection.
  staleCheck.markEdited();
  if (view === 'config') return;
  if (staleCheck.isBlocked) return;
  scheduleSave(jexcel);
}

export async function showDaDialog({ title, body, confirmLabel }) {
  await import('../../shared/da-dialog/da-dialog.js');
  return new Promise((resolve) => {
    const daDialog = document.createElement('da-dialog');
    daDialog.title = title;

    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      daDialog.remove();
      resolve(result);
    };

    daDialog.action = {
      label: confirmLabel,
      click: () => finish('confirm'),
    };

    const bodyNode = typeof body === 'string'
      ? Object.assign(document.createElement('p'), { textContent: body })
      : body;
    daDialog.append(bodyNode);

    daDialog.addEventListener('close', () => finish('cancel'));
    document.body.append(daDialog);
  });
}

// Convert a 1-indexed column number into the spreadsheet letter (1 → A, 26 → Z,
// 27 → AA, ...). Values ≤ 0 return an empty string.
export function colIndexToLetter(n) {
  let x = n;
  let s = '';
  while (x > 0) {
    const rem = (x - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

// Mirrors the drop rule in formatSheetData: any column whose header cell is
// falsy is discarded on save. Returns one entry per affected sheet, listing the
// 1-indexed column numbers whose data would be lost.
export function findColumnsWithDataButNoHeader(sheets) {
  const affected = [];
  sheets.forEach((sheet) => {
    const data = sheet.getData?.();
    if (!data?.length) return;
    const [headers, ...rows] = data;
    if (!headers) return;
    const cols = [];
    headers.forEach((header, colIdx) => {
      if (header) return;
      const hasData = rows.some((row) => {
        const cell = row?.[colIdx];
        return cell !== undefined && cell !== null && String(cell) !== '';
      });
      if (hasData) cols.push(colIdx + 1);
    });
    if (cols.length) affected.push({ name: sheet.name, cols });
  });
  return affected;
}

export async function confirmSaveWithMissingHeaders(affected) {
  const body = document.createElement('div');
  const intro = document.createElement('p');
  intro.textContent = 'These columns have data but no header. Their data will be lost when the sheet is saved:';
  body.append(intro);

  const list = document.createElement('ul');
  affected.forEach(({ name, cols }) => {
    const item = document.createElement('li');
    const label = cols.length === 1 ? 'Column' : 'Columns';
    const letters = cols.map(colIndexToLetter).join(', ');
    item.textContent = `Sheet "${name}" — ${label} ${letters}`;
    list.append(item);
  });
  body.append(list);

  const outro = document.createElement('p');
  outro.textContent = 'Add a header to keep the column, or save anyway to drop it.';
  body.append(outro);

  const result = await showDaDialog({
    title: 'Columns without headers',
    body,
    confirmLabel: 'Save anyway',
  });
  return result === 'confirm';
}
