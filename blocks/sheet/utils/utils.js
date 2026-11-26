import { convertSheets, saveToDa } from '../../edit/utils/helpers.js';
import { getNx2Api } from '../../../scripts/utils.js';

const DEBOUNCE_TIME = 1000;
const POLL_INTERVAL = 30000;
let saveTimer;

// Cloudflare downgrades strong ETags to weak (W/"...") whenever it transforms a
// response body (e.g. gzip/brotli on GETs), so the same file's POST response and a
// later GET can carry the identical hash with and without the W/ prefix. Strip it
// before comparing, or every save after the first misfires drift detection.
const normalizeEtag = (etag) => etag?.replace(/^W\//, '') ?? null;

class StaleCheck {
  constructor() {
    this._intervalId = null;
    this._doc = null;
    this._lastEtag = null;
    this._hasLocalEdits = false;
    this._saveBlocked = false;
    this._onStale = null;
    // Set while a POST is in flight so reads (drift + reload) queue behind it.
    this._pendingSave = null;
    // Monotonic edit counter, bumped on every edit. runSave snapshots it into
    // _savingSeq for the POST it's about to make; markSynced then clears the
    // dirty flag only if no edit has landed since, so edits typed while a save
    // was in flight keep the indicator in "saving". Null when no save is live.
    this._editSeq = 0;
    this._savingSeq = null;
    this._conditionalSession = null;
  }

  // `details` is the pathDetails object ({ org, site, path, view }).
  start({ details, onStale }) {
    if (this._intervalId) clearInterval(this._intervalId);
    this._doc = details;
    this._onStale = onStale;
    this._intervalId = setInterval(() => this.checkForDrift(), POLL_INTERVAL);
  }

  stop() {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    if (this._intervalId) clearInterval(this._intervalId);
    this._intervalId = null;
    this._doc = null;
    this._lastEtag = null;
    const wasDirty = this._hasLocalEdits;
    this._hasLocalEdits = false;
    this._saveBlocked = false;
    this._onStale = null;
    // Detach so a new file's load isn't gated on the previous file's save.
    this._pendingSave = null;
    this._editSeq = 0;
    this._savingSeq = null;
    this._conditionalSession = null;
    if (wasDirty) document.dispatchEvent(new CustomEvent('sheet-clean'));
  }

  markSynced(etag) {
    this._lastEtag = normalizeEtag(etag);
    // Clear the post-Cancel block: a fresh sync (load or save) is the recovery path.
    this._saveBlocked = false;
    // If edits landed since the in-flight save snapshotted its body, a follow-up
    // save is queued — stay "unsaved" so the indicator keeps showing "saving".
    // (_savingSeq is null outside a save, e.g. load/version restore → clear.)
    if (this._savingSeq !== null && this._savingSeq !== this._editSeq) return;
    const wasDirty = this._hasLocalEdits;
    this._hasLocalEdits = false;
    if (wasDirty) document.dispatchEvent(new CustomEvent('sheet-clean'));
  }

  markEdited() {
    this._editSeq += 1;
    const wasClean = !this._hasLocalEdits;
    this._hasLocalEdits = true;
    if (wasClean) document.dispatchEvent(new CustomEvent('sheet-dirty'));
  }

  blockSaves() {
    this._saveBlocked = true;
  }

  get isBlocked() {
    return this._saveBlocked;
  }

  get isDirty() { return this._hasLocalEdits; }

  setConditionalSession(session) { this._conditionalSession = session; }

  get conditionalSession() { return this._conditionalSession; }

  // Loops so a save that started mid-wait is also awaited.
  async awaitPendingSave() {
    while (this._pendingSave) {
      // eslint-disable-next-line no-await-in-loop
      await this._pendingSave;
    }
  }

  async runSave(saveOp) {
    await this.awaitPendingSave();
    // Snapshot the edit seq now — saveOp builds the POST body synchronously
    // before its first await, so this exactly labels the content being sent.
    this._savingSeq = this._editSeq;
    let resolve;
    const p = new Promise((r) => { resolve = r; });
    this._pendingSave = p;
    try {
      return await saveOp();
    } finally {
      resolve();
      this._savingSeq = null;
      if (this._pendingSave === p) this._pendingSave = null;
    }
  }

  // Returns true if drift was detected (caller should not write).
  // Skips while blocked so a stale dialog doesn't keep re-firing on subsequent edits/polls.
  async checkForDrift() {
    if (this._saveBlocked) return true;
    await this.awaitPendingSave();
    try {
      const { config, source } = await getNx2Api();
      const { org, site, path, view } = this._doc;

      const resp = view === 'config'
        ? await config.get({ org, site, cachebust: true })
        : await source.get({ org, site, path, cachebust: true });
      if (!resp.ok) return false;
      const etag = normalizeEtag(resp.headers.get('etag'));
      if (!etag || !this._lastEtag || etag === this._lastEtag) return false;
      const json = await resp.json();
      this._onStale({ json, dirty: this._hasLocalEdits });
      return true;
    } catch {
      // swallow transient errors; retry next tick
      return false;
    }
  }
}

export const staleCheck = new StaleCheck();

const reportSaveError = (message) => document.dispatchEvent(new CustomEvent('sheet-save-error', { detail: { message } }));

export const saveSheets = async (sheets, expectedHref = window.location.href) => {
  const session = staleCheck.conditionalSession;

  // Bail before writing if the remote moved out from under us — protects against
  // last-write-wins between concurrent editors. Drift triggers the onStale flow.
  if (staleCheck.isBlocked || (!session && await staleCheck.checkForDrift())) return false;

  try {
    if (window.location.href !== expectedHref) throw new Error('The Sheet context changed. Copy your edits.');
    return await staleCheck.runSave(async () => {
      if (window.location.href !== expectedHref || session !== staleCheck.conditionalSession) {
        throw new Error('The Sheet context changed. Copy your edits.');
      }
      const json = convertSheets(sheets);
      const panes = document.querySelector('da-sheet-panes');
      if (panes) panes.data = json;
      const pathname = new URL(expectedHref).hash.replace('#', '');
      const response = session
        ? await session.save(JSON.stringify(json)) : await saveToDa(pathname, sheets);
      if (!response?.ok) throw new Error(`Sheet save failed (${response?.status ?? 'no response'}). Copy your edits.`);
      staleCheck.markSynced(response.headers.get('etag'));
      reportSaveError('');
      return true;
    });
  } catch (error) {
    reportSaveError(error.message || 'Sheet save failed. Copy your edits.');
    return false;
  }
};

export async function forceSaveSheets(element) {
  if (!element?.jexcel) return { ok: false, error: 'The Sheet is not ready to save.' };
  const tabs = element.parentElement?.querySelector('da-sheet-tabs');
  if (tabs?.hasPendingEdit) return { ok: false, error: 'Finish or cancel the Sheet tab rename first.' };
  clearTimeout(saveTimer);
  for (const sheet of element.jexcel) {
    if (sheet.edition) sheet.closeEditor(sheet.edition[0], true);
  }
  clearTimeout(saveTimer);
  saveTimer = undefined;
  await staleCheck.awaitPendingSave();
  while (staleCheck.isDirty) {
    if (!await saveSheets(element.jexcel)) return { ok: false, error: 'Sheet save was not confirmed. Copy your edits.' };
  }
  return { ok: true };
}

export async function restoreVersion(daTitle, daSheet, versionData) {
  const initSheet = (await import('./index.js')).default;
  daTitle.sheet = await initSheet(daSheet, versionData);
  staleCheck.markEdited();
  return saveSheets(daSheet.jexcel);
}

export function handleSave(jexcel, view) {
  // markEdited must precede the config bail so config edits still mark dirty for stale-detection.
  staleCheck.markEdited();
  if (view === 'config') return;
  if (staleCheck.isBlocked) return;
  clearTimeout(saveTimer);
  const { href } = window.location;
  saveTimer = setTimeout(() => { saveSheets(jexcel, href); }, DEBOUNCE_TIME);
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

// Mirrors formatSheetData's drop rule: columns with a falsy header lose their data on save.
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
